import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
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
import { PaymentReport, RentPaymentMethod } from '../models/rent.models';
import { RentService } from '../rent.service';

/** The proof a landlord can check against: photos and PDFs, as the backend accepts them. */
const PROOF_TYPES = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';
const PROOF_MAX_MB = 10;

/**
 * A tenant telling their landlord "I paid". Nothing changes on the balance until
 * the landlord confirms it, and the dialog says so. Paying in instalments is
 * just reporting each one.
 *
 * Proof is the reference, a photo of the receipt, the confirmation message
 * pasted as received — any one will do, and more helps the landlord match it.
 */
@Component({
  selector: 'app-report-payment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <app-dialog title="Report a payment" subtitle="Your landlord confirms it before it counts toward your balance."
                width="36rem" (closed)="closed.emit()">
      <form id="report-payment" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
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

        <fieldset class="proof">
          <legend>Proof of payment</legend>
          <p class="hint">Any one of the reference above, a photo of the receipt, or the confirmation message.</p>

          <label class="field">
            <span>Photo or PDF of the receipt</span>
            <input type="file" [accept]="proofTypes" (change)="pickFile($event)">
            @if (fileError(); as message) {
              <small class="error-text">{{ message }}</small>
            } @else if (file(); as picked) {
              <small class="hint">{{ picked.name }} · {{ sizeLabel(picked.size) }}</small>
            }
          </label>
          @if (previewUrl(); as url) {
            <img class="proof__preview" [src]="url" alt="The receipt you chose">
          }

          <label class="field">
            <span>Confirmation message</span>
            <textarea formControlName="evidenceText" rows="3"
                      placeholder="Paste the M-Pesa or bank SMS here, as you received it"></textarea>
          </label>
        </fieldset>

        <label class="field">
          <span>Note for your landlord <span class="muted">(optional)</span></span>
          <textarea formControlName="note" rows="2" placeholder="e.g. Second instalment for October"></textarea>
        </label>

        @if (missingProof()) {
          <p class="error-text" role="alert">Add the reference, a photo of the receipt, or the confirmation message.</p>
        }
        @if (error(); as apiError) {
          <app-error-card [title]="apiError.status === 409 ? 'Already reported' : 'Not sent'"
                          [message]="apiError.message" [details]="apiError.details" />
        }
      </form>

      <div dialog-actions>
        <button type="submit" form="report-payment" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Sending...' : 'Send to landlord' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .proof { display: grid; gap: 0.75rem; margin: 0; padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: 12px; }
    .proof legend { padding: 0 0.35rem; font-weight: 600; font-size: 0.9rem; }
    .proof__preview { max-width: 100%; max-height: 14rem; object-fit: contain; border-radius: 10px; border: 1px solid var(--border); justify-self: start; }
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

  readonly reported = output<PaymentReport>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly proofTypes = PROOF_TYPES;
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
  readonly fileError = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);

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
    inject(DestroyRef).onDestroy(() => this.revokePreview());
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

  pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    this.revokePreview();
    this.fileError.set(null);
    this.file.set(null);
    if (!picked) {
      return;
    }
    if (picked.size > PROOF_MAX_MB * 1024 * 1024) {
      this.fileError.set(`That file is over ${PROOF_MAX_MB} MB — take a smaller photo or a screenshot.`);
      input.value = '';
      return;
    }
    this.file.set(picked);
    this.missingProof.set(false);
    if (picked.type.startsWith('image/') && picked.type !== 'image/heic') {
      this.previewUrl.set(URL.createObjectURL(picked));
    }
  }

  sizeLabel(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set(null);
    }
  }
}
