import { ChangeDetectionStrategy, Component, computed, forwardRef, input, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption<T = number> {
  value: T;
  label: string;
}

/**
 * A `<select>` replacement for bounded lists that are fetched whole — categories,
 * roles, counties — where the operator should never have to know an id, but the
 * list is small enough not to need a server search.
 *
 * Type-to-filter over the labels. For unbounded, server-searched entities use
 * `app-entity-picker` instead (skills §11/§20).
 */
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SearchableSelectComponent),
    multi: true
  }],
  template: `
    <!--
      focusout rather than a document click listener: it fires when focus
      genuinely leaves the component, so a click inside the panel does not
      dismiss it and no global handler has to be reasoned about.
    -->
    <div class="select" [class.select--open]="open()" (focusout)="onFocusOut($event)">
      <button
        type="button"
        class="select__control"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
        (keydown)="onControlKeydown($event)"
      >
        <span class="select__value" [class.select__value--empty]="!selected()">
          {{ selected()?.label ?? placeholder() }}
        </span>
        <span class="select__caret" aria-hidden="true">▾</span>
      </button>

      @if (open()) {
        <div class="select__panel" role="listbox">
          <input
            class="select__search"
            type="text"
            [value]="term()"
            [placeholder]="searchPlaceholder()"
            (input)="onTerm($event)"
            (keydown)="onSearchKeydown($event)"
            #search
          >

          <div class="select__list">
            @if (!required()) {
              <button type="button" class="select__option" (click)="choose(null)">
                {{ emptyOptionLabel() }}
              </button>
            }

            @for (option of filtered(); track option.value) {
              <button
                type="button"
                class="select__option"
                [class.select__option--active]="option.value === value()"
                role="option"
                [attr.aria-selected]="option.value === value()"
                (click)="choose(option)"
              >
                <span>{{ option.label }}</span>
              </button>
            } @empty {
              <p class="select__empty">No matches for “{{ term() }}”.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .select {
      position: relative;
      width: 100%;
      max-width: var(--field-max-width);
    }

    .select__control {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      min-height: 2.7rem;
      padding: 0.6rem 0.75rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .select__control:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .select--open .select__control {
      border-color: var(--primary);
      box-shadow: 0 0 0 4px var(--primary-ring);
    }

    .select__value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .select__value--empty {
      color: var(--text-subtle);
    }

    .select__caret {
      color: var(--text-muted);
      font-size: 0.7rem;
    }

    .select__panel {
      position: absolute;
      z-index: 40;
      top: calc(100% + 0.3rem);
      left: 0;
      right: 0;
      display: grid;
      gap: 0.4rem;
      padding: 0.5rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }

    .select__search {
      width: 100%;
      min-height: 2.3rem;
      padding: 0.45rem 0.6rem;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: 0.88rem;
    }

    .select__list {
      display: grid;
      gap: 0.1rem;
      max-height: 15rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
    }

    .select__option {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.6rem;
      width: 100%;
      padding: 0.45rem 0.55rem;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 0.88rem;
      text-align: left;
      cursor: pointer;
    }

    .select__option:hover {
      background: var(--surface-2);
    }

    .select__option--active {
      background: var(--primary-tint);
      color: var(--primary);
      font-weight: 600;
    }

    .select__empty {
      margin: 0;
      padding: 0.5rem 0.55rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchableSelectComponent<T = number> implements ControlValueAccessor {
  readonly options = input<SelectOption<T>[]>([]);
  readonly placeholder = input('Select…');
  readonly searchPlaceholder = input('Type to filter…');
  readonly emptyOptionLabel = input('None');
  /** Hides the "None" row — use when the form control is required. */
  readonly required = input(false);
  readonly selectionChange = output<SelectOption<T> | null>();

  readonly value = signal<T | null>(null);
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly term = signal('');

  readonly selected = computed(() =>
    this.options().find((option) => option.value === this.value()) ?? null
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

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: T | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }

    this.open.update((value) => !value);
    if (!this.open()) {
      this.onTouched();
    } else {
      this.term.set('');
    }
  }

  onTerm(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
  }

  onControlKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      if (!this.open()) {
        this.toggle();
      }
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }

    // Enter picks the only remaining match — the common case after typing.
    if (event.key === 'Enter') {
      event.preventDefault();
      const matches = this.filtered();
      if (matches.length === 1) {
        this.choose(matches[0]);
      }
    }
  }

  /** Closes when focus leaves the component, not when it moves inside it. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) {
      return;
    }

    this.onTouched();
    this.open.set(false);
    this.term.set('');
  }

  choose(option: SelectOption<T> | null): void {
    this.value.set(option?.value ?? null);
    this.onChange(option?.value ?? null);
    this.selectionChange.emit(option);
    this.close();
  }

  private close(): void {
    this.open.set(false);
    this.onTouched();
  }
}
