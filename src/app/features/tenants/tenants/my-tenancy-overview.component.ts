import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { LowerCasePipe } from '@angular/common';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { BILLING_TIMING_LABELS, BILLING_TYPE_LABELS } from '../../rent/catalog/charge-labels';
import { ChargeTemplate, TenantDeposit } from '../../rent/models/rent.models';
import { RentService } from '../../rent/rent.service';
import { NotificationService } from '../../../core/services/notification.service';
import { MyTenancyContact, MyTenancyOverview } from '../models/tenant.models';
import { TenantsService } from '../tenants.service';

/**
 * Everything about a tenancy that concerns its tenant, read-only: their home,
 * who to call, how and where to pay, what is billed each month, the house
 * rules, the deposit and its history, and the rooms they have had. (Payments
 * are in the rent panel beside it.) The agency manages all of it; nothing here is editable.
 */
@Component({
  selector: 'app-my-tenancy-overview',
  standalone: true,
  imports: [SectionCardComponent, LoadingStateComponent, ErrorStateComponent, StatusChipComponent, HumanLabelPipe, LowerCasePipe],
  template: `
    @if (loading()) {
      <app-loading-state class="wide" [compact]="true" label="Loading your tenancy..." />
    } @else if (error()) {
      <app-error-state class="wide" [message]="error()!" (retry)="load()" />
    } @else if (view(); as t) {
      <div class="cards">
        <!-- Paired with "Who to call": what to pay and where, then who to ring about it. -->
        <app-section-card title="Rent and how to pay">
          <dl class="facts">
            <div><dt>Monthly rent</dt><dd>KES {{ money(t.monthlyRent) }}</dd></div>
            <div><dt>Due</dt><dd>{{ t.paymentDueDay ? 'On the ' + ordinal(t.paymentDueDay) + ' of each month' : '-' }}</dd></div>
            @if (t.gracePeriodDays) { <div><dt>Grace period</dt><dd>{{ t.gracePeriodDays }} days</dd></div> }
            @if (positive(t.lateFeeAmount)) { <div><dt>Late fee</dt><dd>KES {{ money(t.lateFeeAmount) }}</dd></div> }
          </dl>
          @if (t.mpesaPaybill || t.bankAccount) {
            <h3 class="panel-title">Pay to</h3>
            <!-- Each value one tap from the clipboard: these get typed into a phone, digit by digit. -->
            <ul class="copy-list">
              @if (t.mpesaPaybill) {
                <li><span class="copy-list__label">M-Pesa paybill</span><span class="mono copy-list__value">{{ t.mpesaPaybill }}</span>
                  <button type="button" class="icon-action icon-action--sm" (click)="copy(t.mpesaPaybill, 'Paybill')" [attr.aria-label]="'Copy paybill ' + t.mpesaPaybill" title="Copy">
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-copy" /></svg>
                  </button></li>
              }
              @if (t.mpesaAccount) {
                <li><span class="copy-list__label">Account number</span><span class="mono copy-list__value">{{ t.mpesaAccount }}</span>
                  <button type="button" class="icon-action icon-action--sm" (click)="copy(t.mpesaAccount, 'Account number')" [attr.aria-label]="'Copy account number ' + t.mpesaAccount" title="Copy">
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-copy" /></svg>
                  </button></li>
              }
              @if (t.bankAccount) {
                <li><span class="copy-list__label">Bank</span><span class="mono copy-list__value">{{ t.bankAccount }}</span>
                  <button type="button" class="icon-action icon-action--sm" (click)="copy(t.bankAccount, 'Bank account')" [attr.aria-label]="'Copy bank account ' + t.bankAccount" title="Copy">
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-copy" /></svg>
                  </button></li>
              }
            </ul>
            <p class="hint">After paying, use “Report a payment” on your bill so your landlord can confirm it.</p>
          }
        </app-section-card>

        <app-section-card title="Who to call" subtitle="For repairs, questions or emergencies.">
          @if (t.contacts.length === 0) {
            <p class="muted">Your building has no contacts listed yet — ask your agency for a number to call.</p>
          } @else {
            <ul class="contacts">
              @for (contact of shownContacts(); track $index) {
                <li class="contact" [class.contact--emergency]="contact.kind === 'EMERGENCY'">
                  <span class="contact__badge" aria-hidden="true">{{ initials(contact.name || contact.role) }}</span>
                  <div class="contact__body">
                    <div class="contact__head">
                      <strong>{{ contact.name || contact.role }}</strong>
                      @if (contact.role) { <span class="contact__role">{{ contact.role }}</span> }
                    </div>
                    @if (contact.availability || contact.notes) {
                      <span class="muted contact__meta">{{ contact.availability }}@if (contact.availability && contact.notes) { · }{{ contact.notes }}</span>
                    }
                    @for (number of numbers(contact); track number.label) {
                      <span class="contact__number">
                        <span class="mono">{{ number.value }}</span>
                        @if (number.label !== 'Phone') { <span class="muted contact__meta">{{ number.label }}</span> }
                        <button type="button" class="icon-action icon-action--sm" (click)="copy(number.value, 'Number')"
                                [attr.aria-label]="'Copy ' + number.value" title="Copy number">
                          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-copy" /></svg>
                        </button>
                      </span>
                    }
                    <span class="contact__ways">
                      @if (contact.phone) { <a class="btn btn-primary btn-sm" [href]="'tel:' + contact.phone">Call</a> }
                      @if (contact.whatsapp) {
                        <a class="btn btn-secondary btn-sm" [href]="whatsappLink(contact.whatsapp)" target="_blank" rel="noopener">WhatsApp</a>
                      }
                      @if (contact.email) { <a class="btn btn-secondary btn-sm" [href]="'mailto:' + contact.email">Email</a> }
                    </span>
                  </div>
                </li>
              }
            </ul>
            @if (t.contacts.length > shownContacts().length) {
              <button type="button" class="btn btn-secondary btn-sm more" (click)="allContacts.set(true)">Show all {{ t.contacts.length }}</button>
            }
          }
        </app-section-card>

        <app-section-card title="Monthly charges" subtitle="Billed on top of rent each month, unless included.">
          @if (t.monthlyCharges.length === 0) {
            <p class="muted">No monthly charges — you pay rent only.</p>
          } @else {
            <div class="table-scroll">
              <table class="table table--packed">
                <thead><tr><th>Charge</th><th>Amount</th><th>How it's billed</th></tr></thead>
                <tbody>
                  @for (charge of shownCharges(); track charge.id) {
                    <tr>
                      <td>
                        <div class="cell-stack">
                          <span>{{ charge.name }}</span>
                          @if (charge.level === 'TENANT') { <span class="muted">Agreed for you</span> }
                          @if (charge.includedInRent) { <span class="muted">Included in rent</span> }
                        </div>
                      </td>
                      <td>{{ chargeAmount(charge) }}</td>
                      <td>
                        <div class="cell-stack">
                          <span>{{ charge.billingType ? typeLabels[charge.billingType] : '-' }}</span>
                          @if (charge.billingTiming) { <span class="muted">For {{ timingLabels[charge.billingTiming] | lowercase }}</span> }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (t.monthlyCharges.length > shownCharges().length) {
              <button type="button" class="btn btn-secondary btn-sm more" (click)="allCharges.set(true)">Show all {{ t.monthlyCharges.length }}</button>
            }
          }
        </app-section-card>

        <!-- The place: what was paid to hold it, the rules that come with it, and the rooms they have had there. -->
        <app-section-card title="Your home" [subtitle]="t.agencyName || null">
          <dl class="facts">
            <div><dt>Room</dt><dd>{{ t.roomName || '-' }}@if (t.floorName) { <span class="muted"> · {{ t.floorName }}</span> }</dd></div>
            <div><dt>Building</dt><dd>{{ t.buildingName || '-' }}</dd></div>
            <div><dt>Moved in</dt><dd>{{ date(t.moveInDate) }}</dd></div>
            <div><dt>Status</dt><dd><app-status-chip [status]="t.status" /></dd></div>
            @if (t.noticeGivenDate) { <div><dt>Notice given</dt><dd>{{ date(t.noticeGivenDate) }}</dd></div> }
            @if (t.moveOutDate) { <div><dt>Moving out</dt><dd>{{ date(t.moveOutDate) }}</dd></div> }
          </dl>
          @if (t.buildingAddress) { <p>{{ t.buildingAddress }}@if (t.directions) { <span class="muted"> — {{ t.directions }}</span> }</p> }
          @if ((t.amenities ?? []).length > 0) {
            <ul class="pills">@for (amenity of t.amenities ?? []; track amenity) { <li>{{ amenity }}</li> }</ul>
          }

          <!-- The deposit record when there is one; the agreed figure from the terms only as a fallback. -->
          @if (deposit(); as d) {
            <h3 class="panel-title">Deposit</h3>
            <dl class="facts">
              <div><dt>Agreed</dt><dd>KES {{ money(d.expectedAmount) }}</dd></div>
              <div><dt>Paid</dt><dd>KES {{ money(d.amountReceived) }}</dd></div>
              <div><dt>Held</dt><dd>KES {{ money(d.heldAmount) }}</dd></div>
              <div><dt>Status</dt><dd><app-status-chip [status]="d.status" /></dd></div>
            </dl>
            @if ((d.transactions ?? []).length > 0) {
              <ul class="lines">
                @for (entry of (allDeposit() ? d.transactions ?? [] : (d.transactions ?? []).slice(0, 3)); track entry.id) {
                  <li>
                    <span class="muted">{{ date(entry.transactionDate || entry.createdAt) }}</span>
                    <span>{{ entry.type | humanLabel }}</span>
                    <span class="lines__amount">KES {{ money(entry.amount) }}</span>
                    @if (entry.reason) { <span class="muted lines__note">{{ entry.reason }}</span> }
                  </li>
                }
              </ul>
              @if (!allDeposit() && (d.transactions ?? []).length > 3) {
                <button type="button" class="btn btn-secondary btn-sm more" (click)="allDeposit.set(true)">Show all {{ (d.transactions ?? []).length }}</button>
              }
            }
          } @else if (positive(t.securityDeposit)) {
            <h3 class="panel-title">Deposit</h3>
            <p>KES {{ money(t.securityDeposit) }} agreed</p>
          }

          @if (t.noticePeriodDays || t.utilitiesNote) {
            <h3 class="panel-title">House rules</h3>
            <dl class="facts">
              @if (t.noticePeriodDays) { <div><dt>Notice to move out</dt><dd>{{ t.noticePeriodDays }} days</dd></div> }
            </dl>
            @if (t.utilitiesNote) { <p class="muted">{{ t.utilitiesNote }}</p> }
          }

          @if (t.roomHistory.length > 0) {
            <h3 class="panel-title">Rooms</h3>
            <ul class="lines">
              @for (stay of t.roomHistory; track $index) {
                <li>
                  <strong>{{ stay.roomName }}</strong>
                  <span class="muted">{{ stay.buildingName }}</span>
                  <span>{{ date(stay.moveInDate) }} – {{ stay.current ? 'now' : date(stay.moveOutDate) }}</span>
                  @if (stay.rentAmount) { <span class="lines__amount muted">KES {{ money(stay.rentAmount) }}/mo</span> }
                  @if (stay.moveOutReason) { <span class="muted lines__note">{{ stay.moveOutReason }}</span> }
                </li>
              }
            </ul>
          }
        </app-section-card>

        <p class="muted readonly-note wide">Something wrong here? Your agency keeps these records — call them using the numbers above.</p>
      </div>
    }
  `,
  styles: [`
    /* Cards are items of the dashboard's grid, which pairs them; .wide takes a whole row. */
    :host, .cards { display: contents; }
    .wide { grid-column: 1 / -1; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: 0.6rem 1rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; min-width: 0; }
    .facts dt { font-size: 0.74rem; color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .panel-title { margin: 0.5rem 0 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .pills { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0; padding: 0; list-style: none; }
    .pills li { padding: 0.15rem 0.6rem; border-radius: 999px; background: var(--surface-2); font-size: 0.8rem; }
    /* Short ruled lines, not boxes: a list inside a card needs no second border. */
    .lines, .contacts { display: grid; margin: 0; padding: 0; list-style: none; }
    .lines li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.75rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
    .lines li:last-child { border-bottom: 0; }
    .lines__amount { margin-left: auto; font-variant-numeric: tabular-nums; }
    .lines__note { flex-basis: 100%; font-size: 0.82rem; }
    .contact { display: flex; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
    .contact:first-child { padding-top: 0.15rem; }
    .contact:last-child { border-bottom: 0; padding-bottom: 0; }
    .contact__badge { display: grid; place-items: center; flex: none; width: 2.4rem; height: 2.4rem; border-radius: 50%;
                      background: var(--primary-tint); color: var(--primary-strong); font-weight: 700; font-size: 0.85rem; }
    .contact--emergency .contact__badge { background: var(--danger-tint); color: var(--danger); }
    .contact__body { display: grid; gap: 0.2rem; min-width: 0; flex: 1; }
    .contact__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.5rem; }
    .contact__role { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .contact__meta { font-size: 0.84rem; }
    .contact__number { display: inline-flex; align-items: center; gap: 0.4rem; }
    .contact__ways { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.3rem; }
    .icon-action--sm { width: 1.75rem; height: 1.75rem; }
    .icon-action--sm svg { width: 0.95rem; height: 0.95rem; }
    .copy-list { display: grid; margin: 0; padding: 0; list-style: none; }
    .copy-list li { display: flex; align-items: center; gap: 0.5rem 0.75rem; padding: 0.35rem 0; border-bottom: 1px solid var(--border); }
    .copy-list li:last-child { border-bottom: 0; }
    .copy-list__label { flex: 0 0 8.5rem; font-size: 0.8rem; color: var(--text-muted); }
    .copy-list__value { font-weight: 700; overflow-wrap: anywhere; margin-right: auto; }
    .more { justify-self: start; }
    .readonly-note { font-size: 0.82rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyTenancyOverviewComponent {
  readonly typeLabels = BILLING_TYPE_LABELS;
  readonly timingLabels = BILLING_TIMING_LABELS;

  readonly tenantId = input.required<number>();

  private readonly tenants = inject(TenantsService);
  private readonly rent = inject(RentService);
  private readonly notifications = inject(NotificationService);

  readonly view = signal<MyTenancyOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly deposits = signal<TenantDeposit[]>([]);

  readonly allContacts = signal(false);
  readonly allCharges = signal(false);
  readonly allDeposit = signal(false);

  /** Long lists open on their first few, so paired cards stay a similar height. */
  readonly shownContacts = computed(() => {
    const contacts = this.view()?.contacts ?? [];
    return this.allContacts() ? contacts : contacts.slice(0, 3);
  });

  readonly shownCharges = computed(() => {
    const charges = this.view()?.monthlyCharges ?? [];
    return this.allCharges() ? charges : charges.slice(0, 5);
  });

  readonly deposit = computed(() => this.deposits().find((item) => item.tenantId === this.tenantId()) ?? null);


  constructor() {
    effect(() => {
      this.tenantId();
      untracked(() => void this.load());
    });
  }

  async load(): Promise<void> {
    const tenantId = this.tenantId();
    this.loading.set(true);
    this.error.set(null);
    try {
      // The overview is the page; the deposit fills in beside it and may fail alone.
      const [view] = await Promise.all([
        firstValueFrom(this.tenants.getMyTenancyOverview(tenantId)),
        firstValueFrom(this.rent.getMyDeposits()).then((items) => this.deposits.set(items), () => this.deposits.set([]))
      ]);
      this.view.set(view);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** The numbers to show: the call line, and WhatsApp too when it is a different number. */
  numbers(contact: MyTenancyContact): { label: string; value: string }[] {
    const list: { label: string; value: string }[] = [];
    if (contact.phone) {
      list.push({ label: 'Phone', value: contact.phone });
    }
    if (contact.whatsapp && contact.whatsapp.replace(/\D/g, '') !== (contact.phone ?? '').replace(/\D/g, '')) {
      list.push({ label: 'WhatsApp', value: contact.whatsapp });
    }
    return list;
  }

  initials(name: string | null | undefined): string {
    return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') || '?';
  }

  async copy(value: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.notifications.push('success', `${what} copied.`);
    } catch {
      this.notifications.push('error', 'Could not copy — select it instead.');
    }
  }

  /** wa.me wants the number in international form, digits only: 0712… becomes 254712…. */
  whatsappLink(number: string): string {
    const digits = number.replace(/\D/g, '');
    return `https://wa.me/${digits.startsWith('0') ? '254' + digits.slice(1) : digits}`;
  }

  chargeAmount(charge: ChargeTemplate): string {
    if (charge.billingType === 'PERCENTAGE_OF_RENT' && charge.percentage) {
      return `${charge.percentage}% of rent`;
    }
    if ((charge.billingType === 'METERED' || charge.billingType === 'PER_UNIT') && charge.unitRate) {
      return `KES ${this.money(charge.unitRate)} per ${charge.unit || 'unit'}`;
    }
    return charge.fixedAmount ? `KES ${this.money(charge.fixedAmount)}` : '-';
  }

  ordinal(day: number): string {
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    return `${day}${suffix}`;
  }

  positive(value: number | string | null | undefined): boolean {
    return Number(value ?? 0) > 0;
  }

  money(value: number | string | null | undefined): string {
    const parsed = Number(value ?? 0);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}

