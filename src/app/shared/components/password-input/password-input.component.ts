import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * A password field with a reveal toggle.
 *
 * Typing a password you cannot see, into a field that will reject it for rules
 * you also cannot see, is how people end up locked out of their own accounts.
 * The toggle is a `type="button"` so it never submits the form around it, and it
 * announces its state rather than relying on the icon alone.
 *
 *     <label class="field">
 *       <span>Password</span>
 *       <app-password-input formControlName="password" autocomplete="new-password" />
 *     </label>
 */
@Component({
  selector: 'app-password-input',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => PasswordInputComponent),
    multi: true
  }],
  template: `
    <div class="password">
      <input
        class="password__input"
        [type]="revealed() ? 'text' : 'password'"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [attr.autocomplete]="autocomplete()"
        (input)="onInput($event)"
        (blur)="onTouched()"
      >
      <button
        type="button"
        class="password__toggle"
        [disabled]="disabled()"
        [attr.aria-pressed]="revealed()"
        [attr.aria-label]="revealed() ? 'Hide password' : 'Show password'"
        (click)="toggle()"
      >
        <span aria-hidden="true">{{ revealed() ? '🙈' : '👁' }}</span>
      </button>
    </div>
  `,
  styles: [`
    .password {
      position: relative;
      display: block;
      width: 100%;
    }

    /* Room for the toggle, so a long password never runs under it. */
    .password__input {
      width: 100%;
      padding-inline-end: 3rem;
    }

    .password__toggle {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0.35rem;
      display: grid;
      place-items: center;
      width: 2.25rem;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.95rem;
      line-height: 1;
    }

    .password__toggle:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .password__toggle:hover:not(:disabled) {
      background: var(--surface-2);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordInputComponent implements ControlValueAccessor {
  readonly placeholder = input('');

  /** `current-password` on a login, `new-password` anywhere one is being set. */
  readonly autocomplete = input<string | null>('current-password');

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly revealed = signal(false);

  private onChange: (value: string) => void = () => undefined;
  onTouched: () => void = () => undefined;

  toggle(): void {
    this.revealed.update((shown) => !shown);
  }

  onInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
