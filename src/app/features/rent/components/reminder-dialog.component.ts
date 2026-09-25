import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { PortfolioOverduePayment, ReminderKind, ReminderResult } from '../models/rent.models';
import { RentService } from '../rent.service';

/**
 * A reminder or a warning to one or many overdue tenants. The server writes the
 * amount owed into the message and refuses a second within 24 hours, so the
 * operator only chooses the tone and, optionally, adds a line.
 */
@Component({
  selector: 'app-reminder-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FormFeedbackDirective],
  template: `
    <app-dialog [title]="payments().length === 1 ? 'Send reminder' : 'Send reminders'" [subtitle]="subtitle()" (closed)="closed.emit()">
      <form id="send-reminder" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="send()">
        <fieldset class="kinds">
          <legend class="visually-hidden">Tone</legend>
          <label class="checkbox-field"><input type="radio" formControlName="kind" value="REMINDER"><span>Reminder</span></label>
          <label class="checkbox-field"><input type="radio" formControlName="kind" value="WARNING"><span>Warning</span></label>
        </fieldset>
        <label class="field">
          <span>Add a line (optional)</span>
          <textarea formControlName="message" rows="2" maxlength="500"></textarea>
          <small class="hint">The amount owed is included for you.</small>
        </label>

        @if (skipped().length > 0) {
          <ul class="skipped">
            @for (result of skipped(); track result.paymentId) {
              <li><strong>{{ nameOf(result.paymentId) }}</strong> — {{ result.skippedReason || 'not sent' }}</li>
            }
          </ul>
        }
        @if (error(); as apiError) {
          <app-error-card title="Unable to send" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>

      <div dialog-actions>
        @if (done()) {
          <button type="button" class="btn btn-primary" (click)="closed.emit()">Done</button>
        } @else {
          <button type="submit" form="send-reminder" class="btn btn-primary" [disabled]="sending()">
            {{ sending() ? 'Sending...' : 'Send' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
        }
      </div>
    </app-dialog>
  `,
  styles: [`
    .kinds { display: flex; gap: 1.25rem; margin: 0; padding: 0; border: 0; }
    .skipped { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.2rem; font-size: 0.88rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReminderDialogComponent {
  readonly payments = input.required<PortfolioOverduePayment[]>();

  /** Every result, sent or skipped — the page updates its rows from these. */
  readonly sent = output<ReminderResult[]>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly sending = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly skipped = signal<ReminderResult[]>([]);
  readonly done = signal(false);

  readonly form = this.fb.group({
    kind: 'REMINDER' as ReminderKind,
    message: ''
  });

  subtitle(): string {
    const list = this.payments();
    return list.length === 1 ? list[0].tenantName : `${list.length} tenants`;
  }

  nameOf(paymentId: number): string {
    return this.payments().find((payment) => payment.paymentId === paymentId)?.tenantName ?? `Record #${paymentId}`;
  }

  async send(): Promise<void> {
    const { kind, message } = this.form.getRawValue();
    const list = this.payments();
    this.sending.set(true);
    this.error.set(null);
    try {
      const results = list.length === 1
        ? [await firstValueFrom(this.rent.remind(list[0].agencyId, list[0].buildingId, list[0].paymentId, kind, message.trim()))]
        : await firstValueFrom(this.rent.remindAll(list.map((payment) => payment.paymentId), kind, message.trim()));
      this.sent.emit(results);

      // All went: nothing left to say. Some skipped: say which and why, then Done.
      const skipped = results.filter((result) => !result.sent);
      if (skipped.length === 0) {
        this.closed.emit();
      } else {
        this.skipped.set(skipped);
        this.done.set(true);
      }
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.sending.set(false);
    }
  }
}
