import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * An amount with thousand separators. A number input cannot show them, so this is a text field with
 * a numeric keypad: separators while it is at rest, plain digits while it is being typed in, and a
 * number (or null) to the form either way.
 */
@Directive({
  selector: 'input[appMoneyInput]',
  standalone: true,
  host: {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    '(input)': 'onInput()',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()'
  },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInputDirective), multi: true }]
})
export class MoneyInputDirective implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private value: number | null = null;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  private display(value: number | null): string {
    return value === null ? '' : value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
  }

  writeValue(value: number | string | null | undefined): void {
    const numeric = value === null || value === undefined || value === '' ? null : Number(value);
    this.value = numeric !== null && Number.isFinite(numeric) ? numeric : null;
    if (document.activeElement !== this.input) {
      this.input.value = this.display(this.value);
    }
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  onInput(): void {
    const [whole, ...rest] = this.input.value.replace(/[^0-9.]/g, '').split('.');
    const cleaned = rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
    if (cleaned !== this.input.value) {
      this.input.value = cleaned;
    }
    this.value = cleaned === '' || cleaned === '.' ? null : Number(cleaned);
    this.onChange(this.value);
  }

  onFocus(): void {
    this.input.value = this.value === null ? '' : String(this.value);
  }

  onBlur(): void {
    this.input.value = this.display(this.value);
    this.onTouched();
  }
}
