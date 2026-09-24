import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { RentService } from '../rent.service';
import { RentMpesaCheckout, RentMpesaPaymentStatus, TenantArrearsDetail } from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-my-arrears-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="My rent statement">
        <app-filter-panel actions [form]="form" [scopeControls]=\"['month']\">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="loadMonth()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Month</span><input type="month" formControlName="month"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Load month</button>
              <button type="button" class="btn btn-secondary" (click)="loadCurrent()">Current month</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading your statement..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="loadCurrent()" />
      } @else if (!arrears()) {
        <app-empty-state title="Nothing to show" description="No rent statement exists for that month yet." />
      } @else if (arrears(); as detail) {
        <app-section-card [title]="detail.monthDisplay || 'Statement'">
          <dl class="detail-grid">
            <div><dt>Due date</dt><dd>{{ formatDate(detail.dueDate) }}</dd></div>
            <div><dt>Rent</dt><dd>{{ detail.baseRent ?? '-' }}</dd></div>
            <div><dt>Paid</dt><dd>{{ detail.amountPaid ?? '-' }}</dd></div>
            <div><dt>Carried forward</dt><dd>{{ detail.carryForward ?? '-' }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFee ?? '-' }}</dd></div>
            <div><dt>Credit applied</dt><dd>{{ detail.creditApplied ?? '-' }}</dd></div>
            <div><dt>Charges</dt><dd>{{ detail.totalCharges ?? '-' }}</dd></div>
            <div><dt>Waived</dt><dd>{{ detail.totalWaived ?? '-' }}</dd></div>
            <div><dt>Outstanding</dt><dd><strong>{{ detail.totalOutstanding ?? '-' }}</strong></dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <div class="chip-row">
                  <app-status-chip [status]="detail.paymentStatus" />
                  @if (detail.isProvisional) {
                    <span class="status-chip status-chip--warning">Provisional</span>
                  } @else if (detail.isConfirmed) {
                    <span class="status-chip status-chip--success">Confirmed</span>
                  }
                </div>
              </dd>
            </div>
          </dl>

          @if (detail.isProvisional) {
            <p class="hint">This is a provisional statement. Your landlord may still enter meter readings or adjustments before confirming the month.</p>
          }
        </app-section-card>

        <app-section-card title="Pay by M-Pesa">
          <p class="hint">Request an STK prompt for this month. Leave the amount empty to pay the full outstanding balance.</p>
          <form [formGroup]="paymentForm" appFormFeedback (ngSubmit)="startMpesaPayment()">
            <div class="grid-auto">
              <label class="field"><span>Month</span><input type="month" formControlName="month"></label>
              <label class="field"><span>Amount (optional)</span><input type="number" min="1" step="0.01" formControlName="amount"></label>
            </div>
            @if (paymentError(); as apiError) {
              <app-error-card title="Unable to start payment" [message]="apiError.message" [details]="apiError.details" />
            }
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="startingPayment()">
                {{ startingPayment() ? 'Requesting prompt...' : 'Pay by M-Pesa' }}
              </button>
            </div>
          </form>

          @if (checkout(); as payment) {
            <section class="alert" [class.alert-success]="payment.outcome === 'STK_PUSH_SENT'" [class.alert-error]="payment.outcome === 'PAY_BY_HAND'" role="status">
              <strong>{{ payment.message || (payment.outcome === 'STK_PUSH_SENT' ? 'Check your phone for the M-Pesa prompt.' : 'Use the payment instructions below.') }}</strong>
              @if (payment.checkoutRequestId) {
                <div class="button-row">
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="checkingPayment()" (click)="checkMpesaStatus()">
                    {{ checkingPayment() ? 'Checking...' : 'Check payment status' }}
                  </button>
                </div>
              }
              @if (payment.tillInstructions; as instructions) {
                <dl class="detail-grid payment-instructions">
                  <div><dt>Paybill / till</dt><dd>{{ instructions.payableNumber || '-' }}</dd></div>
                  <div><dt>Account reference</dt><dd>{{ instructions.accountReference || '-' }}</dd></div>
                  <div><dt>Amount</dt><dd>{{ instructions.amount ?? '-' }}</dd></div>
                  @if (instructions.businessName) { <div><dt>Business</dt><dd>{{ instructions.businessName }}</dd></div> }
                </dl>
                @if ((instructions.steps ?? []).length > 0) {
                  <ol class="instructions-list">
                    @for (step of instructions.steps ?? []; track step) { <li>{{ step }}</li> }
                  </ol>
                }
              }
            </section>
          }
          @if (paymentStatus(); as status) {
            <section class="alert" [class.alert-success]="status.settled" role="status">
              <strong>{{ status.status | humanLabel }}</strong> — {{ status.message || 'Payment status updated.' }}
            </section>
          }
        </app-section-card>

        <app-section-card title="Monthly charges">
          @if ((detail.charges ?? []).length === 0) {
            <p class="muted">No additional charges this month.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Charge</th><th>Consumption</th><th>Rate</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (charge of detail.charges ?? []; track charge.id ?? charge.name) {
                    <tr>
                      <td><div class="cell-stack"><strong>{{ charge.name || '-' }}</strong><span class="muted">{{ charge.billingTiming | humanLabel }}</span></div></td>
                      <td>{{ charge.consumption ?? '-' }}{{ charge.unit ? ' ' + charge.unit : '' }}</td>
                      <td>{{ charge.unitRate ?? '-' }}</td>
                      <td>{{ charge.amount ?? '-' }}</td>
                      <td>{{ charge.amountPaid ?? '-' }}</td>
                      <td>{{ charge.balance ?? '-' }}</td>
                      <td>{{ charge.statusLabel || (charge.status | humanLabel) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <app-section-card title="Adjustments">
          @if ((detail.adjustments ?? []).length === 0) {
            <p class="muted">No adjustments were recorded for this month.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Type</th><th>Original</th><th>Adjusted</th><th>Reason</th><th>When</th></tr>
                </thead>
                <tbody>
                  @for (adjustment of detail.adjustments ?? []; track adjustment.id) {
                    <tr>
                      <td>{{ adjustment.adjustmentTypeLabel || (adjustment.adjustmentType | humanLabel) }}</td>
                      <td>{{ adjustment.originalAmount ?? '-' }}</td>
                      <td>{{ adjustment.adjustedAmount ?? '-' }}</td>
                      <td>{{ adjustment.reason || '-' }}</td>
                      <td>{{ formatDate(adjustment.performedAt) }}</td>
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

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .payment-instructions { margin-top: 0.9rem; }
    .instructions-list { margin: 0.8rem 0 0; padding-left: 1.2rem; }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyArrearsPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly arrears = signal<TenantArrearsDetail | null>(null);
  readonly startingPayment = signal(false);
  readonly checkingPayment = signal(false);
  readonly paymentError = signal<ApiError | null>(null);
  readonly checkout = signal<RentMpesaCheckout | null>(null);
  readonly paymentStatus = signal<RentMpesaPaymentStatus | null>(null);

  readonly form = this.formBuilder.group({
    month: this.currentMonth()
  });

  readonly paymentForm = this.formBuilder.group({
    month: this.currentMonth(),
    amount: [null as number | null, [Validators.min(1)]]
  });

  ngOnInit(): void {
    void this.loadCurrent();
  }

  async loadCurrent(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.setArrears(await firstValueFrom(this.rentService.getMyCurrentArrears()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMonth(): Promise<void> {
    const month = this.form.getRawValue().month;
    if (!month) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.setArrears(await firstValueFrom(this.rentService.getMyArrearsForMonth(month)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  async startMpesaPayment(): Promise<void> {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    this.startingPayment.set(true);
    this.paymentError.set(null);
    this.paymentStatus.set(null);

    try {
      const value = this.paymentForm.getRawValue();
      this.checkout.set(await firstValueFrom(this.rentService.initiateMyMpesaPayment({
        month: value.month || null,
        amount: value.amount
      })));
    } catch (error) {
      this.paymentError.set(toApiError(error));
    } finally {
      this.startingPayment.set(false);
    }
  }

  async checkMpesaStatus(): Promise<void> {
    const checkoutRequestId = this.checkout()?.checkoutRequestId;
    if (!checkoutRequestId) {
      return;
    }

    this.checkingPayment.set(true);
    this.paymentError.set(null);
    try {
      const status = await firstValueFrom(this.rentService.getMyMpesaPaymentStatus(checkoutRequestId));
      this.paymentStatus.set(status);
      if (status.settled) {
        await this.loadMonth();
      }
    } catch (error) {
      this.paymentError.set(toApiError(error));
    } finally {
      this.checkingPayment.set(false);
    }
  }

  private setArrears(detail: TenantArrearsDetail): void {
    this.arrears.set(detail);
    const month = detail.month?.slice(0, 7) || this.form.getRawValue().month;
    this.form.controls.month.setValue(month);
    this.paymentForm.controls.month.setValue(month);
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
