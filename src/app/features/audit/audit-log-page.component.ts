import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { PaginatedApiResponse } from '../../core/models/api-response.model';
import { Pagination } from '../../core/models/pagination.model';
import { ActiveContextService } from '../../core/services/active-context.service';
import { WorkingMonthService } from '../../core/services/working-month.service';
import { API_URL } from '../../core/tokens/api-url.token';
import { ContextGuardComponent } from '../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { FilterPanelComponent } from '../../shared/components/filter-panel/filter-panel.component';
import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { MonthNavComponent } from '../../shared/components/month-nav/month-nav.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { humanizeLabel } from '../../shared/pipes/human-label.pipe';
import { asText, downloadCsv, fetchAllPages } from '../../shared/utils/csv-export.util';
import { displayDateTime } from '../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../shared/utils/error-message.util';
import { monthLabel, monthRange } from '../../shared/utils/format.util';
import { buildHttpParams } from '../../shared/utils/query-params.util';

interface AuditEvent {
  id: number;
  occurredAt: string;
  category?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  actorLabel?: string | null;
  summary?: string | null;
  /** {"monthlyRent":{"from":"12000","to":"13500"}} */
  changes?: string | null;
}

interface Change {
  field: string;
  from: string;
  to: string;
}

/** The record types the server logs, as a landlord would name them. */
const RECORD_TYPES: { value: string; label: string }[] = [
  { value: 'Agency', label: 'Agency settings' },
  { value: 'AgencyAdmin', label: 'Administrators' },
  { value: 'Building', label: 'Buildings' },
  { value: 'Room', label: 'Rooms' },
  { value: 'Tenant', label: 'Tenants' },
  { value: 'LeaseAgreement', label: 'Leases' },
  { value: 'LeaseAmendment', label: 'Lease amendments' },
  { value: 'RentPayment', label: 'Rent payments' },
  { value: 'RentAdjustment', label: 'Rent adjustments' },
  { value: 'RentUtilityChargeTemplate', label: 'Charges' },
  { value: 'TenantDocument', label: 'Tenant documents' },
  { value: 'Expense', label: 'Expenses' },
  { value: 'PropertyOwner', label: 'Owners' },
  { value: 'OwnerStatement', label: 'Owner statements' },
  { value: 'OwnerPayout', label: 'Owner payouts' },
  { value: 'MessageTemplate', label: 'Message templates' },
  { value: 'Announcement', label: 'Announcements' },
  { value: 'MoveOutInspection', label: 'Move-out inspections' },
  { value: 'BillingInvoice', label: 'Subscription invoices' }
];

/**
 * Who changed what, and when: rent terms, administrators, M-Pesa settings, templates and the rest,
 * each with the values before and after. Read-only; the agency's own trail, or the platform's.
 */
