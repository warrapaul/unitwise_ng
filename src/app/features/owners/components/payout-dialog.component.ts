import { todayIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { PAYOUT_METHODS, PayoutKind, PayoutMethod, PropertyOwner } from '../owners.models';
import { OwnersService } from '../owners.service';


/** Money sent to an owner: what they were owed, or an advance on it. */
@Component({
  selector: 'app-payout-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, DateDisplayDirective, FormFeedbackDirective, MoneyInputDirective],
  template: `
    <app-dialog title="Record money sent" [subtitle]="owner().name" width="36rem" (closed)="closed.emit()">
      <form id="payout-form" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="choice" role="radiogroup" aria-label="Kind">
          <label class="choice__option"><input type="radio" formControlName="kind" value="PAYOUT"> <span><strong>Payout</strong><br><span class="muted">What they are owed for a month</span></span></label>
          <label class="choice__option"><input type="radio" formControlName="kind" value="ADVANCE"> <span><strong>Advance</strong><br><span class="muted">Ahead of rent coming in</span></span></label>
        </div>
        <div class="pairs">
          <label class="field">
            <span>Amount</span>
            <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span>
              <input appMoneyInput formControlName="amount" aria-label="Amount in KES"></span>
            <app-field-error [control]="form.controls.amount" label="Amount" />
          </label>
          <label class="field">
            <span>Sent on</span>
            <input type="date" appDateDisplay formControlName="paidOn" [max]="maxDate">
            <app-field-error [control]="form.controls.paidOn" label="Sent on" />
          </label>
          <label class="field">
            <span>Sent by <span class="muted">(optional)</span></span>
            <select formControlName="method">
              <option value="">Not recorded</option>
              @for (option of methods; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Reference <span class="muted">(optional)</span></span>
            <input formControlName="reference" maxlength="100" class="uppercase">
          </label>
        </div>
        <label class="field">
          <span>Notes <span class="muted">(optional)</span></span>
          <textarea formControlName="notes" rows="2" maxlength="500"></textarea>
        </label>
        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="payout-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Record' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .choice { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); gap: var(--space-2); }
    .choice__option { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; }
    .choice__option:has(input:checked) { border-color: var(--primary); background: var(--primary-tint); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayoutDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly owner = input.required<PropertyOwner>();
  /** Prefilled, e.g. the balance due from the statement. */
  readonly amount = input<number | null>(null);
  readonly saved = output<void>();
  readonly closed = output<void>();

  private readonly owners = inject(OwnersService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly methods = PAYOUT_METHODS;
  readonly maxDate = todayIso();
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    kind: 'PAYOUT' as PayoutKind,
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paidOn: [todayIso(), Validators.required],
    method: '' as PayoutMethod | '',
    reference: '',
    notes: ''
  });

  ngOnInit(): void {
    const amount = this.amount();
    this.form.patchValue({ amount: amount && amount > 0 ? amount : null, method: this.owner().payoutMethod ?? '' });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.owners.recordPayout(this.agencyId(), this.owner().id, {
        kind: v.kind, amount: Number(v.amount), paidOn: v.paidOn, method: v.method || null,
        reference: v.reference.trim() || null, notes: v.notes.trim() || null
      }));
      this.saved.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
