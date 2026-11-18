import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import {
  BillingCatalog,
  BillingPlan,
  BillingSummary,
  describePrice,
  EntitlementOverride,
  featureLabel,
  limitLabel,
  modeFields,
  OverrideKind,
  OverrideSource,
  priceForMode,
  PRICING_MODES,
  PricingMode
} from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * The super admin's side of one agency's billing:
 * - plan and price: the plan's own, or a custom price for this agency, chosen as one of five
 *   pricing modes that fill the same three numbers (base fee, included rooms, price per extra room);
 * - status: activate, extend the trial, suspend, cancel — each with its reason;
 * - overrides: a feature or a limit for this agency only (a pilot expires on its own);
 * - invoicing now, rather than waiting for the nightly run.
 */
@Component({
  selector: 'app-subscription-admin',
  standalone: true,
  imports: [HumanLabelPipe, DateDisplayDirective, CardTableDirective, SectionCardComponent, ErrorCardComponent, DialogComponent],
  template: `
    @let s = summary();
    <app-section-card title="Manage subscription" subtitle="Platform admin only. Changes take effect at once; prices apply from the next invoice.">
      <!-- Plan and price -->
      <form class="block" (submit)="$event.preventDefault(); savePlan()">
        <h3 class="block__title">Plan and price</h3>
        <div class="form-grid">
          <label class="field">
            <span>Plan</span>
            <select [value]="planId() ?? ''" (change)="pickPlan(+$any($event.target).value)">
              @for (plan of plans(); track plan.id) {
                <option [value]="plan.id">{{ plan.name }}{{ plan.active === false ? ' (inactive)' : '' }} — {{ describe(plan) }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>Price</span>
            <select [value]="custom() ? 'CUSTOM' : 'PLAN'" (change)="custom.set($any($event.target).value === 'CUSTOM')">
              <option value="PLAN">The plan's price</option>
              <option value="CUSTOM">A custom price for this agency</option>
            </select>
          </label>
          <label class="field">
            <span>Grace days after an invoice is overdue</span>
            <input type="number" min="0" max="90" [value]="graceDays()" (input)="graceDays.set(+$any($event.target).value)" inputmode="numeric">
          </label>
        </div>
        @if (custom()) {
          <div class="form-grid">
            <label class="field">
              <span>Pricing</span>
              <select (change)="pickMode($any($event.target).value)">
                @for (option of modes; track option.mode) { <option [value]="option.mode" [selected]="option.mode === mode()">{{ option.label }}</option> }
              </select>
              <small class="hint">{{ modeHint() }}</small>
            </label>
            @if (fields().base) {
              <label class="field"><span>Base fee a month</span>
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input type="number" inputmode="decimal" min="0" step="0.01" [value]="baseFee()" (input)="baseFee.set(+$any($event.target).value)"></span></label>
            }
            @if (fields().included) {
              <label class="field"><span>Rooms the base fee covers</span>
                <input type="number" min="1" [value]="includedRooms()" (input)="includedRooms.set(+$any($event.target).value)" inputmode="numeric"></label>
            }
            @if (fields().extra) {
              <label class="field"><span>{{ fields().included ? 'Price per extra room' : 'Price per room ' }}</span>
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input type="number" inputmode="decimal" min="0" step="0.01" [value]="extraRoomPrice()" (input)="extraRoomPrice.set(+$any($event.target).value)"></span></label>
            }
          </div>
          <p class="preview">Charges: <strong>{{ customPreview() }}</strong></p>
        }
        <label class="field field--wide"><span>Notes <span class="muted">(optional)</span></span>
          <input [value]="notes()" (input)="notes.set($any($event.target).value)" maxlength="500"></label>
        @if (planError(); as apiError) { <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" /> }
        <div class="button-row"><button type="submit" class="btn btn-primary btn-sm" [disabled]="busy()">Save plan and price</button></div>
      </form>

      <!-- Status -->
      <div class="block">
        <h3 class="block__title">Status</h3>
        <p class="muted small">Now <strong>{{ s.subscription.effectiveStatus | humanLabel }}</strong>@if (s.subscription.status !== s.subscription.effectiveStatus) { (stored as {{ s.subscription.status | humanLabel }}) }
          @if (s.subscription.billingStartsOn) { · billing from {{ date(s.subscription.billingStartsOn) }} }
          @if (s.subscription.trialEndsAt) { · trial ends {{ date(s.subscription.trialEndsAt) }} }</p>
        <div class="button-row">
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="openActivate()">Activate</button>
          @if (s.subscription.effectiveStatus === 'TRIALING' || s.subscription.trialEndsAt) {
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="extendTrial()">Extend trial</button>
          }
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="statusChange('suspend')">Suspend</button>
          <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="statusChange('cancel')">Cancel subscription</button>
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="generate()">Invoice now</button>
        </div>
      </div>

      <!-- Overrides -->
      <div class="block">
        <h3 class="block__title">Overrides for this agency</h3>
        @if (overrides().length === 0) {
          <p class="muted small">None. The plan's features and limits apply as they are.</p>
        } @else {
          <div class="table-scroll">
            <table appCardTable class="table table--packed">
              <thead><tr><th>What</th><th>Value</th><th>Source</th><th>Until</th><th>Reason</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                @for (o of overrides(); track o.id) {
                  <tr [class.muted]="!o.active">
                    <td>{{ o.kind === 'FEATURE' ? feature(o.entitlementKey) : limit(o.entitlementKey) }}</td>
                    <td>{{ o.kind === 'FEATURE' ? (o.featureEnabled ? 'On' : 'Off') : (o.limitValue ?? 'Unlimited') }}</td>
                    <td>{{ o.source | humanLabel }}{{ o.active ? '' : ' · not active' }}</td>
                    <td>{{ o.expiresAt ? date(o.expiresAt) : 'No end' }}</td>
                    <td>{{ o.reason }}</td>
                    <td class="row-action"><button type="button" class="btn btn-secondary btn-sm btn-danger-outline" (click)="revoke(o)">Revoke</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <form class="override compact-controls" (submit)="$event.preventDefault(); grant()">
          <label><span>Kind</span>
            <select [value]="oKind()" (change)="oKind.set($any($event.target).value); oKey.set('')">
              <option value="FEATURE">Feature</option><option value="LIMIT">Limit</option>
            </select></label>
          <label><span>{{ oKind() === 'FEATURE' ? 'Feature' : 'Limit' }}</span>
            <select [value]="oKey()" (change)="oKey.set($any($event.target).value)">
              <option value="">Choose…</option>
              @for (key of (oKind() === 'FEATURE' ? catalog()?.features : catalog()?.limits) ?? []; track key) {
                <option [value]="key">{{ oKind() === 'FEATURE' ? feature(key) : limit(key) }}</option>
              }
            </select></label>
          @if (oKind() === 'FEATURE') {
            <label><span>Value</span>
              <select [value]="oEnabled() ? 'on' : 'off'" (change)="oEnabled.set($any($event.target).value === 'on')">
                <option value="on">Turn on</option><option value="off">Turn off</option>
              </select></label>
          } @else {
            <label><span>Limit (empty = unlimited)</span>
              <input type="number" min="0" [value]="oLimit() ?? ''" (input)="oLimit.set($any($event.target).value === '' ? null : +$any($event.target).value)" inputmode="numeric"></label>
          }
          <label><span>Source</span>
            <select [value]="oSource()" (change)="oSource.set($any($event.target).value)">
              <option value="CUSTOM">Custom deal</option><option value="PILOT">Pilot</option><option value="ADDON">Add-on</option>
            </select></label>
          <label><span>Until (optional)</span><input type="date" [value]="oUntil()" (input)="oUntil.set($any($event.target).value)"></label>
          <label class="override__reason"><span>Reason</span><input [value]="oReason()" (input)="oReason.set($any($event.target).value)" maxlength="255"></label>
          <button type="submit" class="btn btn-secondary btn-sm" [disabled]="busy() || !oKey() || !oReason().trim()">Grant</button>
        </form>
      </div>
    </app-section-card>

    <!-- Activate: when billing starts, picked like every other date, and an optional note. -->
    @if (activating()) {
      <app-dialog title="Activate this subscription" subtitle="Months before the start date are never invoiced." width="28rem" (closed)="activating.set(false)">
        <form id="activate-subscription" class="stack" (submit)="$event.preventDefault(); activate()">
          <label class="field">
            <span>Billing starts on</span>
            <input type="date" [value]="startsOn()" (input)="startsOn.set($any($event.target).value)">
            <small class="hint">A month that starts mid-month is charged a full base fee, so the 1st is usually best. Leave empty to keep the date already set, or today.</small>
          </label>
          <label class="field">
            <span>Note <span class="muted">(optional)</span></span>
            <input [value]="activateNote()" (input)="activateNote.set($any($event.target).value)" maxlength="500">
          </label>
        </form>
        <div dialog-actions>
          <button type="submit" form="activate-subscription" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Activating…' : 'Activate' }}</button>
          <button type="button" class="btn btn-secondary" (click)="activating.set(false)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .block { display: grid; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--border); }
    .block:first-of-type { padding-top: 0; border-top: 0; }
    .block__title { margin: 0; font-size: var(--font-subsection); font-weight: var(--weight-semibold); }
    .small { margin: 0; font-size: var(--font-description); }
    .preview { margin: 0; font-size: var(--font-dense); }
    .override { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-3); }
    .override label { display: grid; gap: var(--space-1); font-size: var(--font-label); color: var(--text-muted); }
    .override__reason { flex: 1 1 14rem; }
    .override__reason input { width: 100%; }
    .row-action { text-align: right; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubscriptionAdminComponent {
  readonly agencyId = input.required<number>();
  readonly summary = input.required<BillingSummary>();
  /** Something changed: the page reloads the summary. */
  readonly changed = output<void>();

  private readonly billing = inject(BillingService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);

  readonly modes = PRICING_MODES;
  readonly plans = signal<BillingPlan[]>([]);
  readonly catalog = signal<BillingCatalog | null>(null);
  readonly overrides = signal<EntitlementOverride[]>([]);
  readonly busy = signal(false);
  readonly planError = signal<ApiError | null>(null);
  readonly activating = signal(false);
  readonly startsOn = signal('');
  readonly activateNote = signal('');

  // Plan and price form
  readonly planId = signal<number | null>(null);
  readonly custom = signal(false);
  readonly mode = signal<PricingMode>('FREE');
  readonly baseFee = signal(0);
  readonly includedRooms = signal(0);
  readonly extraRoomPrice = signal(0);
  readonly graceDays = signal(7);
  readonly notes = signal('');
  readonly fields = computed(() => modeFields(this.mode()));
  readonly modeHint = computed(() => this.modes.find((m) => m.mode === this.mode())?.hint ?? '');
  readonly customPreview = computed(() => describePrice({ baseFee: this.baseFee(), includedRooms: this.includedRooms(), extraRoomPrice: this.extraRoomPrice() }));

  // Override form
  readonly oKind = signal<OverrideKind>('FEATURE');
  readonly oKey = signal('');
  readonly oEnabled = signal(true);
  readonly oLimit = signal<number | null>(null);
  readonly oSource = signal<OverrideSource>('CUSTOM');
  readonly oUntil = signal('');
  readonly oReason = signal('');

  constructor() {
    // The form starts from what the agency has now.
    effect(() => {
      const sub = this.summary().subscription;
      untracked(() => {
        this.planId.set(sub.planId);
        this.custom.set(sub.priceSource === 'CUSTOM');
        this.mode.set(sub.pricingMode);
        this.baseFee.set(Number(sub.baseFee) || 0);
        this.includedRooms.set(sub.includedRooms ?? 0);
        this.extraRoomPrice.set(Number(sub.extraRoomPrice) || 0);
        this.graceDays.set(sub.graceDays ?? 7);
        this.notes.set(sub.notes ?? '');
      });
    });
    effect(() => {
      const agencyId = this.agencyId();
      untracked(() => void this.loadSide(agencyId));
    });
  }

  private async loadSide(agencyId: number): Promise<void> {
    const [plans, catalog, overrides] = await Promise.all([
      firstValueFrom(this.billing.plans()).catch(() => [] as BillingPlan[]),
      firstValueFrom(this.billing.catalog()).catch(() => null),
      firstValueFrom(this.billing.overrides(agencyId)).catch(() => [] as EntitlementOverride[])
    ]);
    this.plans.set(plans);
    this.catalog.set(catalog);
    this.overrides.set(overrides);
  }

  pickPlan(planId: number): void {
    this.planId.set(planId);
    const plan = this.plans().find((p) => p.id === planId);
    // Picking a plan starts a custom price from the plan's numbers.
    if (plan && !this.custom()) {
      this.baseFee.set(Number(plan.baseFee) || 0);
      this.includedRooms.set(plan.includedRooms ?? 0);
      this.extraRoomPrice.set(Number(plan.extraRoomPrice) || 0);
      this.mode.set(plan.pricingMode ?? 'FREE');
    }
  }

  pickMode(mode: PricingMode): void {
    this.mode.set(mode);
    const next = priceForMode(mode, { baseFee: this.baseFee(), includedRooms: this.includedRooms(), extraRoomPrice: this.extraRoomPrice() });
    this.baseFee.set(next.baseFee);
    this.includedRooms.set(next.includedRooms);
    this.extraRoomPrice.set(next.extraRoomPrice);
  }

  async savePlan(): Promise<void> {
    const planId = this.planId();
    if (planId === null) {
      return;
    }
    await this.run(async () => {
      this.planError.set(null);
      try {
        await firstValueFrom(this.billing.updateSubscription(this.agencyId(), {
          planId,
          // All three for a custom price; none for the plan's.
          ...(this.custom() ? { baseFee: this.baseFee(), includedRooms: this.includedRooms(), extraRoomPrice: this.extraRoomPrice() } : {}),
          graceDays: this.graceDays(),
          notes: this.notes().trim() || null
        }));
        this.toasts.push('success', 'Plan and price saved.');
        this.changed.emit();
      } catch (error) {
        this.planError.set(toApiError(error));
      }
    });
  }

  /** Opens the Activate dialog on the 1st of next month, or the date already set. */
  openActivate(): void {
    const current = this.summary().subscription.billingStartsOn;
    const now = new Date();
    const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    this.startsOn.set(current?.slice(0, 10)
      ?? `${firstOfNext.getFullYear()}-${String(firstOfNext.getMonth() + 1).padStart(2, '0')}-01`);
    this.activateNote.set('');
    this.activating.set(true);
  }

  async activate(): Promise<void> {
    await this.act(() => this.billing.activate(this.agencyId(), this.startsOn() || null, this.activateNote().trim() || null),
      'Subscription activated.');
    this.activating.set(false);
  }

  async extendTrial(): Promise<void> {
    const days = await this.confirm.askForReason({
      title: 'Extend the trial',
      message: 'Days are added from the later of today and the current trial end.',
      confirmLabel: 'Extend',
      reason: { label: 'Days to add (1–365)', required: true, placeholder: '14', maxLength: 3 }
    });
    const value = Number(days);
    if (days === null) {
      return;
    }
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      this.toasts.push('error', 'Give a whole number of days from 1 to 365.');
      return;
    }
    await this.act(() => this.billing.extendTrial(this.agencyId(), value, null), `Trial extended by ${value} days.`);
  }

  async statusChange(kind: 'suspend' | 'cancel'): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: kind === 'suspend' ? 'Suspend this agency?' : 'Cancel this subscription?',
      message: kind === 'suspend'
        ? 'The landlord becomes read-only: no new tenants, rooms or leases. Tenants can still pay rent and report repairs.'
        : 'Read-only, with data kept. Only a platform admin can bring it back.',
      confirmLabel: kind === 'suspend' ? 'Suspend' : 'Cancel subscription',
      destructive: true,
      reason: { label: 'Reason', required: true, maxLength: 500 }
    });
    if (reason === null) {
      return;
    }
    await this.act(() => kind === 'suspend' ? this.billing.suspend(this.agencyId(), reason) : this.billing.cancel(this.agencyId(), reason),
      kind === 'suspend' ? 'Agency suspended.' : 'Subscription canceled.');
  }

  async generate(): Promise<void> {
    await this.run(async () => {
      try {
        const result = await firstValueFrom(this.billing.generateInvoices(this.agencyId()));
        this.toasts.push('success', result.issued.length > 0
          ? `Issued ${result.issued.map((i) => i.invoiceNumber).join(', ')}.`
          : result.freeMonths > 0 ? 'Nothing to invoice: the months due came to nothing.' : 'Nothing to invoice yet.');
        this.changed.emit();
      } catch (error) {
        this.toasts.push('error', toApiError(error).message);
      }
    });
  }

  async grant(): Promise<void> {
    await this.run(async () => {
      try {
        await firstValueFrom(this.billing.grantOverride(this.agencyId(), {
          entitlementKey: this.oKey(),
          kind: this.oKind(),
          featureEnabled: this.oKind() === 'FEATURE' ? this.oEnabled() : null,
          limitValue: this.oKind() === 'LIMIT' ? this.oLimit() : null,
          source: this.oSource(),
          expiresAt: this.oUntil() ? `${this.oUntil()}T23:59:59` : null,
          reason: this.oReason().trim()
        }));
        this.toasts.push('success', 'Override granted.');
        this.oKey.set('');
        this.oReason.set('');
        this.oUntil.set('');
        this.overrides.set(await firstValueFrom(this.billing.overrides(this.agencyId())));
        this.changed.emit();
      } catch (error) {
        this.toasts.push('error', toApiError(error).message);
      }
    });
  }

  async revoke(o: EntitlementOverride): Promise<void> {
    if (!await this.confirm.ask({ title: 'Revoke this override?', message: 'The plan\'s value applies again at once.', confirmLabel: 'Revoke', destructive: true })) {
      return;
    }
    await this.run(async () => {
      try {
        await firstValueFrom(this.billing.revokeOverride(this.agencyId(), o.id));
        this.overrides.update((list) => list.filter((item) => item.id !== o.id));
        this.changed.emit();
      } catch (error) {
        this.toasts.push('error', toApiError(error).message);
      }
    });
  }

  private async act(call: () => ReturnType<BillingService['activate']>, done: string): Promise<void> {
    await this.run(async () => {
      try {
        await firstValueFrom(call());
        this.toasts.push('success', done);
        this.changed.emit();
      } catch (error) {
        this.toasts.push('error', toApiError(error).message);
      }
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await work();
    } finally {
      this.busy.set(false);
    }
  }

  describe(plan: BillingPlan): string {
    return describePrice(plan);
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  limit(key: string): string {
    return limitLabel(key);
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
