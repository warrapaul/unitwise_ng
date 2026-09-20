import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { RentPaymentDetail } from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-rent-payment-detail-page',
  standalone: true,
  imports: [
    PluralPipe,
    ReactiveFormsModule,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.rentPayments" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading payment..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payment(); as detail) {
        <app-section-card
          [title]="detail.receiptNumber || ('Payment #' + detail.id)"
          [subtitle]="detail.tenantName || null"
        >
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_WRITE_ALL, Permissions.RENT_PAYMENT_WRITE]">
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">
                  {{ editing() ? 'Close editor' : 'Edit' }}
                </button>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
                </button>
              </app-permission-gate>
            </div>
          </ng-container>

          <!--
            One card, two states. Showing the record and its editor at once made
            the operator read the same values twice and left it ambiguous which
            set was live. Editing replaces the view; the header, title and
            actions stay put so the page never appears to navigate.
          -->
          @if (!editing()) {
          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Amount paid</dt><dd>{{ detail.amountPaid ?? '-' }}</dd></div>
            <div><dt>Expected</dt><dd>{{ detail.expectedAmount ?? '-' }}</dd></div>
            <div><dt>Carry forward</dt><dd>{{ detail.carryForwardAmount ?? '-' }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFee ?? '-' }}</dd></div>
            <div><dt>Method</dt><dd>{{ detail.paymentMethod | humanLabel }}</dd></div>
            <div><dt>Paid on</dt><dd>{{ formatDate(detail.paymentDate) }}</dd></div>
            <div><dt>Covers</dt><dd>{{ formatMonth(detail.paymentForMonth) }}</dd></div>
            <div><dt>Due date</dt><dd>{{ formatDate(detail.dueDate) }}</dd></div>
            <div><dt>Room</dt><dd>{{ detail.roomName || detail.roomNumber || '-' }}</dd></div>
            <div><dt>Building</dt><dd>{{ detail.buildingName || '-' }}</dd></div>
            <div><dt>Tenant phone</dt><dd class="mono">{{ detail.tenantPhone || '-' }}</dd></div>
          </dl>

          @if (detail.notes) {
            <p class="muted">{{ detail.notes }}</p>
          }
          } @else {
  <form [formGroup]="form" appFormFeedback (ngSubmit)="save()">
              <div class="grid-auto">
                <label class="field">
                  <span>Amount paid</span>
                  <input type="number" step="0.01" min="0" formControlName="amountPaid">
                  @if (form.controls.amountPaid.invalid && form.controls.amountPaid.touched) {
                    <small class="error-text">Amount cannot be negative.</small>
                  }
                </label>
                <label class="field"><span>Payment date</span><input type="date" formControlName="paymentDate"></label>
                <label class="field">
                  <span>Method</span>
                  <select formControlName="paymentMethod">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="MPESA">M-Pesa</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARD">Card</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="OVERPAID">Overpaid</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="FAILED">Failed</option>
                    <option value="REFUNDED">Refunded</option>
                  </select>
                </label>
                <label class="field"><span>Late fee</span><input type="number" step="0.01" min="0" formControlName="lateFee"></label>
                <label class="field"><span>Receipt number</span><input formControlName="receiptNumber"></label>
              </div>

              <label class="field field--wide">
                <span>Notes</span>
                <textarea formControlName="notes" rows="2"></textarea>
              </label>

              @if (saveError(); as apiError) {
                <app-error-card title="Unable to save payment" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : 'Save payment' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">Cancel</button>
              </div>
            </form>
          }
        </app-section-card>

        <app-section-card title="Transactions">
          <ng-container actions>
            <span class="muted">{{ (detail.transactions ?? []).length | plural: 'transaction' }}</span>
          </ng-container>

          @if ((detail.transactions ?? []).length === 0) {
            <p class="muted">No transactions recorded against this payment.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Reference</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (transaction of detail.transactions ?? []; track transaction.id) {
                    <tr>
                      <td class="mono">{{ transaction.referenceNumber || ('#' + transaction.id) }}</td>
                      <td>{{ transaction.amount ?? '-' }}</td>
                      <td>{{ transaction.paymentMethod | humanLabel }}</td>
                      <td>{{ formatDate(transaction.transactionDate) }}</td>
                      <td>
                        <span class="status-chip" [ngClass]="transactionStatusClass(transaction.status)">
                          {{ transaction.status | humanLabel }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentPaymentDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payment = signal<RentPaymentDetail | null>(null);
  readonly deleting = signal(false);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    amountPaid: [null as number | null, [Validators.min(0)]],
    paymentDate: '',
    paymentMethod: 'CASH',
    status: 'PENDING',
    lateFee: [null as number | null, [Validators.min(0)]],
    receiptNumber: '',
    notes: ''
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const payment = await firstValueFrom(this.rentService.getPayment(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.id())
      ));
      this.payment.set(payment);
      this.patchForm(payment);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async toggleEdit(): Promise<void> {
    this.editing.update((value) => !value);
    this.saveError.set(null);

    const payment = this.payment();
    if (this.editing() && payment) {
      this.patchForm(payment);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      this.payment.set(await firstValueFrom(this.rentService.updatePayment(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.id()),
        {
          amountPaid: value.amountPaid,
          paymentDate: value.paymentDate || null,
          paymentMethod: value.paymentMethod as never,
          status: value.status as never,
          lateFee: value.lateFee,
          receiptNumber: value.receiptNumber || null,
          notes: value.notes || null
        }
      )));
      this.editing.set(false);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(payment: RentPaymentDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete ${payment.receiptNumber || 'this payment'}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.rentService.deletePayment(
        Number(this.agencyId()),
        Number(this.buildingId()),
        payment.id
      ));
      await this.router.navigateByUrl(RoutePaths.rentPayments);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }


  transactionStatusClass(status?: string | null): string {
    switch (status) {
      case 'COMPLETED':
        return 'status-chip--success';
      case 'FAILED':
      case 'CANCELLED':
      case 'REVERSED':
        return 'status-chip--danger';
      case 'PENDING':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  formatMonth(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  private patchForm(payment: RentPaymentDetail): void {
    this.form.patchValue({
      amountPaid: payment.amountPaid === null || payment.amountPaid === undefined ? null : Number(payment.amountPaid),
      paymentDate: payment.paymentDate ?? '',
      paymentMethod: payment.paymentMethod ?? 'CASH',
      status: payment.status ?? 'PENDING',
      lateFee: payment.lateFee === null || payment.lateFee === undefined ? null : Number(payment.lateFee),
      receiptNumber: payment.receiptNumber ?? '',
      notes: payment.notes ?? ''
    });
  }
}
