import { thisMonthIso, todayIso } from '../../../shared/utils/date.util';
import { toMonthPath } from '../models/rent.models';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { CreateRentPaymentRequest } from '../models/rent.models';

/**
 * Records a rent payment against a tenant in the building in context.
 *
 * `RentService.createPayment` existed with no page: an agency admin holding
 * RENT_PAYMENT_CREATE could read payments but never enter one, which is the
 * single most routine thing the role does.
 */
@Component({
  selector: 'app-rent-payment-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ContextGuardComponent,
    SectionCardComponent,
    EntityPickerComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="true" [requirePermission]="Permissions.RENT_PAYMENT_CREATE">
        <app-section-card
          title="Record a rent payment"
          [subtitle]="context.active().buildingName ? 'For ' + context.active().buildingName : null"
        >

          <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <div class="grid-auto">
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker
                  [config]="pickers.tenant"
                  [required]="true"
                  formControlName="tenantId"
                  placeholder="Search for the tenant"
                />
                <app-field-error [control]="form.controls.tenantId" label="Tenant" />
              </label>
              <label class="field">
                <span>Amount paid</span>
                <input type="number" min="0" step="0.01" formControlName="amountPaid">
                <app-field-error [control]="form.controls.amountPaid" label="Amount paid" />
              </label>
              <label class="field">
                <span>Payment date</span>
                <input type="date" formControlName="paymentDate">
                <app-field-error [control]="form.controls.paymentDate" label="Payment date" />
              </label>
              <label class="field">
                <span>For month</span>
                <input type="month" formControlName="paymentForMonth">
                <app-field-error [control]="form.controls.paymentForMonth" label="Payment month" />
              </label>
              <label class="field">
                <span>Method</span>
                <select formControlName="paymentMethod">
                  <option value="MPESA">M-Pesa</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label class="field">
                <span>Late fee</span>
                <input type="number" min="0" step="0.01" formControlName="lateFee">
              </label>
              <label class="field">
                <span>Receipt number</span>
                <input formControlName="receiptNumber">
              </label>
              <label class="field field--full">
                <span>Notes</span>
                <textarea formControlName="notes" rows="3"></textarea>
              </label>
            </div>

            @if (saveError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'This payment is already recorded' : 'Unable to record the payment'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Recording...' : 'Record payment' }}
              </button>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.rentPayments">Cancel</a>
            </div>
          </form>
        </app-section-card>
      </app-context-guard>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentPaymentFormPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly context = inject(ActiveContextService);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    tenantId: [null as number | null, [Validators.required]],
    amountPaid: [null as number | null, [Validators.required, Validators.min(0)]],
    paymentDate: [todayIso(), [Validators.required]],
    paymentForMonth: [thisMonthIso(), [Validators.required]],
    paymentMethod: ['MPESA', [Validators.required]],
    lateFee: [null as number | null, [Validators.min(0)]],
    receiptNumber: [''],
    notes: ['']
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const scope = this.context.active();
    const value = this.form.getRawValue();
    if (scope.agencyId === null || scope.buildingId === null || value.tenantId === null || value.amountPaid === null) {
      return;
    }

    const request: CreateRentPaymentRequest = {
      tenantId: value.tenantId,
      amountPaid: value.amountPaid,
      paymentDate: value.paymentDate,
      paymentForMonth: toMonthPath(value.paymentForMonth),
      paymentMethod: value.paymentMethod as CreateRentPaymentRequest['paymentMethod'],
      lateFee: value.lateFee,
      receiptNumber: value.receiptNumber || null,
      notes: value.notes || null
    };

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const created = await firstValueFrom(this.rent.createPayment(scope.agencyId, scope.buildingId, request));
      await this.router.navigateByUrl(RoutePaths.rentPaymentDetail(scope.agencyId, scope.buildingId, created.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
