import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { Pagination } from '../../../core/models/pagination.model';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityRow } from '../../../shared/components/entity-picker/entity-picker.models';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantPreview } from '../../tenants/models/tenant.models';
import { ClaimSummary, ReceivedPayment, TenantSuggestion } from '../reconciliation.models';
import { ReconciliationService } from '../reconciliation.service';

/**
 * Payments the landlord entered, in one state at a time.
 *
 * Matched: the tenant's report and the landlord's record side by side, both visible at once, so
 * nothing has to be remembered between screens. Unmatched: waiting for a report — linked by hand
 * when the reference matches but the amount does not, assigned straight to a tenancy when nobody
 * will report it (a parent paid), or set aside with a reason.
 */
@Component({
  selector: 'app-received-payments',
  standalone: true,
  imports: [FormsModule, DialogComponent, EmptyStateComponent, EntityPickerComponent, ErrorCardComponent, ErrorStateComponent,
    LoadingStateComponent, PaginationComponent, HumanLabelPipe],
  template: `
    @if (loading()) {
      <app-loading-state [compact]="true" label="Loading payments..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else if (items().length === 0) {
      <app-empty-state [title]="status() === 'MATCHED' ? 'Nothing matched to verify' : 'No unmatched payments'"
                       [description]="status() === 'MATCHED'
                         ? 'When a payment you entered and a tenant\\'s report share a reference and amount, they wait here for you to confirm.'
                         : 'Payments you entered that no tenant has reported yet wait here.'" />
    } @else {
      <ul class="received">
        @for (item of items(); track item.id) {
          <li class="card" [class.card--focus]="item.id === focusId()">
            @if (item.match; as claim) {
              <!-- Both records at once: the eye compares, nothing is remembered. -->
              <div class="pair">
                <section>
                  <h3 class="pair__title">Tenant reported</h3>
                  <strong class="pair__money">KES {{ money(claim.amount) }}</strong>
                  <dl class="facts">
                    <div><dt>Tenant</dt><dd>{{ claim.tenantName }}</dd></div>
                    <div><dt>Room</dt><dd>{{ claim.roomName || '-' }}@if (claim.buildingName) { · {{ claim.buildingName }} }</dd></div>
                    <div><dt>For</dt><dd>{{ monthLabel(claim.paymentForMonth) }}</dd></div>
                    <div><dt>Reference</dt><dd class="mono">{{ claim.referenceNumber }}</dd></div>
                  </dl>
                </section>
                <section>
                  <h3 class="pair__title">You received</h3>
                  <strong class="pair__money">KES {{ money(item.amount) }}</strong>
                  <dl class="facts">
                    <div><dt>Method</dt><dd>{{ item.paymentMethod | humanLabel }}</dd></div>
                    <div><dt>Date</dt><dd>{{ date(item.paidOn) }}</dd></div>
                    @if (item.payerName) { <div><dt>From</dt><dd>{{ item.payerName }}@if (item.payerPhone) { · {{ item.payerPhone }} }</dd></div> }
                    <div><dt>Reference</dt><dd class="mono">{{ item.referenceNumber }}</dd></div>
                  </dl>
                </section>
              </div>
              <p [class]="'status-chip status-chip--' + (claim.amountMatches ? 'success' : 'warning')">
                {{ claim.amountMatches ? '✓ Reference and amount match' : '⚠ Reference matches, amounts differ — the amount you received is what gets recorded' }}
              </p>
            } @else {
              <div class="head">
                <div>
                  <strong class="pair__money">KES {{ money(item.amount) }}</strong>
                  <span class="muted">{{ item.paymentMethod | humanLabel }} · {{ date(item.paidOn) }}@if (item.payerName) { · from {{ item.payerName }} }</span>
                </div>
                <span class="head__ref">
                  @if (item.source === 'MPESA_C2B') { <span class="status-chip status-chip--success">Confirmed by Safaricom</span> }
                  <span class="mono">{{ item.referenceNumber }}</span>
                </span>
              </div>
              @if (item.source === 'MPESA_C2B') {
                <p class="muted">Received through the PayBill but not placed automatically — the account number named no room, the room has no single active tenant, or nothing was owed. Assign it.</p>
              }
              @if (item.accountReference) { <p class="muted">Account typed by the payer: <span class="mono">{{ item.accountReference }}</span></p> }
              <!-- The payer typed a room's account number: its tenant, one click away. -->
              @if (item.suggestion; as hint) {
                <div class="suggestion">
                  <span>Account <span class="mono">{{ hint.accountReference }}</span> is
                    <strong>{{ hint.roomName }}</strong>@if (hint.buildingName) { · {{ hint.buildingName }} } — {{ hint.tenantName }}</span>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="busyId() === item.id" (click)="assignSuggested(item, hint)">
                    Assign to {{ hint.tenantName }}
                  </button>
                </div>
              }
              @for (claim of item.discrepancies ?? []; track claim.submissionId) {
                <div class="discrepancy">
                  <span>
                    <strong>{{ claim.tenantName }}</strong> ({{ claim.roomName || '-' }}) reported
                    <strong>KES {{ money(claim.amount) }}</strong> under this reference for {{ monthLabel(claim.paymentForMonth) }}
                    @if (!claim.amountMatches) { <span class="status-chip status-chip--warning">Amount differs</span> }
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === item.id" (click)="link(item, claim)">Link</button>
                </div>
              }
            }
            @if (item.rawMessage) {
              <details class="raw"><summary>Message as pasted</summary><p class="mono">{{ item.rawMessage }}</p></details>
            }
            <div class="actions">
              @if (item.status === 'MATCHED' && item.match) {
                <button type="button" class="btn btn-primary btn-sm" [disabled]="busyId() === item.id" (click)="confirm(item, item.match)">
                  {{ busyId() === item.id ? 'Confirming...' : 'Confirm payment' }}
                </button>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === item.id" (click)="unmatch(item)">Not this report</button>
              } @else {
                <button type="button" class="btn btn-sm" [class.btn-primary]="!item.suggestion" [class.btn-secondary]="!!item.suggestion"
                        [disabled]="busyId() === item.id" (click)="startAssign(item)">{{ item.suggestion ? 'Someone else' : 'Assign to a tenant' }}</button>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === item.id" (click)="discard(item)">Set aside</button>
              }
            </div>
            <small class="muted">Entered {{ date(item.recordedAt) }}@if (item.recordedByName) { by {{ item.recordedByName }} }</small>
          </li>
        }
      </ul>
      @if (pagination(); as page) {
        <app-pagination [pagination]="page" [size]="20" [sizes]="[20]" [shown]="items().length" [total]="page.totalElements"
                        noun="payments" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" />
      }
    }

    @if (assigning(); as item) {
      <app-dialog title="Assign payment" [subtitle]="'KES ' + money(item.amount) + ' · ' + item.referenceNumber" (closed)="assigning.set(null)">
        <div class="stack">
          <label class="field">
            <span>Tenant</span>
            <app-entity-picker [config]="pickers.tenant" placeholder="Choose the tenant" (selectionChange)="pickTenant($event)" />
          </label>
          <label class="field">
            <span>For the month of</span>
            <input type="month" [(ngModel)]="assignMonth">
          </label>
          <p class="muted">Recorded as a payment for this tenant. Paying more than the month owes carries the rest forward as credit.</p>
          @if (assignError(); as apiError) {
            <app-error-card title="Not recorded" [message]="apiError.message" [details]="apiError.details" />
          }
        </div>
        <div dialog-actions>
          <button type="button" class="btn btn-primary" [disabled]="!assignTenant() || !assignMonth || busyId() === item.id" (click)="assign(item)">
            {{ busyId() === item.id ? 'Recording...' : 'Record payment' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="assigning.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .received { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
    .card { display: grid; gap: 0.6rem; padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
    .card--focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-ring); }
    .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: 0.75rem 1rem; }
    .pair section { display: grid; gap: 0.4rem; padding: 0.6rem 0.75rem; border-radius: 10px; background: var(--surface-2); }
    .pair__title { margin: 0; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .pair__money { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
    .facts { display: grid; gap: 0.25rem; margin: 0; }
    .facts div { display: flex; gap: 0.5rem; }
    .facts dt { flex: 0 0 5rem; font-size: 0.8rem; color: var(--text-muted); }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.5rem 1rem; }
    .head > div { display: grid; gap: 0.1rem; }
    .head__ref { display: inline-flex; align-items: center; gap: 0.5rem; }
    .discrepancy { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;
                   padding: 0.5rem 0.7rem; border-left: 3px solid var(--warning); background: var(--warning-tint); border-radius: 8px; }
    .suggestion { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;
                  padding: 0.5rem 0.7rem; border-left: 3px solid var(--primary); background: var(--primary-tint); border-radius: 8px; }
    .raw summary { cursor: pointer; font-size: 0.85rem; color: var(--text-muted); }
    .raw p { margin: 0.4rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.82rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .card > .status-chip { justify-self: start; margin: 0; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceivedPaymentsComponent {
  readonly agencyId = input.required<number>();
  readonly status = input.required<'MATCHED' | 'UNMATCHED'>();
  /** Bumped by the page after something was entered, so the list reloads. */
  readonly refresh = input(0);
  /** A payment just entered: marked, so the landlord sees where it went. */
  readonly focusId = input<number | null>(null);
  /** Something moved between states — the page refreshes its counts. */
  readonly changed = output<void>();

  private readonly reconciliation = inject(ReconciliationService);
  private readonly confirmDialog = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  readonly pickers = inject(EntityPickerRegistry);

  readonly items = signal<ReceivedPayment[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);
  private readonly page = signal(0);

  readonly assigning = signal<ReceivedPayment | null>(null);
  readonly assignTenant = signal<TenantPreview | null>(null);
  readonly assignError = signal<ApiError | null>(null);
  assignMonth = '';

  constructor() {
    effect(() => {
      this.agencyId();
      this.status();
      this.refresh();
      untracked(() => {
        this.page.set(0);
        void this.reload();
      });
    });
  }

  go(page: number): void {
    this.page.set(Math.max(0, page));
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.reconciliation.list(this.agencyId(), { status: this.status(), page: this.page(), size: 20 }));
      this.items.set(result.items);
      this.pagination.set(result.pagination ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async confirm(item: ReceivedPayment, claim: ClaimSummary): Promise<void> {
    if (!await this.confirmDialog.ask({
      title: `Confirm KES ${this.money(item.amount)} from ${claim.tenantName}?`,
      message: `Recorded for ${this.monthLabel(claim.paymentForMonth)} and taken off the balance; the tenant is told and can download a receipt. `
        + 'Check it reached your M-Pesa or bank statement first — a pasted message alone is not proof.',
      confirmLabel: 'Confirm payment'
    })) {
      return;
    }
    await this.act(item, () => this.reconciliation.confirm(this.agencyId(), claim.buildingId, item.id),
      `KES ${this.money(item.amount)} recorded for ${claim.tenantName}.`);
  }

  async link(item: ReceivedPayment, claim: ClaimSummary): Promise<void> {
    await this.act(item, () => this.reconciliation.matchWith(this.agencyId(), item.id, claim.submissionId),
      `Linked with ${claim.tenantName}'s report — confirm it under Matched.`);
  }

  async unmatch(item: ReceivedPayment): Promise<void> {
    await this.act(item, () => this.reconciliation.unmatch(this.agencyId(), item.id), 'Unlinked — both wait on their own again.');
  }

  async discard(item: ReceivedPayment): Promise<void> {
    const reason = await this.confirmDialog.askForReason({
      title: `Set aside KES ${this.money(item.amount)} (${item.referenceNumber})?`,
      message: 'It leaves the queue and is kept with your reason. Nothing is recorded on any balance.',
      confirmLabel: 'Set aside',
      destructive: true,
      reason: { label: 'Why', required: true, placeholder: 'e.g. Not rent — a deposit for a viewing', maxLength: 1000 }
    });
    if (reason === null) {
      return;
    }
    await this.act(item, () => this.reconciliation.discard(this.agencyId(), item.id, reason), 'Set aside.');
  }

  startAssign(item: ReceivedPayment): void {
    this.assignError.set(null);
    this.assignTenant.set(null);
    const paid = item.paidOn ?? new Date().toISOString();
    this.assignMonth = paid.slice(0, 7);
    this.assigning.set(item);
  }

  /** One click: the room the account number names, for the month it was paid in. */
  async assignSuggested(item: ReceivedPayment, hint: TenantSuggestion): Promise<void> {
    const month = (item.paidOn ?? new Date().toISOString()).slice(0, 7);
    if (!await this.confirmDialog.ask({
      title: `Record KES ${this.money(item.amount)} for ${hint.tenantName}?`,
      message: `For ${this.monthLabel(month)}, ${hint.roomName}. Anything over what the month owes carries forward as credit.`,
      confirmLabel: 'Record payment'
    })) {
      return;
    }
    await this.act(item, () => this.reconciliation.assign(this.agencyId(), hint.buildingId, item.id, hint.tenantId, month),
      `KES ${this.money(item.amount)} recorded for ${hint.tenantName}.`);
  }

  pickTenant(row: EntityRow<number> | null): void {
    this.assignTenant.set((row?.item as TenantPreview | undefined) ?? null);
  }

  async assign(item: ReceivedPayment): Promise<void> {
    const tenant = this.assignTenant();
    if (!tenant?.buildingId) {
      this.assignError.set({ status: 0, errorCode: 'NO_BUILDING', message: 'That tenant has no building yet.', details: [] });
      return;
    }
    this.busyId.set(item.id);
    this.assignError.set(null);
    try {
      await firstValueFrom(this.reconciliation.assign(this.agencyId(), tenant.buildingId, item.id, tenant.id, this.assignMonth));
      this.assigning.set(null);
      this.items.update((list) => list.filter((entry) => entry.id !== item.id));
      this.notifications.push('success', `KES ${this.money(item.amount)} recorded for ${tenant.firstName ?? 'the tenant'}.`);
      this.changed.emit();
    } catch (error) {
      this.assignError.set(toApiError(error));
    } finally {
      this.busyId.set(null);
    }
  }

  /** Every action moves the payment to another state, so it leaves this list. */
  private async act(item: ReceivedPayment, call: () => ReturnType<ReconciliationService['unmatch']>, done: string): Promise<void> {
    this.busyId.set(item.id);
    try {
      await firstValueFrom(call());
      this.items.update((list) => list.filter((entry) => entry.id !== item.id));
      this.notifications.push('success', done);
      this.changed.emit();
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  money(value: number | string | null | undefined): string {
    const parsed = Number(value ?? 0);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }

  monthLabel(value: string): string {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}
