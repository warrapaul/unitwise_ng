import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * A phone number as people in Kenya write one:
 *   07XX XXX XXX or 01XX XXX XXX  (exactly 10 digits)
 *   +254 7XX XXX XXX / 254 7XX…   (12 digits)
 *   7XX XXX XXX                   (9 digits, the leading 0 dropped)
 *   +<other country>              (8 to 15 digits)
 * So 07883749837 (11 digits) fails: it is a typo, not a number.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (/^0[17]\d{8}$/.test(value)) {
    return true;
  }
  if (/^\+?254[17]\d{8}$/.test(value)) {
    return true;
  }
  if (/^[17]\d{8}$/.test(value)) {
    return true;
  }
  return /^\+(?!254)[1-9]\d{7,14}$/.test(value);
}

/** Empty passes, so optional fields stay optional; add Validators.required where one is needed. */
export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    return !value || isValidPhone(value) ? null : { phone: true };
  };
}