@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [ReactiveFormsModule, ContextGuardComponent, EmptyStateComponent, ErrorStateComponent, FilterPanelComponent,
    LoadingStateComponent, MonthNavComponent, PaginationComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="AUDIT_READ">
        <app-section-card title="Activity log" [subtitle]="monthName() + ' · ' + (context.active().agencyName ?? 'All agencies')">
          <button type="button" actions class="btn btn-secondary" [disabled]="exporting() || items().length === 0" (click)="exportCsv()">
            {{ exporting() ? 'Exporting…' : 'Export CSV' }}</button>
          <app-filter-panel actions [form]="form" (clear)="clear()">
            <form class="filters" [formGroup]="form" (ngSubmit)="apply()">
              <div class="grid-auto filters-grid">
                <div class="field"><span>Month</span><app-month-nav [(month)]="month" /></div>
                <label class="field"><span>Record</span>
                  <select formControlName="entityType">
                    <option value="">Anything</option>
                    @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                  </select></label>
                <label class="field"><span>Action</span>
                  <select formControlName="action">
                    <option value="">Any</option>
                    <option value="CREATED">Added</option>
                    <option value="UPDATED">Changed</option>
                    <option value="DELETED">Removed</option>
                  </select></label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-text" (click)="clear()">Clear</button>
              </div>
            </form>
          </app-filter-panel>

          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading activity…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (items().length === 0) {
            <app-empty-state title="Nothing logged" [description]="'No changes match in ' + monthName() + '. Try another month or record.'" />
          } @else {
            <ol class="log">
              @for (e of items(); track e.id) {
                <li class="log__item">
                  <div class="log__head">
                    <strong>{{ e.summary || what(e) }}</strong>
                    <span class="muted small">{{ when(e.occurredAt) }} · {{ e.actorLabel || 'System' }}</span>
                  </div>
                  <span class="muted small">{{ record(e) }}@if (e.entityId) { #{{ e.entityId }} } · {{ verb(e.action) }}</span>
                  @if (changesOf(e); as list) {
                    @if (list.length) {
                      <ul class="changes">
                        @for (c of list; track c.field) {
                          <li><span class="changes__field">{{ c.field }}</span> <s class="muted">{{ c.from || '—' }}</s> → <strong>{{ c.to || '—' }}</strong></li>
                        }
                      </ul>
                    }
                  }
                </li>
              }
            </ol>
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
    .log { list-style: none; margin: 0; padding: 0; display: grid; }
    .log__item { display: grid; gap: var(--space-1); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
    .log__item:last-child { border-bottom: 0; }
    .log__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1) var(--space-3); }
    .changes { margin: var(--space-1) 0 0; padding-left: 1.1rem; display: grid; gap: var(--space-0-5); font-size: var(--text-sm); overflow-wrap: anywhere; }
    .changes__field { font-weight: var(--weight-semibold); }
    .small { font-size: var(--text-xs); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuditLogPageComponent {
  readonly context = inject(ActiveContextService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  readonly types = RECORD_TYPES;
  readonly month = inject(WorkingMonthService).month;
  readonly form = inject(NonNullableFormBuilder).group({ entityType: '', action: '' });
  private readonly applied = signal(this.form.getRawValue());
  readonly items = signal<AuditEvent[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly exporting = signal(false);
  private readonly page = signal({ page: 0, size: 20 });
  readonly monthName = computed(() => monthLabel(this.month()));

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      this.month();
      untracked(() => {
        this.page.update((p) => ({ ...p, page: 0 }));
        void this.reload();
      });
    });
  }

  /** The agency's own trail; the platform's whole trail when no agency is in play. */
  private search(page: number, size: number) {
    const agencyId = this.context.agencyId();
    const { from, to } = monthRange(this.month());
    const v = this.applied();
    const params = buildHttpParams({
      buildingId: this.context.buildingId(), entityType: v.entityType || null, action: v.action || null,
      from: `${from}T00:00:00`, to: `${to}T23:59:59`, page, size
    });
    const path = agencyId !== null ? ApiUrls.auditAgency(agencyId) : ApiUrls.audit;
    return this.http.get<PaginatedApiResponse<AuditEvent>>(`${this.apiUrl}/${path}`, { params })
      .pipe(map((r) => ({ items: r.data ?? [], pagination: r.pagination })));
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.search(this.page().page, this.page().size));
      this.items.set(result.items);
      this.pagination.set(result.pagination ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  apply(): void {
    this.applied.set(this.form.getRawValue());
    this.page.update((p) => ({ ...p, page: 0 }));
    void this.reload();
  }

  clear(): void {
    this.form.reset({ entityType: '', action: '' });
    this.apply();
  }

  go(page: number): void {
    this.page.update((p) => ({ ...p, page: Math.max(0, page) }));
    void this.reload();
  }

  resize(size: number): void {
    this.page.set({ page: 0, size });
    void this.reload();
  }

  async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const { rows } = await fetchAllPages((page, size) => firstValueFrom(this.search(page, size)));
      downloadCsv(`activity-${this.month()}`, rows, [
        { header: 'When', value: (e) => e.occurredAt.replace('T', ' ').slice(0, 19) },
        { header: 'Who', value: (e) => e.actorLabel ?? 'System' },
        { header: 'Record', value: (e) => this.record(e) },
        { header: 'Record id', value: (e) => asText(e.entityId) },
        { header: 'Action', value: (e) => this.verb(e.action) },
        { header: 'Summary', value: (e) => e.summary ?? '' },
        { header: 'Changes', value: (e) => (this.changesOf(e) ?? []).map((c) => `${c.field}: ${c.from} -> ${c.to}`).join('; ') }
      ]);
    } finally {
      this.exporting.set(false);
    }
  }

  /** The changed fields, readable; empty when there were none or they could not be read. */
  changesOf(e: AuditEvent): Change[] {
    if (!e.changes) {
      return [];
    }
    try {
      const parsed = JSON.parse(e.changes) as Record<string, { from?: unknown; to?: unknown }>;
      return Object.entries(parsed).map(([field, change]) => ({
        field: humanizeLabel(field.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(), field),
        from: change?.from === null || change?.from === undefined ? '' : String(change.from),
        to: change?.to === null || change?.to === undefined ? '' : String(change.to)
      }));
    } catch {
      return [];
    }
  }

  record(e: AuditEvent): string {
    return RECORD_TYPES.find((t) => t.value === e.entityType)?.label ?? humanizeLabel(e.entityType ?? '', 'Record');
  }

  what(e: AuditEvent): string {
    return `${this.record(e)} ${this.verb(e.action).toLowerCase()}`;
  }

  verb(action: string): string {
    return ({ CREATED: 'Added', UPDATED: 'Changed', DELETED: 'Removed' } as Record<string, string>)[action] ?? humanizeLabel(action, action);
  }

  when(value: string): string {
    return displayDateTime(value);
  }
}
