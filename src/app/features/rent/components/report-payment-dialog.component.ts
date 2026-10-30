import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { todayIso } from '../../../shared/utils/date.util';
import { paymentReferenceSpec, paymentReferenceValidator } from '../payment-reference';
import { parsePaymentMessage } from '../payment-message';
import { FileUploadComponent } from '../../../shared/components/files/file-upload/file-upload.component';
import { PaymentReport, RentPaymentMethod } from '../models/rent.models';
import { RentService } from '../rent.service';

/** The proof a landlord can check against: photos and PDFs, as the backend accepts them. */
const PROOF_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const PROOF_MAX_MB = 10;

/**
 * A tenant telling their landlord "I paid". Nothing changes on the balance until
 * the landlord confirms it, and the dialog says so. Paying in instalments is
 * just reporting each one.
 *
 * The confirmation message comes first: pasting it fills in the amount, code
 * and date, which the tenant then checks. Proof is any one of the message, the
 * reference or a photo of the receipt — the photo folded away, since the
 * message usually makes it unnecessary.
 */
@Component({
  selector: 'app-report-payment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective, FileUploadComponent],
  template: `
    <app-dialog title="Report a payment" subtitle="Your landlord confirms it before it counts toward your balance."
                width="36rem" (closed)="closed.emit()">
      <form id="report-payment" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
        <!-- The message first: pasting it fills in the rest, which the tenant then checks. -->
        <label class="field">
          <span>Confirmation message <span class="muted">(recommended)</span></span>
          <textarea formControlName="evidenceText" rows="3" (input)="readMessage()"
                    placeholder="Paste the M-Pesa or bank SMS here, as you received it"></textarea>
          @if (readFields().length > 0) {
            <small class="hint">Filled in from your message: {{ readFields().join(', ') }}. Check them below.</small>
          }
        </label>

        <div class="field-pair">
          <label class="field">
            <span>Amount paid</span>
            <span class="input-prefix"><span class="input-prefix__unit">KES</span>
              <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="amount"></span>
            <app-field-error [control]="form.controls.amount" label="Amount" />
          </label>
          <label class="field">
            <span>For the month of</span>
            <input type="month" formControlName="paymentForMonth" [max]="latestMonth">
          </label>
          <label class="field">
            <span>How you paid</span>
            <select formControlName="paymentMethod">
              <option value="MPESA">M-Pesa</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label class="field">
            <span>Date paid</span>
            <input type="date" formControlName="paidOn" [max]="today">
          </label>
          <!-- Follows the method: an M-Pesa code, a bank reference, a cheque number. -->
          <label class="field">
            <span>{{ reference().label }}</span>
            <input formControlName="referenceNumber" [placeholder]="reference().placeholder"
                   [class.uppercase]="reference().upper" (input)="normaliseReference()">
            @if (form.controls.referenceNumber.errors?.['referencePattern']; as message) {
              @if (form.controls.referenceNumber.touched) { <small class="error-text">{{ message }}</small> }
            } @else if (reference().hint; as hint) {
              <small class="hint">{{ hint }}</small>
            }
          </label>
        </div>

        <!-- Rarely needed once the message is pasted, so folded away until asked for. -->
        <details class="proof" [open]="!!file()">
          <summary>Add a photo or PDF of the receipt <span class="muted">(optional)</span></summary>
          <app-file-upload [types]="proofTypes" [maxSizeMb]="proofMaxMb" label="Receipt"
                           (fileChange)="pickFile($event)" />
        </details>

        <label class="field">
          <span>Note for your landlord <span class="muted">(optional)</span></span>
          <textarea formControlName="note" rows="2" placeholder="e.g. Second instalment for October"></textarea>
        </label>

        @if (outstanding() !== null) {
          <p class="balance">
            <span>Left to pay for this month</span>
            <strong>KES {{ money(outstanding()) }}</strong>
          </p>
          <p class="hint">It goes down once your landlord confirms the payment. Paying more or less is fine — the difference carries over.</p>
        }

        @if (missingProof()) {
          <p class="error-text" role="alert">Add the confirmation message, the reference, or a photo of the receipt.</p>
        }
        @if (error(); as apiError) {
          <app-error-card [title]="apiError.status === 409 ? 'Already reported' : 'Not sent'"
                          [message]="apiError.message" [details]="apiError.details" />
        }
      </form>

      <div dialog-actions>
        <button type="submit" form="report-payment" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Sending...' : 'Submit for confirmation' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .proof { display: grid; gap: var(--space-3); padding: var(--space-2-5) var(--space-3); border: 1px solid var(--border); border-radius: 12px; }
    .proof summary { cursor: pointer; font-weight: var(--weight-semibold); font-size: var(--text-md); }
    .proof[open] summary { margin-bottom: var(--space-2-5); }
    .balance { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-2-5) var(--space-3); border-radius: 10px; background: var(--surface-2); }
    .balance strong { font-variant-numeric: tabular-nums; }
    .uppercase { text-transform: uppercase; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportPaymentDialogComponent implements OnInit {
  readonly tenantId = input.required<number>();
  /** The month it most likely covers, `YYYY-MM` or `YYYY-MM-DD`. */
  readonly month = input.required<string>();
  /** What is owed — the amount's starting value. */
  readonly amount = input<number | string | null>(null);
  /** The month's balance as the bill has it, shown beside the form; null hides it. */
  readonly outstanding = input<number | string | null>(null);

  readonly reported = output<PaymentReport>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly proofTypes = PROOF_TYPES;
  readonly proofMaxMb = PROOF_MAX_MB;
  readonly today = todayIso();
  /** One month ahead at most — the backend's limit. */
  readonly latestMonth = (() => {
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  })();

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly missingProof = signal(false);
  readonly file = signal<File | null>(null);
  /** The fields last filled in from the pasted message, named for the hint under it. */
  readonly readFields = signal<string[]>([]);

  readonly form = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paymentForMonth: ['', [Validators.required]],
    paymentMethod: 'MPESA' as RentPaymentMethod,
    paidOn: [todayIso(), [Validators.required]],
    referenceNumber: ['', [paymentReferenceValidator()]],
    evidenceText: '',
    note: ''
  });

  private readonly method = toSignal(this.form.controls.paymentMethod.valueChanges, { initialValue: this.form.controls.paymentMethod.value });
  readonly reference = computed(() => paymentReferenceSpec(this.method()));

  constructor() {
    this.form.controls.paymentMethod.valueChanges.pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.referenceNumber.updateValueAndValidity());
  }

  ngOnInit(): void {
    this.form.controls.paymentForMonth.setValue(this.month().slice(0, 7));
    const owed = Number(this.amount());
    if (Number.isFinite(owed) && owed > 0) {
      this.form.controls.amount.setValue(owed);
    }
  }

  /** M-Pesa codes are upper case; typing them in lower case is not a mistake worth flagging. */
  normaliseReference(): void {
    if (this.reference().upper) {
      const control = this.form.controls.referenceNumber;
      const upper = control.value.toUpperCase();
      if (upper !== control.value) {
        control.setValue(upper, { emitEvent: false });
      }
    }
  }

  pickFile(file: File | null): void {
    this.file.set(file);
    if (file) {
      this.missingProof.set(false);
    }
  }

  /** Prefills what the message says; anything it does not say is left as the tenant had it. */
  readMessage(): void {
    const parsed = parsePaymentMessage(this.form.controls.evidenceText.value);
    const filled: string[] = [];
    const controls = this.form.controls;
    if (parsed.method && parsed.method !== controls.paymentMethod.value) {
      controls.paymentMethod.setValue(parsed.method);
    }
    if (parsed.amount !== null) {
      controls.amount.setValue(parsed.amount);
      filled.push('amount');
    }
    if (parsed.reference) {
      controls.referenceNumber.setValue(parsed.reference);
      controls.referenceNumber.markAsTouched();
      filled.push('code');
    }
    if (parsed.paidOn && parsed.paidOn <= this.today) {
      controls.paidOn.setValue(parsed.paidOn);
      filled.push('date');
    }
    this.readFields.set(filled);
    if (filled.length > 0) {
      this.missingProof.set(false);
    }
  }

  money(value: number | string | null | undefined): string {
    const parsed = Number(value ?? 0);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const reference = value.referenceNumber.trim();
    const sms = value.evidenceText.trim();
    if (!reference && !sms && !this.file()) {
      this.missingProof.set(true);
      return;
    }
    this.missingProof.set(false);

    this.saving.set(true);
    this.error.set(null);
    try {
      const report = await firstValueFrom(this.rent.reportPayment(this.tenantId(), {
        paymentForMonth: value.paymentForMonth,
        amount: Number(value.amount),
        paymentMethod: value.paymentMethod,
        referenceNumber: reference || null,
        paidOn: value.paidOn,
        evidenceText: sms || null,
        note: value.note.trim() || null
      }, this.file()));
      this.reported.emit(report);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
