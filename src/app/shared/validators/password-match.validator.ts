import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates a confirmation field against the password it repeats.
 *
 * Lives on the **confirmation control**, not the group, so the message renders
 * under the field the operator has to fix — a group-level error has no field to
 * attach to, and `app-field-error` would have to be pointed at the whole form.
 *
 * Pair it with `revalidateOnChange`, or the confirmation keeps a stale verdict
 * when the password itself is edited afterwards.
 */
export function matchesControl(passwordKey: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.parent?.get(passwordKey)?.value;

    // An empty confirmation is `required`'s business, not ours — two messages
    // for one empty field is noise.
    if (!control.value) {
      return null;
    }

    return control.value === password ? null : { passwordMismatch: true };
  };
}
