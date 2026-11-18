import { todayIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency } from '../../../shared/utils/format.util';
import { FOLLOW_UP_CHANNELS, FOLLOW_UP_OUTCOMES, FollowUp, FollowUpChannel, FollowUpOutcome } from './follow-ups.models';
import { FollowUpsService } from './follow-ups.service';


/**
 * Logs a call, message or visit to a tenant who is behind, and what came of it. "Promised to pay"
 * asks for the amount and the day; the promise is then judged against what they actually pay.
 */
@Component({
  selector: 'app-follow-up-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, DateDisplayDirective, FormFeedbackDirective, MoneyInputDirective],
  template: `
    <app-dialog title="Follow up" [subtitle]="subtitle()" width="36rem" (closed)="closed.emit()">
      <form id="follow-up-form" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        @if (owed(); as amount) {
          <p class="owed">Owes <strong>{{ money(amount) }}</strong></p>
        }
        <div class="pairs">
          <label class="field">
            <span>How</span>
            <select formControlName="channel">
              @for (option of channels; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
          </label>
          <label class="field">
            <span>What came of it</span>
            <select formControlName="outcome">
              @for (option of outcomes; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
          </label>
        </div>

        @if (promising()) {
          <div class="pairs promise">
            <label class="field">
              <span>Amount promised</span>
              <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span>
                <input appMoneyInput formControlName="promisedAmount" aria-label="Amount promised in KES"></span>
              <app-field-error [control]="form.controls.promisedAmount" label="Amount promised" />
            </label>
            <label class="field">
              <span>To pay by</span>
              <input type="date" appDateDisplay formControlName="promisedDate" [min]="today">
              <app-field-error [control]="form.controls.promisedDate" label="To pay by" />
            </label>
          </div>
          <p class="muted hint">Marked kept as soon as that much is paid; if not, you are told the day after.</p>
        }

        <label class="field">
          <span>Notes <span class="muted">(optional)</span></span>
          <textarea formControlName="notes" rows="2" maxlength="1000" placeholder="What they said"></textarea>
        </label>

        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="follow-up-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : promising() ? 'Record promise' : 'Log it' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .owed { margin: 0; }
    .hint { margin: calc(var(--space-2) * -1) 0 0; font-size: var(--text-sm); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FollowUpDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();
  readonly tenantName = input<string | null>(null);
  readonly roomName = input<string | null>(null);
  /** What they owe, to prefill a promise of the whole amount. */
  readonly owed = input<number | null>(null);

  readonly saved = output<FollowUp>();
  readonly closed = output<void>();

  private readonly followUps = inject(FollowUpsService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly channels = FOLLOW_UP_CHANNELS;
  readonly outcomes = FOLLOW_UP_OUTCOMES;
  readonly today = todayIso();
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    channel: 'CALL' as FollowUpChannel,
    outcome: 'PROMISED' as FollowUpOutcome,
    promisedAmount: [null as number | null],
    promisedDate: todayIso(7),
    notes: ''
  });

  private readonly outcome = toSignal(this.form.controls.outcome.valueChanges, { initialValue: this.form.controls.outcome.value });
  readonly promising = computed(() => this.outcome() === 'PROMISED');
  readonly subtitle = computed(() => [this.tenantName(), this.roomName()].filter(Boolean).join(' · ') || null);

  ngOnInit(): void {
    const owed = this.owed();
    if (owed && owed > 0) {
      this.form.controls.promisedAmount.setValue(owed);
    }
  }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.promising()) {
      if (!v.promisedAmount || v.promisedAmount <= 0) {
        this.form.controls.promisedAmount.setErrors({ required: true });
      }
      if (!v.promisedDate || v.promisedDate < this.today) {
        this.form.controls.promisedDate.setErrors({ required: true });
      }
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.saved.emit(await firstValueFrom(this.followUps.create(this.agencyId(), this.buildingId(), {
        tenantId: this.tenantId(),
        channel: v.channel,
        outcome: v.outcome,
        notes: v.notes.trim() || null,
        promisedAmount: this.promising() ? Number(v.promisedAmount) : null,
        promisedDate: this.promising() ? v.promisedDate : null
      })));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  money(value: number): string {
    return formatCurrency(value);
  }
}
