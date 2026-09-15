import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal
} from '@angular/core';
import { AbstractControl, FormGroupDirective, ValidationErrors } from '@angular/forms';

/**
 * The message under a field, derived from the control's own errors.
 *
 * A form that refuses to submit and says nothing reads as a dead button — the
 * operator has no way to know which field is wrong, or that anything is. Writing
 * that feedback by hand meant it was written for some fields and forgotten for
 * others; this renders it from the validators that are already there.
 *
 *     <label class="field">
 *       <span>Phone number</span>
 *       <input formControlName="phoneNumber">
 *       <app-field-error [control]="form.controls.phoneNumber" label="Phone number"
 *                        patternMessage="9-15 digits, optionally starting with +." />
 *     </label>
 */
@Component({
  selector: 'app-field-error',
  standalone: true,
  template: `
    @if (message(); as text) {
      <small class="error-text">{{ text }}</small>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FieldErrorComponent {
  readonly control = input<AbstractControl | null>(null);

  /** Names the field in the default messages. */
  readonly label = input('This field');

  /** `pattern` is the one validator whose meaning only the page knows. */
  readonly patternMessage = input<string | null>(null);

  /** Overrides by error key, for anything the defaults get wrong. */
  readonly messages = input<Record<string, string>>({});

  /**
   * Errors stay hidden until the operator has *left* the field — or has pressed
   * submit, which is the moment they need to see all of them at once.
   */
  private readonly form = inject(FormGroupDirective, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Suppresses the message while the field has focus.
   *
   * Without this an email reads as invalid from the first keystroke to the last
   * — "j", "ja", "jane@" are all genuinely invalid, and saying so while someone
   * is halfway through typing is nagging, not help. Judge the field when they
   * leave it, and again on submit.
   */
  private readonly focused = signal(false);

  /** Bumped by the control's own event stream: status, touched and dirty. */
  private readonly revision = signal(0);

  readonly message = computed<string | null>(() => {
    this.revision();

    const control = this.control();
    if (!control || !control.errors) {
      return null;
    }

    /*
     * Submit outranks focus, and has to.
     *
     * `appFormFeedback` focuses the first invalid control on submit, so the
     * suppress-while-focused rule fired on the very field the operator was sent
     * to — the message appeared as the button took focus and vanished as focus
     * came back. Pressing submit is the moment every error is wanted, whatever
     * has the caret.
     */
    if (this.form?.submitted) {
      return this.describe(control.errors);
    }

    if (this.focused()) {
      return null;
    }

    if (!control.touched) {
      return null;
    }

    return this.describe(control.errors);
  });

  constructor() {
    // The input lives in the same `.field` label as this component, so the
    // label's focus events are the field's focus events.
    afterNextRender(() => {
      const field = this.host.nativeElement.parentElement;
      if (!field) {
        return;
      }

      field.addEventListener('focusin', this.onFocusIn);
      field.addEventListener('focusout', this.onFocusOut);
      this.destroyRef.onDestroy(() => {
        field.removeEventListener('focusin', this.onFocusIn);
        field.removeEventListener('focusout', this.onFocusOut);
      });
    });

    effect((onCleanup) => {
      const control = this.control();
      if (!control) {
        return;
      }

      // `events` covers touched and pristine changes too, which `statusChanges`
      // alone would miss — and touched is half of when a message appears.
      const subscription = control.events.subscribe(() => this.revision.update((n) => n + 1));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  private readonly onFocusIn = (): void => this.focused.set(true);

  /**
   * Only when focus leaves the field entirely.
   *
   * `focusout` fires before the matching `focusin`, so moving between controls
   * *inside* one field — a password input to its own show/hide toggle — cleared
   * this for a frame and painted the error, which then vanished as focus landed.
   * That is the "flashes and disappears" report: the validation was right, the
   * focus tracking was not.
   */
  private readonly onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    const field = this.host.nativeElement.parentElement;

    if (next && field?.contains(next)) {
      return;
    }

    this.focused.set(false);
  };

  private describe(errors: ValidationErrors): string | null {
    const overrides = this.messages();
    const key = Object.keys(errors).find((candidate) => candidate in overrides) ?? Object.keys(errors)[0];
    if (!key) {
      return null;
    }

    if (overrides[key]) {
      return overrides[key];
    }

    const detail: unknown = errors[key];
    const label = this.label();

    switch (key) {
      case 'required':
        return `${label} is required.`;
      case 'email':
        return 'Enter a valid email address.';
      case 'minlength':
        return `${label} must be at least ${length(detail, 'requiredLength')} characters.`;
      case 'maxlength':
        return `${label} must be at most ${length(detail, 'requiredLength')} characters.`;
      case 'min':
        return `${label} must be at least ${length(detail, 'min')}.`;
      case 'max':
        return `${label} must be at most ${length(detail, 'max')}.`;
      case 'pattern':
        return this.patternMessage() ?? `${label} is not in the expected format.`;
      default:
        return `${label} is not valid.`;
    }
  }
}

function length(detail: unknown, key: string): string {
  return typeof detail === 'object' && detail !== null && key in detail
    ? String((detail as Record<string, unknown>)[key])
    : '';
}
