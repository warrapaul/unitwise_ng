import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const PHONE = /^\+?[0-9]{9,15}$/;

/** Empty passes, so optional fields stay optional; add Validators.required where one is needed. */
export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').replace(/[\s-]/g, '');
    return !value || PHONE.test(value) ? null : { phone: true };
  };
}
