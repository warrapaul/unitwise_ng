import { ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';

/** A role as the picker shows it. */
export interface RoleCard {
  id: number;
  name: string;
  description?: string | null;
  /** SYSTEM, AGENCY_MANAGEMENT or ECOMMERCE. */
  roleScope?: string | null;
  permissionCount?: number | null;
}

/**
 * Roles as a compact multi-select dropdown: the closed field shows what is chosen, the open
 * panel lists every role with a tick box. A list of cards made the user form too long.
 * The value is the list of role ids.
 */
@Component({
  selector: 'app-role-picker',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RolePickerComponent), multi: true }],
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    @if (roles().length === 0) {
      <p class="muted">{{ emptyMessage() }}</p>
    } @else {
      <button type="button" class="trigger" [disabled]="disabled()" aria-haspopup="listbox"
              [attr.aria-expanded]="open()" [attr.aria-label]="label()" (click)="open.set(!open())">
        @if (value().length === 0) {
          <span class="placeholder">Choose roles</span>
        } @else {
          <span class="chips">
            @for (name of selectedList(); track name) { <span class="chip">{{ name }}</span> }
          </span>
        }
        <span class="caret" aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
      </button>
      @if (open()) {
        <div class="menu" role="listbox" aria-multiselectable="true" [attr.aria-label]="label()">
          @for (role of roles(); track role.id) {
            <label class="option" role="option" [attr.aria-selected]="isOn(role.id)">
              <input type="checkbox" [checked]="isOn(role.id)" (change)="toggle(role.id)">
              <span>{{ title(role.name) }}</span>
            </label>
          }
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; position: relative; max-width: 32rem; }
    .trigger { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 2.75rem;
               padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: 10px;
               background: var(--surface); color: var(--text); font: inherit; text-align: start; cursor: pointer; }
    .trigger:hover:not(:disabled) { border-color: var(--border-strong); }
    .trigger:disabled { opacity: 0.6; cursor: not-allowed; }
    .placeholder { color: var(--text-muted); flex: 1; }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); flex: 1; min-width: 0; }
    .chip { padding: var(--space-0-5) var(--space-2); border-radius: 999px; background: var(--primary-tint);
            color: var(--primary); font-size: var(--text-sm); font-weight: var(--weight-medium); }
    .caret { flex: none; color: var(--text-muted); }
    .menu { position: absolute; z-index: 20; inset-inline: 0; top: calc(100% + var(--space-1));
            max-height: 18rem; overflow-y: auto; padding: var(--space-1); border: 1px solid var(--border);
            border-radius: 10px; background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
    .option { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3);
              border-radius: 8px; cursor: pointer; }
    .option:hover { background: var(--surface-2); }
    .option input { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolePickerComponent implements ControlValueAccessor {
  readonly roles = input.required<RoleCard[]>();
  readonly label = input('Roles');
  readonly emptyMessage = input('No roles available to assign.');

  readonly value = signal<number[]>([]);
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly selectedList = computed(() => this.roles().filter((role) => this.isOn(role.id)).map((role) => this.title(role.name)));
  private readonly host = inject(ElementRef<HTMLElement>);

  /** A click anywhere else closes the menu. */
  onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  private onChange: (value: number[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  isOn(id: number): boolean {
    return this.value().includes(id);
  }

  toggle(id: number): void {
    this.value.set(this.isOn(id) ? this.value().filter((item) => item !== id) : [...this.value(), id]);
    this.onChange(this.value());
    this.onTouched();
  }

  title(name: string): string {
    return humanizeLabel(name, name);
  }

  writeValue(value: number[] | null): void {
    this.value.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: number[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
