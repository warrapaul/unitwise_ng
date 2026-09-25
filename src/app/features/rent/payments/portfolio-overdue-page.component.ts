import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import {
  PortfolioOverduePayment,
  PortfolioOverdueSearchParams,
  ReminderResult
} from '../models/rent.models';
import { DatePipe } from '@angular/common';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { NotificationService } from '../../../core/services/notification.service';
import { RecordPaymentDialogComponent } from '../components/record-payment-dialog.component';
import { ReminderDialogComponent } from '../components/reminder-dialog.component';
import { RentService } from '../rent.service';

@Component({
  selector: 'app-portfolio-overdue-page',
  standalone: true,
  imports: [
    ContextScopeNoticeComponent,
    EntityPickerComponent,
    RoomPickerComponent,
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    LoadingStateComponent,
    PaginationComponent,
    SectionCardComponent,
    DatePipe,
    PermissionGateComponent,
    RecordPaymentDialogComponent,
    ReminderDialogComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Overdue portfolio">
        <app-filter-panel actions [form]="form" (clear)="clear()" [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Overdue as of</span>
                <input type="date" formControlName="asOf">
              </label>
              @if (canChooseBuilding()) {
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
              }
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
              </label>
              <!-- A room is picked inside its building, so only once one is chosen. -->
              @if (context.agencyId() !== null && (form.controls.buildingId.value ?? context.buildingId()) !== null) {
                <label class="field">
                  <span>Room</span>
                  <app-room-picker
                    formControlName="roomId"
                    [agencyId]="context.agencyId()"
                    [buildingId]="form.controls.buildingId.value ?? context.buildingId()"
                  />
                </label>
              }
              <label class="field">
                <span>Search</span>
                <input formControlName="search" placeholder="Name or phone">
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-context-scope-notice noun="overdue payments" />

      @if (loading()) {
        <app-loading-state label="Loading overdue payments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payments().length === 0) {
        <app-empty-state
          title="No overdue payments"
          description="There are no unpaid payments past the selected reference date in your accessible portfolio."
        />
      } @else {
        <section class="panel table-shell">
          @if (selected().length > 0) {
            <div class="bulk">
              <span>{{ selected().length }} selected</span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="reminding.set(selectedPayments())">Send reminders</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="selected.set([])">Clear</button>
            </div>
          }
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th class="check-col">
                    <input type="checkbox" aria-label="Select all" [checked]="allSelected()" (change)="toggleAll($event)">
                  </th>
                  <th>Tenant</th>
                  <th>Location</th>
                  <th>Covers</th>
                  <th>Outstanding</th>
                  <th>Late by</th>
                  <th>Reminded</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (payment of payments(); track payment.paymentId) {
                  <tr>
                    <td class="check-col">
                      <input type="checkbox" [attr.aria-label]="'Select ' + payment.tenantName"
                             [checked]="isSelected(payment)" (change)="toggle(payment)">
                    </td>
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="tenantLink(payment)">{{ payment.tenantName }}</a>
                        @if (payment.tenantPhone) {
                          <span class="phone">
                            <a class="muted" [href]="'tel:' + payment.tenantPhone">{{ payment.tenantPhone }}</a>
                            <button type="button" class="icon-action" (click)="copyPhone(payment)"
                                    [attr.aria-label]="'Copy ' + payment.tenantPhone" title="Copy number">
                              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-copy" /></svg>
                            </button>
                          </span>
                        }
                      </div>
                    </td>
                    <td>
                      <!-- The room identifies a debt on the ground; context the operator already has is left out. -->
                      <div class="cell-stack">
                        <span>{{ roomLabel(payment) }}</span>
                        @if (locationDetail(payment); as detail) {
                          <span class="muted">{{ detail }}</span>
                        }
                      </div>
                    </td>
                    <td><a class="text-link" [routerLink]="detailLink(payment)">{{ displayMonth(payment.paymentForMonth) }}</a></td>
                    <td><strong>{{ payment.totalOutstanding }}</strong></td>
                    <td>{{ payment.daysOverdue }} {{ payment.daysOverdue === 1 ? 'day' : 'days' }}</td>
                    <td class="muted">
                      @if (payment.lastRemindedAt) {
                        {{ payment.lastRemindedAt | date: 'd MMM' }} · {{ payment.reminderCount }}×
                      } @else {
                        -
                      }
                    </td>
                    <td class="actions-col">
                      <div class="row-actions">
                        <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_CREATE]">
                          <button type="button" class="btn btn-primary btn-sm" (click)="paying.set(payment)">Mark paid</button>
                        </app-permission-gate>
                        <button type="button" class="btn btn-secondary btn-sm" (click)="reminding.set([payment])">Remind</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="payments().length"
            [total]="pagination()!.totalElements"
            noun="overdue payments"
            [pagination]="pagination()!"
            [size]="pagination()!.size"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>

    @if (paying(); as payment) {
      <app-record-payment-dialog
        [agencyId]="payment.agencyId"
        [buildingId]="payment.buildingId"
        [tenantId]="payment.tenantId"
        [tenantName]="payment.tenantName"
        [month]="payment.paymentForMonth"
        [amount]="payment.totalOutstanding"
        (recorded)="paid()"
        (closed)="paying.set(null)"
      />
    }

    @if (reminding(); as list) {
      <app-reminder-dialog [payments]="list" (sent)="reminded($event)" (closed)="reminding.set(null)" />
    }
  `,
  styles: [`
    .table-shell { display: grid; gap: 0.75rem; padding: 1rem; }
    .bulk { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; font-weight: 600; }
    .check-col { width: 1%; }
    .actions-col { width: 1%; white-space: nowrap; }
    .row-actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
    .phone { display: inline-flex; align-items: center; gap: 0.35rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PortfolioOverduePageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  readonly context = inject(ActiveContextService);
  readonly pickers = inject(EntityPickerRegistry);

  readonly canChooseBuilding = computed(() =>
    this.context.canChooseBuilding(PermissionConstants.RENT_PAYMENT_READ_ALL));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payments = signal<PortfolioOverduePayment[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly Permissions = PermissionConstants;
  private readonly toasts = inject(NotificationService);
  readonly paying = signal<PortfolioOverduePayment | null>(null);
  readonly reminding = signal<PortfolioOverduePayment[] | null>(null);
  readonly selected = signal<number[]>([]);

  readonly allSelected = computed(() =>
    this.payments().length > 0 && this.payments().every((payment) => this.selected().includes(payment.paymentId)));

  selectedPayments(): PortfolioOverduePayment[] {
    return this.payments().filter((payment) => this.selected().includes(payment.paymentId));
  }

  isSelected(payment: PortfolioOverduePayment): boolean {
    return this.selected().includes(payment.paymentId);
  }

  toggle(payment: PortfolioOverduePayment): void {
    this.selected.update((ids) => ids.includes(payment.paymentId)
      ? ids.filter((id) => id !== payment.paymentId)
      : [...ids, payment.paymentId]);
  }

  toggleAll(event: Event): void {
    this.selected.set((event.target as HTMLInputElement).checked ? this.payments().map((payment) => payment.paymentId) : []);
  }

  tenantLink(payment: PortfolioOverduePayment): string {
    return RoutePaths.tenantDetail(payment.agencyId, payment.buildingId, payment.tenantId);
  }

  /** Building, then agency — each only when the context has not already fixed it. */
  locationDetail(payment: PortfolioOverduePayment): string {
    const parts: string[] = [];
    if (this.context.buildingId() === null) {
      parts.push(payment.buildingName);
    }
    if (this.context.agencies().length > 1 && this.context.agencyId() === null) {
      parts.push(payment.agencyName);
    }
    return parts.filter(Boolean).join(' · ');
  }

  async copyPhone(payment: PortfolioOverduePayment): Promise<void> {
    try {
      await navigator.clipboard.writeText(payment.tenantPhone);
      this.toasts.push('success', 'Number copied.');
    } catch {
      this.toasts.push('error', 'Could not copy — select the number instead.');
    }
  }

  paid(): void {
    this.toasts.push('success', `Payment recorded for ${this.paying()?.tenantName ?? 'the tenant'}.`);
    this.paying.set(null);
    void this.reload();
  }

  /** Rows show the new reminder stamp at once; skipped ones are explained in the dialog. */
  reminded(results: ReminderResult[]): void {
    const sent = results.filter((result) => result.sent);
    this.payments.update((rows) => rows.map((row) => {
      const result = sent.find((entry) => entry.paymentId === row.paymentId);
      return result ? { ...row, lastRemindedAt: result.lastRemindedAt, reminderCount: result.reminderCount } : row;
    }));
    if (sent.length > 0) {
      this.toasts.push('success', `${sent.length} reminder${sent.length === 1 ? '' : 's'} sent.`);
    }
    this.selected.set([]);
  }

  readonly form = this.formBuilder.group({
    asOf: this.today(),
    buildingId: [null as number | null],
    tenantId: [null as number | null],
    roomId: [null as number | null],
    search: '',
    page: 0,
    size: 20
  });

  constructor() {
    // Starts on the building in context and follows the switcher (§30.5);
    // the server still intersects whatever is asked with what the caller may read.
    effect(() => {
      const buildingId = this.context.buildingId();
      this.context.agencyId();
      // A room belongs to one building; switching building leaves it meaningless.
      this.form.patchValue({ buildingId, roomId: null, page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      asOf: this.today(),
      buildingId: this.context.buildingId(),
      tenantId: null,
      roomId: null,
      search: '',
      page: 0,
      size: this.form.controls.size.value
    });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const page = this.pagination()?.page ?? 0;
    if (page > 0) {
      this.form.patchValue({ page: page - 1 });
      await this.reload();
    }
  }

  async nextPage(): Promise<void> {
    const current = this.pagination();
    if (current && !current.isLast) {
      this.form.patchValue({ page: current.page + 1 });
      await this.reload();
    }
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ page: 0, size });
    await this.reload();
  }

  detailLink(payment: PortfolioOverduePayment): string {
    return RoutePaths.rentPaymentDetail(payment.agencyId, payment.buildingId, payment.paymentId);
  }

  roomLabel(payment: PortfolioOverduePayment): string {
    return payment.roomName || `Room ${payment.roomNumber}`;
  }

  displayDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  displayMonth(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const value = this.form.getRawValue();
      const params: PortfolioOverdueSearchParams = {
        asOf: value.asOf,
        agencyId: this.context.agencyId() ?? undefined,
        buildingId: value.buildingId ?? undefined,
        tenantId: value.tenantId ?? undefined,
        roomId: value.roomId ?? undefined,
        search: value.search || undefined,
        page: value.page,
        size: value.size
      };
      const result = await firstValueFrom(this.rentService.getPortfolioOverduePayments(params));
      this.payments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private today(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
