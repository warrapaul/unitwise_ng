import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SelectOption } from '../searchable-select/searchable-select.component';

/**
 * Multi-value sibling of `app-searchable-select` — a searchable checkbox list
 * whose value is an array of ids. Used where one record holds several of
 * something (a user's roles, a product's tags) and the operator should pick by
 * name rather than typing a comma-separated list of ids.
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MultiSelectComponent),
    multi: true
  }],
  template: `
    <div class="multi">
      @if (selected().length > 0) {
        <div class="multi__chips">
          @for (option of selected(); track option.value) {
            <span class="multi__chip">
              {{ option.label }}
              @if (!disabled()) {
                <button type="button" [attr.aria-label]="'Remove ' + option.label" (click)="toggleValue(option.value)">×</button>
              }
            </span>
          }
        </div>
      }

      <input
        class="multi__search"
        type="text"
        [value]="term()"
        [placeholder]="searchPlaceholder()"
        [disabled]="disabled()"
        (input)="onTerm($event)"
      >

      <div class="multi__list">
        @for (option of filtered(); track option.value) {
          <label class="multi__option">
            <input
              type="checkbox"
              [checked]="isChosen(option.value)"
              [disabled]="disabled()"
              (change)="toggleValue(option.value)"
            >
            <span class="multi__label">{{ option.label }}</span>
            
          </label>
        } @empty {
          <p class="multi__empty">
            {{ options().length === 0 ? emptyMessage() : 'No matches for “' + term() + '”.' }}
          </p>
        }
      </div>
    </div>
  `,
  styles: [`
    .multi {
      display: grid;
      gap: 0.4rem;
      max-width: var(--field-max-width-wide);
    }

    .multi__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .multi__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.22rem 0.5rem;
      border-radius: 999px;
      border: 1px solid var(--primary-soft);
      background: var(--primary-tint);
      color: var(--primary);
      font-size: 0.8rem;
      font-weight: 600;
    }

    .multi__chip button {
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 0.95rem;
      line-height: 1;
      padding: 0;
    }

    .multi__search {
      width: 100%;
      min-height: 2.5rem;
      padding: 0.5rem 0.7rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: 0.9rem;
    }

    .multi__list {
      display: grid;
      gap: 0.1rem;
      max-height: 14rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
      padding: 0.3rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
    }

    .multi__option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.45rem;
      border-radius: 8px;
      font-size: 0.88rem;
      cursor: pointer;
    }

    .multi__option:hover {
      background: var(--surface-2);
    }

    .multi__option input {
      width: auto;
      max-width: none;
    }

    .multi__label {
      flex: 1;
      min-width: 0;
    }

    .multi__empty {
      margin: 0;
      padding: 0.4rem 0.45rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MultiSelectComponent<T = number> implements ControlValueAccessor {
  readonly options = input<SelectOption<T>[]>([]);
  readonly searchPlaceholder = input('Type to filter…');
  readonly emptyMessage = input('Nothing available to choose.');

  readonly values = signal<T[]>([]);
  readonly disabled = signal(false);
  readonly term = signal('');

  readonly selected = computed(() =>
    this.options().filter((option) => this.values().includes(option.value))
  );

  readonly filtered = computed(() => {
    const term = this.term().trim().toLowerCase();
    if (!term) {
      return this.options();
    }

    return this.options().filter((option) =>
      option.label.toLowerCase().includes(term)
    );
  });

  private onChange: (value: T[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: T[] | null): void {
    this.values.set(value ?? []);
  }

  registerOnChange(fn: (value: T[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  isChosen(value: T): boolean {
    return this.values().includes(value);
  }

  onTerm(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
  }

  toggleValue(value: T): void {
    if (this.disabled()) {
      return;
    }

    this.values.update((current) => current.includes(value)
      ? current.filter((existing) => existing !== value)
      : [...current, value]);

    this.onChange(this.values());
    this.onTouched();
  }
}
