import { todayIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MoreMenuComponent } from '../../../shared/components/more-menu/more-menu.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { asText, downloadCsv, fetchAllPages } from '../../../shared/utils/csv-export.util';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency, formatPhone } from '../../../shared/utils/format.util';
import { CHANNEL_LABELS, CHANNEL_VERBS, FollowUp, FollowUpSearchParams, FollowUpSummary, OUTCOME_LABELS, PROMISE_STATUS } from './follow-ups.models';
import { FollowUpsService } from './follow-ups.service';

type View = 'due' | 'open' | 'broken' | 'kept' | 'all';


/**
 * Chasing rent that is behind: promises due today first, then every open one, how past promises
 * turned out, and the whole contact log. New entries are logged from Rent this month.
 */
@Component({
  selector: 'app-follow-up-list-page',
  standalone: true,
  imports: [RouterLink, CardTableDirective, ContextGuardComponent, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent,
    MoreMenuComponent, PaginationComponent, PermissionGateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="RENT_ARREAR_READ">
        @if (summary(); as s) {
          <div class="kpi-grid" aria-label="Promises to pay">
            <button type="button" class="kpi kpi--button" [class.kpi--bad]="s.dueNow > 0" [class.kpi--active]="view() === 'due'" (click)="show('due')">
              <span class="kpi__label">Due now</span>
              <span class="kpi__value">{{ s.dueNow }}</span>
              <span class="kpi__note">{{ money(s.dueNowAmount) }} promised by today</span>
            </button>
            <button type="button" class="kpi kpi--button" [class.kpi--active]="view() === 'open'" (click)="show('open')">
              <span class="kpi__label">Open promises</span>
              <span class="kpi__value">{{ s.open }}</span>
              <span class="kpi__note">{{ money(s.openAmount) }} in all</span>
            </button>
            <button type="button" class="kpi kpi--button" [class.kpi--good]="(s.keptRate ?? 0) >= 70" [class.kpi--active]="view() === 'kept'" (click)="show('kept')">
              <span class="kpi__label">Kept</span>
              <span class="kpi__value">{{ s.keptRate === null || s.keptRate === undefined ? '—' : s.keptRate + '%' }}</span>
              <span class="kpi__note">{{ s.kept }} of {{ s.kept + s.partlyKept + s.broken }} in 90 days</span>
            </button>
            <button type="button" class="kpi kpi--button" [class.kpi--bad]="s.broken > 0" [class.kpi--active]="view() === 'broken'" (click)="show('broken')">
              <span class="kpi__label">Broken</span>
              <span class="kpi__value">{{ s.broken }}</span>
              <span class="kpi__note">{{ s.partlyKept }} partly kept, 90 days</span>
            </button>
          </div>
        }

        <app-section-card title="Promises and follow-ups" [subtitle]="context.buildingId() ? context.active().buildingName : 'All buildings'">
          <button type="button" actions class="btn btn-secondary" [disabled]="exporting() || items().length === 0" (click)="exportCsv()">
            {{ exporting() ? 'Exporting…' : 'Export CSV' }}
          </button>
          <a actions class="btn btn-secondary" [routerLink]="RoutePaths.rentMonth">Log from Rent this month</a>

          <div class="filter-chips" role="group" aria-label="Show">
            @for (option of views; track option.value) {
              <button type="button" class="filter-chip" [attr.aria-pressed]="view() === option.value" (click)="show(option.value)">{{ option.label }}</button>
            }
          </div>

          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading follow-ups…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (items().length === 0) {
            <app-empty-state [title]="emptyTitle()" description="Log calls, messages and promises from a room's row on Rent this month. Promises are checked against payments automatically." />
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead>
                  <tr><th>Tenant</th><th>Contact</th><th>Promise</th><th class="num">Owes now</th><th><span class="visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  @for (f of items(); track f.id) {
                    <tr>
                      <td class="card-title">
                        <div class="cell-stack">
                          <strong>{{ f.tenantName || 'Tenant' }}</strong>
                          <span class="muted">{{ where(f) }}</span>
                          @if (f.tenantPhone) { <a class="text-link" [href]="'tel:' + f.tenantPhone" (click)="$event.stopPropagation()">{{ phone(f.tenantPhone) }}</a> }
                        </div>
                      </td>
                      <td data-label="Contact">
                        <div class="cell-stack">
                          <span>{{ verb(f) }} · {{ outcome(f) }}</span>
                          <span class="muted small">{{ when(f.contactedAt) }}@if (f.recordedByName) { · {{ f.recordedByName }} }</span>
                          @if (f.notes) { <span class="note">{{ f.notes }}</span> }
                        </div>
                      </td>
                      <td data-label="Promise">
                        @if (f.promiseStatus) {
                          <div class="cell-stack">
                            <span><strong>{{ money(f.promisedAmount) }}</strong> by {{ day(f.promisedDate) }}</span>
                            <span><span class="status-chip" [class]="'status-chip status-chip--' + status(f).tone">{{ status(f).label }}</span>
                              @if (f.promiseStatus === 'OPEN' && f.promisedDate! < todayIso) { <span class="muted small"> · due, checking payments</span> }
                              @if (f.amountPaidByDate !== null && f.amountPaidByDate !== undefined && f.promiseStatus !== 'OPEN' && f.promiseStatus !== 'CANCELLED') {
                                <span class="muted small"> · paid {{ money(f.amountPaidByDate) }}</span>
                              }
                            </span>
                          </div>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="num" data-label="Owes now">{{ money(f.owedNow) }}</td>
                      <td class="row-action">
                        <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                          <app-more-menu [label]="'⋯'">
                            @if (f.promiseStatus === 'OPEN') { <button type="button" (click)="cancel(f)">Call off the promise</button> }
                            <button type="button" (click)="remove(f)">Delete</button>
                          </app-more-menu>
                        </app-permission-gate>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (pagination(); as page) {
              <app-pagination [pagination]="page" [size]="page.size" [shown]="items().length" [total]="page.totalElements"
                              noun="entries" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
            }
          }
        </app-section-card>
      </app-context-guard>
    </section>
  `,
  styles: [`
    .kpi--button { font: inherit; text-align: start; cursor: pointer; }
    .filter-chips { margin-bottom: var(--space-3); }
    .row-action { width: 1%; text-align: right; }
    .small { font-size: var(--text-xs); }
    .note { font-size: var(--text-sm); overflow-wrap: anywhere; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FollowUpListPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly followUps = inject(FollowUpsService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);

  readonly todayIso = todayIso();
  readonly views: { value: View; label: string }[] = [
    { value: 'due', label: 'Due now' },
    { value: 'open', label: 'Open promises' },
    { value: 'broken', label: 'Broken' },
    { value: 'kept', label: 'Kept' },
    { value: 'all', label: 'Everything logged' }
  ];

  readonly view = signal<View>('due');
  readonly items = signal<FollowUp[]>([]);
  readonly summary = signal<FollowUpSummary | null>(null);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly exporting = signal(false);
  private readonly page = signal({ page: 0, size: 20 });

  readonly emptyTitle = computed(() => ({
    due: 'Nothing due today',
    open: 'No open promises',
    broken: 'No broken promises',
    kept: 'No kept promises yet',
    all: 'Nothing logged yet'
  })[this.view()]);

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      untracked(() => {
        this.page.update((p) => ({ ...p, page: 0 }));
        void this.reload();
      });
    });
  }

  private params(): FollowUpSearchParams {
    const base: FollowUpSearchParams = { buildingId: this.context.buildingId() };
    switch (this.view()) {
      case 'due':
        return { ...base, promiseStatus: 'OPEN', dueTo: this.todayIso, sort: ['promisedDate,asc'] };
      case 'open':
        return { ...base, promiseStatus: 'OPEN', sort: ['promisedDate,asc'] };
      case 'broken':
        return { ...base, promiseStatus: 'BROKEN', sort: ['promisedDate,desc'] };
      case 'kept':
        return { ...base, promiseStatus: 'KEPT', sort: ['promisedDate,desc'] };
      default:
        return base;
    }
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const [list, summary] = await Promise.all([
        firstValueFrom(this.followUps.search(agencyId, { ...this.params(), ...this.page() })),
        firstValueFrom(this.followUps.summary(agencyId, this.context.buildingId()))
      ]);
      this.items.set(list.items);
      this.pagination.set(list.pagination ?? null);
      this.summary.set(summary);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  show(view: View): void {
    this.view.set(view);
    this.page.update((p) => ({ ...p, page: 0 }));
    void this.reload();
  }

  go(page: number): void {
    this.page.update((p) => ({ ...p, page: Math.max(0, page) }));
    void this.reload();
  }

  resize(size: number): void {
    this.page.set({ page: 0, size });
    void this.reload();
  }

  async cancel(f: FollowUp): Promise<void> {
    if (!await this.confirm.ask({
      title: `Call off ${f.tenantName}'s promise?`,
      message: `${this.money(f.promisedAmount)} by ${this.day(f.promisedDate)}. It will no longer be checked or counted.`,
      confirmLabel: 'Call it off'
    })) {
      return;
    }
    try {
      await firstValueFrom(this.followUps.cancel(f.agencyId, f.buildingId, f.id));
      this.toasts.push('success', 'Promise called off.');
      void this.reload();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  async remove(f: FollowUp): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Delete this entry?',
      message: `${this.verb(f)} ${f.tenantName} on ${this.when(f.contactedAt)}. It stays in the audit trail.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }
    try {
      await firstValueFrom(this.followUps.delete(f.agencyId, f.buildingId, f.id));
      this.toasts.push('success', 'Entry deleted.');
      void this.reload();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  async exportCsv(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.exporting.set(true);
    try {
      const { rows, truncated } = await fetchAllPages((page, size) => firstValueFrom(this.followUps.search(agencyId, { ...this.params(), page, size })));
      downloadCsv(`follow-ups-${this.view()}`, rows, [
        { header: 'Contacted', value: (f) => f.contactedAt.replace('T', ' ').slice(0, 16) },
        { header: 'Tenant', value: (f) => f.tenantName },
        { header: 'Phone', value: (f) => asText(f.tenantPhone) },
        { header: 'Room', value: (f) => asText(f.roomName) },
        { header: 'Building', value: (f) => f.buildingName },
        { header: 'How', value: (f) => CHANNEL_LABELS[f.channel] },
        { header: 'Outcome', value: (f) => OUTCOME_LABELS[f.outcome] },
        { header: 'Promised (KES)', value: (f) => f.promisedAmount ?? '' },
        { header: 'Promised by', value: (f) => f.promisedDate ?? '' },
        { header: 'Promise', value: (f) => f.promiseStatus ? PROMISE_STATUS[f.promiseStatus].label : '' },
        { header: 'Paid by the date (KES)', value: (f) => f.amountPaidByDate ?? '' },
        { header: 'Owes now (KES)', value: (f) => f.owedNow ?? '' },
        { header: 'Notes', value: (f) => f.notes },
        { header: 'Logged by', value: (f) => f.recordedByName }
      ]);
      this.toasts.push(truncated ? 'warning' : 'success', truncated
        ? `Exported the first ${rows.length.toLocaleString('en-KE')} entries.`
        : `Exported ${rows.length.toLocaleString('en-KE')} entr${rows.length === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.exporting.set(false);
    }
  }

  where(f: FollowUp): string {
    return [f.roomName, f.buildingName].filter(Boolean).join(' · ');
  }

  verb(f: FollowUp): string {
    return CHANNEL_VERBS[f.channel];
  }

  outcome(f: FollowUp): string {
    return OUTCOME_LABELS[f.outcome];
  }

  status(f: FollowUp): { label: string; tone: string } {
    return PROMISE_STATUS[f.promiseStatus!];
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  phone(value: string): string {
    return formatPhone(value);
  }

  day(value: string | null | undefined): string {
    return displayDate(value);
  }

  when(value: string): string {
    return displayDateTime(value);
  }
}
