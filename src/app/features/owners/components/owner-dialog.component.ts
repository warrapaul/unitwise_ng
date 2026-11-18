import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { COMMISSION_TYPES, CommissionType, PAYOUT_METHODS, PayoutMethod, PropertyOwner } from '../owners.models';
import { OwnersService } from '../owners.service';

/** Adds an owner, or corrects one: who they are, what the agency charges them, and where their money goes. */
@Component({
  selector: 'app-owner-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <app-dialog [title]="owner() ? 'Edit owner' : 'Add an owner'" width="40rem" (closed)="closed.emit()">
      <form id="owner-form" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="pairs">
          <label class="field">
            <span>Full name</span>
            <input formControlName="name" maxlength="150" autocomplete="off">
            <app-field-error [control]="form.controls.name" label="Full name" />
          </label>
          <label class="field">
            <span>Phone <span class="muted">(optional)</span></span>
            <input formControlName="phoneNumber" type="tel" maxlength="20" placeholder="0712 345 678">
          </label>
          <label class="field">
            <span>Email <span class="muted">(optional)</span></span>
            <input formControlName="email" type="email" maxlength="150">
            <app-field-error [control]="form.controls.email" label="Email" />
          </label>
          <label class="field">
            <span>ID or company number <span class="muted">(optional)</span></span>
            <input formControlName="idNumber" maxlength="30">
          </label>
        </div>

        <fieldset class="group">
          <legend>What you charge them</legend>
          <div class="pairs">
            <label class="field">
              <span>Commission</span>
              <select formControlName="commissionType">
                @for (option of commissionTypes; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>{{ form.controls.commissionType.value === 'PERCENT_OF_COLLECTED' ? 'Percentage' : 'Monthly fee (KES)' }}</span>
              <input formControlName="commissionValue" type="number" min="0" step="0.01" inputmode="decimal"
                     [max]="form.controls.commissionType.value === 'PERCENT_OF_COLLECTED' ? 100 : null">
              <app-field-error [control]="form.controls.commissionValue" label="Commission" />
            </label>
          </div>
          <p class="muted hint">Applies to all their buildings; a building can have its own on the owner's page.</p>
        </fieldset>

        <fieldset class="group">
          <legend>Where to send their money</legend>
          <div class="pairs">
            <label class="field">
              <span>Paid by</span>
              <select formControlName="payoutMethod">
                <option value="">Not decided</option>
                @for (option of payoutMethods; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>{{ form.controls.payoutMethod.value === 'BANK_TRANSFER' ? 'Bank, branch and account' : form.controls.payoutMethod.value === 'MPESA' ? 'M-Pesa number' : 'Account' }} <span class="muted">(optional)</span></span>
              <input formControlName="payoutAccount" maxlength="150">
            </label>
          </div>
        </fieldset>

        <label class="field">
          <span>Notes <span class="muted">(optional)</span></span>
          <textarea formControlName="notes" rows="2" maxlength="500"></textarea>
        </label>

        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="owner-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : owner() ? 'Save' : 'Add owner' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .group { border: 0; padding: 0; margin: 0; display: grid; gap: var(--space-2); }
    .group legend { font-weight: var(--weight-semibold); margin-bottom: var(--space-2); }
    .hint { margin: 0; font-size: var(--text-sm); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly owner = input<PropertyOwner | null>(null);
  readonly saved = output<PropertyOwner>();
  readonly closed = output<void>();

  private readonly owners = inject(OwnersService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly commissionTypes = COMMISSION_TYPES;
  readonly payoutMethods = PAYOUT_METHODS;
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phoneNumber: '',
    email: ['', Validators.email],
    idNumber: '',
    commissionType: 'PERCENT_OF_COLLECTED' as CommissionType,
    commissionValue: [10 as number | null, [Validators.required, Validators.min(0)]],
    payoutMethod: '' as PayoutMethod | '',
    payoutAccount: '',
    notes: ''
  });

  ngOnInit(): void {
    const existing = this.owner();
    if (existing) {
      this.form.patchValue({
        name: existing.name, phoneNumber: existing.phoneNumber ?? '', email: existing.email ?? '', idNumber: existing.idNumber ?? '',
        commissionType: existing.commissionType, commissionValue: Number(existing.commissionValue),
        payoutMethod: existing.payoutMethod ?? '', payoutAccount: existing.payoutAccount ?? '', notes: existing.notes ?? ''
      });
    }
  }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.form.invalid || (v.commissionType === 'PERCENT_OF_COLLECTED' && Number(v.commissionValue) > 100)) {
      if (Number(v.commissionValue) > 100) {
        this.form.controls.commissionValue.setErrors({ max: { max: 100 } });
      }
      this.form.markAllAsTouched();
      return;
    }
    const request = {
      name: v.name.trim(),
      phoneNumber: v.phoneNumber.trim() || null,
      email: v.email.trim() || null,
      idNumber: v.idNumber.trim() || null,
      commissionType: v.commissionType,
      commissionValue: Number(v.commissionValue),
      payoutMethod: v.payoutMethod || null,
      payoutAccount: v.payoutAccount.trim() || null,
      notes: v.notes.trim() || null
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.owner();
      this.saved.emit(await firstValueFrom(existing
        ? this.owners.update(this.agencyId(), existing.id, request)
        : this.owners.create(this.agencyId(), request)));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
