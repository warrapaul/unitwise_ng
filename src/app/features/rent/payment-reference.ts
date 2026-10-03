import { AbstractControl, ValidationErrors } from '@angular/forms';

/** What the reference field asks for, by how the money came in. */
export interface PaymentReferenceSpec {
  label: string;
  placeholder: string;
  hint: string | null;
  /** Normalises as typed (an M-Pesa code is upper case). */
  upper: boolean;
  pattern: RegExp | null;
  patternMessage: string | null;
}

const SPECS: Record<string, PaymentReferenceSpec> = {
  MPESA: { label: 'M-Pesa transaction code', placeholder: 'e.g. QGR4T6Y7U8', hint: 'From the M-Pesa confirmation SMS — 10 letters and digits.',
           upper: true, pattern: /^[A-Z0-9]{10}$/, patternMessage: 'An M-Pesa code is 10 letters and digits.' },
  CHEQUE: { label: 'Cheque number', placeholder: 'e.g. 004512', hint: null, upper: false, pattern: null, patternMessage: null },
  BANK_TRANSFER: { label: 'Bank reference', placeholder: 'e.g. FT2609241234', hint: null, upper: false, pattern: null, patternMessage: null },
  CARD: { label: 'Card receipt number', placeholder: 'From the card slip', hint: null, upper: false, pattern: null, patternMessage: null },
  CASH: { label: 'Receipt number (optional)', placeholder: 'If you issued one', hint: null, upper: false, pattern: null, patternMessage: null }
};

const OTHER: PaymentReferenceSpec = { label: 'Reference', placeholder: '', hint: null, upper: false, pattern: null, patternMessage: null };

/**
 * The reference field follows the method: "M-Pesa transaction code" with its
 * 10-character shape for M-Pesa, "Cheque number" for a cheque. One free-text
 * "Reference" made every method look alike and let a mistyped code through.
 */
export function paymentReferenceSpec(method: string | null | undefined): PaymentReferenceSpec {
  return (method && SPECS[method]) || OTHER;
}

/** Validates the reference against the method held by the sibling `methodControl` name. */
export function paymentReferenceValidator(methodControl = 'paymentMethod') {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    const method = control.parent?.get(methodControl)?.value as string | undefined;
    const spec = paymentReferenceSpec(method);
    if (!value || !spec.pattern) {
      return null;
    }
    return spec.pattern.test(value.toUpperCase()) ? null : { referencePattern: spec.patternMessage };
  };
}
