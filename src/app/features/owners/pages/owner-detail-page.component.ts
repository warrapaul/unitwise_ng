import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { thisMonthIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { MoreMenuComponent } from '../../../shared/components/more-menu/more-menu.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { asText, downloadCsv } from '../../../shared/utils/csv-export.util';
import { displayDate } from '../../../shared/utils/display-date.util';
import { saveDownload } from '../../../shared/utils/download.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency, formatPhone, monthLabel } from '../../../shared/utils/format.util';
import { OwnerBuildingsDialogComponent } from '../components/owner-buildings-dialog.component';
import { OwnerDialogComponent } from '../components/owner-dialog.component';
import { PayoutDialogComponent } from '../components/payout-dialog.component';
import { StatementViewComponent } from '../components/statement-view.component';
import {
  COMMISSION_TYPES,
  CommissionType,
  OwnedBuilding,
  OwnerPayout,
  OwnerStatement,
  PAYOUT_METHOD_LABELS,
  PropertyOwner,
  STATEMENT_STATUS_LABELS,
  StatementStatus,
  commissionLabel
} from '../owners.models';
import { OwnersService } from '../owners.service';

const STATUS_TONE: Record<StatementStatus, string> = { DRAFT: 'warning', APPROVED: 'info', SENT: 'success' };

/**
 * One owner: who they are and which buildings are theirs, then the month's statement (worked out
 * live until it is saved, reviewed and sent), the money already sent to them, and their sign-in.
 */
@Component({
  selector: 'app-owner-detail-page',
  standalone: true,
  imports: [FormFeedbackDirective, ReactiveFormsModule, RouterLink, CardTableDirective, ContextGuardComponent, DialogComponent, ErrorStateComponent,
    LoadingStateComponent, MonthNavComponent, MoreMenuComponent, PermissionGateComponent, SectionCardComponent,
    OwnerDialogComponent, OwnerBuildingsDialogComponent, PayoutDialogComponent, StatementViewComponent],
  template: `
    <section class="stack">
      <a class="text-link back" [routerLink]="RoutePaths.owners">← All owners</a>
      <app-context-guard [requireBuilding]="false" requirePermission="OWNER_READ">
        @if (loading() && !owner()) {
          <app-loading-state label="Loading owner…" />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else if (owner(); as o) {
          <app-section-card [title]="o.name" [subtitle]="commission(o.commissionType, o.commissionValue)">
            <app-permission-gate actions [permissions]="['OWNER_WRITE']">
              <button type="button" class="btn btn-secondary" (click)="editing.set(true)">Edit</button>
            </app-permission-gate>
            <app-permission-gate actions [permissions]="['OWNER_WRITE']">
              <app-more-menu [label]="'⋯'">
                <button type="button" (click)="remove(o)">Remove owner</button>
              </app-more-menu>
            </app-permission-gate>
            <dl class="facts">
              <div><dt>Phone</dt><dd>{{ o.phoneNumber ? phone(o.phoneNumber) : '—' }}</dd></div>
              <div><dt>Email</dt><dd>{{ o.email || '—' }}</dd></div>
              <div><dt>ID or company number</dt><dd>{{ o.idNumber || '—' }}</dd></div>
              <div><dt>Send their money by</dt><dd>{{ o.payoutMethod ? methods[o.payoutMethod] : 'Not decided' }}@if (o.payoutAccount) { · {{ o.payoutAccount }} }</dd></div>
            </dl>
            @if (o.notes) { <p class="muted">{{ o.notes }}</p> }
          </app-section-card>

          <app-section-card title="Buildings" [subtitle]="o.buildings.length ? o.buildings.length + ' of theirs' : 'None yet'">
            <app-permission-gate actions [permissions]="['OWNER_WRITE']">
              <button type="button" class="btn btn-secondary" (click)="choosingBuildings.set(true)">Choose buildings</button>
            </app-permission-gate>
            @if (o.buildings.length === 0) {
              <p class="muted">Give this owner their buildings to work out their statement.</p>
            } @else {
              <ul class="rows">
                @for (b of o.buildings; track b.id) {
                  <li class="row">
                    <span class="cell-stack"><strong>{{ b.name }}</strong>
                      <span class="muted">{{ b.commissionLabel }}@if (!b.commissionType) { · the owner's rate }</span></span>
                    <app-permission-gate [permissions]="['OWNER_WRITE']">
                      <button type="button" class="btn btn-text" (click)="openCommission(b)">Change rate</button>
                    </app-permission-gate>
                  </li>
                }
              </ul>
            }
          </app-section-card>

          <app-section-card title="Statement" [subtitle]="statementSubtitle()">
            <app-month-nav actions [(month)]="month" />
            @if (statement(); as s) {
              <div class="statement-actions">
                @if (saved(); as st) {
                  <span class="status-chip" [class]="'status-chip status-chip--' + tone(st.status!)">{{ statusLabel(st.status!) }}</span>
                }
                <app-permission-gate [permissions]="['OWNER_WRITE']">
                  <div class="button-row">
                    @if (!saved() || saved()!.status === 'DRAFT') {
                      <button type="button" class="btn" [class.btn-primary]="!saved()" [class.btn-secondary]="!!saved()" [disabled]="busy() || futureMonth()" (click)="saveDraft()">
                        {{ saved() ? 'Recalculate' : 'Save as draft' }}</button>
                    }
                    @if (saved()?.status === 'DRAFT') {
                      <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="move('approve')">Approve</button>
                    }
                    @if (saved()?.status === 'APPROVED') {
                      <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="move('send')">Send to owner</button>
                      <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="move('reopen')">Reopen</button>
                    }
                    @if (+s.closingBalance > 0) {
                      <button type="button" class="btn btn-secondary" (click)="paying.set(+s.closingBalance)">Record payout</button>
                    }
                  </div>
                </app-permission-gate>
                <div class="button-row">
                  @if (saved()) { <button type="button" class="btn btn-secondary" (click)="downloadPdf(saved()!)">PDF</button> }
                  <button type="button" class="btn btn-secondary" (click)="exportCsv(s)">CSV</button>
                </div>
              </div>
              @if (!saved()) {
                <p class="muted hint">Worked out from today's records. Save it as a draft to keep these figures, then approve and send it.</p>
              } @else if (saved()!.status === 'DRAFT') {
                <p class="muted hint">A draft: recalculate after recording more rent, expenses or payouts for {{ monthName() }}.</p>
              }
              <app-statement-view [statement]="s" />
            } @else if (statementLoading()) {
              <app-loading-state [compact]="true" label="Working out the month…" />
            }
          </app-section-card>

          <app-section-card title="Saved statements">
            @if (history().length === 0) {
              <p class="muted">None saved yet.</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Month</th><th>Status</th><th class="num">Collected</th><th class="num">Balance</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    @for (st of history(); track st.id) {
                      <tr>
                        <td class="card-title"><button type="button" class="link-button" (click)="month.set(st.month.slice(0, 7))">{{ monthOf(st.month) }}</button></td>
                        <td data-label="Status"><span class="status-chip" [class]="'status-chip status-chip--' + tone(st.status!)">{{ statusLabel(st.status!) }}</span></td>
                        <td class="num" data-label="Collected">{{ money(st.rentCollected) }}</td>
                        <td class="num" data-label="Balance">{{ money(st.closingBalance) }}</td>
                        <td class="row-action"><button type="button" class="btn btn-text" (click)="downloadPdf(st)">PDF</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <app-section-card title="Money sent to them" subtitle="Payouts and advances">
            <app-permission-gate actions [permissions]="['OWNER_WRITE']">
              <button type="button" class="btn btn-secondary" (click)="paying.set(0)">Record payout</button>
            </app-permission-gate>
            @if (payouts().length === 0) {
              <p class="muted">Nothing sent yet.</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Date</th><th>Kind</th><th>How</th><th class="num">Amount</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    @for (p of payouts(); track p.id) {
                      <tr>
                        <td class="card-title">{{ date(p.paidOn) }}</td>
                        <td data-label="Kind">{{ p.kind === 'ADVANCE' ? 'Advance' : 'Payout' }}</td>
                        <td data-label="How">{{ p.method ? methods[p.method] : '—' }}@if (p.reference) { · <span class="mono">{{ p.reference }}</span> }</td>
                        <td class="num" data-label="Amount"><strong>{{ money(p.amount) }}</strong></td>
                        <td class="row-action">
                          <app-permission-gate [permissions]="['OWNER_WRITE']">
                            <button type="button" class="btn btn-text" (click)="deletePayout(p)">Delete</button>
                          </app-permission-gate>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <app-section-card title="Their sign-in" subtitle="Read-only: rooms, rent, repairs and expenses of their own buildings as they happen, plus sent statements and payouts">
            @if (o.portalAccess) {
              <div class="row">
                <span><span class="status-chip status-chip--success">Can sign in</span> {{ o.portalUserName }}</span>
                <app-permission-gate [permissions]="['OWNER_WRITE']">
                  <button type="button" class="btn btn-text" (click)="revoke(o)">Remove sign-in</button>
                </app-permission-gate>
              </div>
            } @else {
              <app-permission-gate [permissions]="['OWNER_WRITE']">
                <form class="invite" (submit)="$event.preventDefault(); grant(o)">
                  <label class="field grow">
                    <span>Their Unitwise ID</span>
                    <input [formControl]="uid" class="mono" autocomplete="off" placeholder="From their profile after they sign up">
                  </label>
                  <button type="submit" class="btn btn-primary" [disabled]="busy()">Let them sign in</button>
                </form>
                <p class="muted hint">Ask them to create a Unitwise account and send you the Unitwise ID on their profile page. Their sign-in is unchanged; this only adds their buildings. Tenant documents and messages stay with you, and drafts stay hidden until sent.</p>
              </app-permission-gate>
            }
          </app-section-card>
        }
      </app-context-guard>
    </section>

    @if (editing() && owner()) {
      <app-owner-dialog [agencyId]="agencyId()!" [owner]="owner()" (saved)="ownerSaved($event)" (closed)="editing.set(false)" />
    }
    @if (choosingBuildings() && owner()) {
      <app-owner-buildings-dialog [agencyId]="agencyId()!" [owner]="owner()!" (saved)="buildingsSaved($event)" (closed)="choosingBuildings.set(false)" />
    }
    @if (paying() !== null && owner()) {
      <app-payout-dialog [agencyId]="agencyId()!" [owner]="owner()!" [amount]="paying()" (saved)="payoutSaved()" (closed)="paying.set(null)" />
    }
    @if (rateFor(); as b) {
      <app-dialog title="This building's rate" [subtitle]="b.name" width="30rem" (closed)="rateFor.set(null)">
        <form appFormFeedback id="rate-form" class="stack" [formGroup]="rate" (ngSubmit)="saveRate(b, false)">
          <label class="field"><span>Commission</span>
            <select formControlName="commissionType">
              @for (option of commissionTypes; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
          </label>
          <label class="field"><span>{{ rate.controls.commissionType.value === 'PERCENT_OF_COLLECTED' ? 'Percentage' : 'Monthly fee (KES)' }}</span>
            <input type="number" formControlName="commissionValue" min="0" step="0.01" inputmode="decimal">
          </label>
        </form>
        <div dialog-actions>
          <button type="submit" form="rate-form" class="btn btn-primary" [disabled]="busy() || rate.invalid">Save</button>
          @if (b.commissionType) { <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="saveRate(b, true)">Use the owner's rate</button> }
          <button type="button" class="btn btn-text" (click)="rateFor.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .back { display: inline-block; }
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); gap: var(--space-3) var(--space-4); margin: 0; }
    .facts dt { font-size: var(--font-label); color: var(--text); opacity: 0.75; }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .rows { list-style: none; margin: 0; padding: 0; display: grid; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .rows .row:last-child { border-bottom: 0; }
    .statement-actions { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
    .hint { margin: 0 0 var(--space-3); font-size: var(--text-sm); }
    .invite { display: flex; gap: var(--space-2); align-items: end; flex-wrap: wrap; }
    .invite .grow { flex: 1 1 16rem; }
    .invite input { max-width: none; }
    .row-action { width: 1%; text-align: right; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerDetailPageComponent {
  /** Route parameter. */
  readonly ownerId = input.required<string>();

  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly owners = inject(OwnersService);
  private readonly toasts = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly methods = PAYOUT_METHOD_LABELS;
  readonly commissionTypes = COMMISSION_TYPES;
  readonly month = inject(WorkingMonthService).month;
  readonly agencyId = computed(() => this.context.agencyId());
  private readonly id = computed(() => Number(this.ownerId()));

  readonly owner = signal<PropertyOwner | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly history = signal<OwnerStatement[]>([]);
  readonly payouts = signal<OwnerPayout[]>([]);
  readonly preview = signal<OwnerStatement | null>(null);
  readonly statementLoading = signal(false);
  readonly busy = signal(false);

  readonly editing = signal(false);
  readonly choosingBuildings = signal(false);
  /** The amount to prefill, or null while closed. */
  readonly paying = signal<number | null>(null);
  readonly rateFor = signal<OwnedBuilding | null>(null);

  readonly uid = this.fb.control('', Validators.required);
  readonly rate = this.fb.group({
    commissionType: 'PERCENT_OF_COLLECTED' as CommissionType,
    commissionValue: [0 as number | null, [Validators.required, Validators.min(0)]]
  });

  /** The month's saved statement, if any. */
  readonly saved = computed(() => this.history().find((s) => s.month.slice(0, 7) === this.month()) ?? null);
  /** Saved figures once approved or sent; the live preview otherwise, with the draft's notes and status. */
  readonly statement = computed(() => {
    const saved = this.saved();
    return saved && saved.status !== 'DRAFT' ? saved : (this.preview() ? { ...this.preview()!, notes: saved?.notes ?? null } : null);
  });
  readonly monthName = computed(() => monthLabel(this.month()));
  readonly futureMonth = computed(() => this.month() > thisMonthIso());
  readonly statementSubtitle = computed(() => {
    const saved = this.saved();
    return saved ? `${this.monthName()} · ${STATEMENT_STATUS_LABELS[saved.status!].toLowerCase()}` : `${this.monthName()} · not saved yet`;
  });

  constructor() {
    effect(() => {
      this.agencyId();
      this.id();
      untracked(() => void this.load());
    });
    effect(() => {
      this.month();
      untracked(() => void this.loadPreview());
    });
  }

  async load(): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const [owner, history, payouts] = await Promise.all([
        firstValueFrom(this.owners.get(agencyId, this.id())),
        firstValueFrom(this.owners.statements(agencyId, this.id(), { page: 0, size: 24 })),
        firstValueFrom(this.owners.payouts(agencyId, this.id(), { page: 0, size: 50 }))
      ]);
      this.owner.set(owner);
      this.history.set(history.items);
      this.payouts.set(payouts.items);
      await this.loadPreview();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async loadPreview(): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId === null) {
      return;
    }
    this.statementLoading.set(true);
    try {
      this.preview.set(await firstValueFrom(this.owners.preview(agencyId, this.id(), `${this.month()}-01`)));
    } catch (error) {
      this.preview.set(null);
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.statementLoading.set(false);
    }
  }

  private async refreshHistory(): Promise<void> {
    const agencyId = this.agencyId()!;
    const [history, payouts] = await Promise.all([
      firstValueFrom(this.owners.statements(agencyId, this.id(), { page: 0, size: 24 })),
      firstValueFrom(this.owners.payouts(agencyId, this.id(), { page: 0, size: 50 }))
    ]);
    this.history.set(history.items);
    this.payouts.set(payouts.items);
  }

  async saveDraft(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.owners.saveStatement(this.agencyId()!, this.id(), `${this.month()}-01`, this.saved()?.notes ?? null));
      await Promise.all([this.refreshHistory(), this.loadPreview()]);
      this.toasts.push('success', `${this.monthName()} saved as a draft.`);
    });
  }

  async move(action: 'approve' | 'reopen' | 'send'): Promise<void> {
    const saved = this.saved();
    if (!saved?.id) {
      return;
    }
    if (action === 'send' && !await this.confirm.ask({
      title: `Send ${this.monthName()} to ${this.owner()?.name}?`,
      message: 'They are told by SMS or email, and can see it when they sign in. A sent statement cannot be changed.',
      confirmLabel: 'Send statement'
    })) {
      return;
    }
    await this.run(async () => {
      await firstValueFrom(this.owners.moveStatement(this.agencyId()!, this.id(), saved.id!, action));
      await this.refreshHistory();
      this.toasts.push('success', action === 'approve' ? 'Statement approved.' : action === 'send' ? 'Statement sent.' : 'Statement back to draft.');
    });
  }

  async downloadPdf(statement: OwnerStatement): Promise<void> {
    try {
      const response = await firstValueFrom(this.owners.statementPdf(this.agencyId()!, this.id(), statement.id!));
      saveDownload(response, `owner-statement-${statement.month.slice(0, 7)}.pdf`);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    }
  }

  exportCsv(s: OwnerStatement): void {
    downloadCsv(`owner-statement-${s.ownerName}-${this.month()}`, s.buildings, [
      { header: 'Month', value: () => this.month() },
      { header: 'Building', value: (b) => b.name },
      { header: 'Commission rate', value: (b) => b.commissionLabel },
      { header: 'Rent collected (KES)', value: (b) => b.collected },
      { header: 'Still owed (KES)', value: (b) => b.arrears },
      { header: 'Expenses paid by agency (KES)', value: (b) => b.expensesByAgency },
      { header: 'Expenses paid by owner (KES)', value: (b) => b.expensesByOwner },
      { header: 'Commission (KES)', value: (b) => b.commission },
      { header: 'Rooms', value: (b) => asText(b.rooms) },
      { header: 'Occupied', value: (b) => asText(b.occupied) }
    ]);
  }

  ownerSaved(owner: PropertyOwner): void {
    this.editing.set(false);
    this.owner.set(owner);
    this.toasts.push('success', 'Owner updated.');
    void this.loadPreview();
  }

  buildingsSaved(owner: PropertyOwner): void {
    this.choosingBuildings.set(false);
    this.owner.set(owner);
    this.toasts.push('success', 'Buildings updated.');
    void this.loadPreview();
  }

  payoutSaved(): void {
    this.paying.set(null);
    this.toasts.push('success', 'Payout recorded.');
    void this.refreshHistory();
    void this.loadPreview();
  }

  async deletePayout(payout: OwnerPayout): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete this ${this.money(payout.amount)} ${payout.kind === 'ADVANCE' ? 'advance' : 'payout'}?`,
      message: `Sent on ${this.date(payout.paidOn)}. It stops counting in that month's statement.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }
    await this.run(async () => {
      await firstValueFrom(this.owners.deletePayout(this.agencyId()!, this.id(), payout.id));
      await Promise.all([this.refreshHistory(), this.loadPreview()]);
      this.toasts.push('success', 'Payout deleted.');
    });
  }

  openCommission(building: OwnedBuilding): void {
    const owner = this.owner()!;
    this.rate.reset({
      commissionType: building.commissionType ?? owner.commissionType,
      commissionValue: Number(building.commissionValue ?? owner.commissionValue)
    });
    this.rateFor.set(building);
  }

  async saveRate(building: OwnedBuilding, useOwners: boolean): Promise<void> {
    const v = this.rate.getRawValue();
    if (!useOwners && v.commissionType === 'PERCENT_OF_COLLECTED' && Number(v.commissionValue) > 100) {
      this.toasts.push('error', 'A percentage cannot be more than 100.');
      return;
    }
    await this.run(async () => {
      this.owner.set(await firstValueFrom(this.owners.setBuildingCommission(this.agencyId()!, this.id(), building.id,
        useOwners ? null : v.commissionType, useOwners ? null : Number(v.commissionValue))));
      this.rateFor.set(null);
      await this.loadPreview();
      this.toasts.push('success', `${building.name}'s rate updated.`);
    });
  }

  async grant(owner: PropertyOwner): Promise<void> {
    const uid = this.uid.value.trim();
    if (!uid) {
      this.uid.markAsTouched();
      return;
    }
    await this.run(async () => {
      this.owner.set(await firstValueFrom(this.owners.grantPortalAccess(this.agencyId()!, owner.id, uid)));
      this.uid.reset('');
      this.toasts.push('success', `${owner.name} can now sign in to see their buildings.`);
    });
  }

  async revoke(owner: PropertyOwner): Promise<void> {
    if (!await this.confirm.ask({
      title: `Stop ${owner.name} signing in?`,
      message: 'They will no longer see this agency\'s statements and payouts. Nothing is deleted.',
      confirmLabel: 'Remove sign-in',
      destructive: true
    })) {
      return;
    }
    await this.run(async () => {
      this.owner.set(await firstValueFrom(this.owners.revokePortalAccess(this.agencyId()!, owner.id)));
      this.toasts.push('success', 'Sign-in removed.');
    });
  }

  async remove(owner: PropertyOwner): Promise<void> {
    if (!await this.confirm.ask({
      title: `Remove ${owner.name}?`,
      message: owner.buildings.length
        ? 'Move their buildings to another owner first.'
        : 'Their statements and payouts stay in the records.',
      confirmLabel: 'Remove owner',
      destructive: true
    })) {
      return;
    }
    await this.run(async () => {
      await firstValueFrom(this.owners.delete(this.agencyId()!, owner.id));
      this.toasts.push('success', `${owner.name} removed.`);
      void this.router.navigateByUrl(RoutePaths.owners);
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await work();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  commission(type: CommissionType, value: number | string): string {
    return commissionLabel(type, value);
  }

  tone(status: StatementStatus): string {
    return STATUS_TONE[status];
  }

  statusLabel(status: StatementStatus): string {
    return STATEMENT_STATUS_LABELS[status];
  }

  monthOf(date: string): string {
    return monthLabel(date.slice(0, 7));
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  phone(value: string): string {
    return formatPhone(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
