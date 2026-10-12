import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
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
 * Roles as cards to switch on and off, not a list of ticks.
 *
 * Each card shows the role's name only, one per row: the descriptions made a
 * short choice read like a page of text. The cards that are on are filled and
 * ticked, so what the user will hold reads at a glance. Each card is a toggle
 * button; the value is the list of role ids.
 */
@Component({
  selector: 'app-role-picker',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RolePickerComponent), multi: true }],
  template: `
    @if (roles().length === 0) {
      <p class="muted">{{ emptyMessage() }}</p>
    } @else {
      <div class="cards" role="group" [attr.aria-label]="label()">
        @for (role of roles(); track role.id) {
          <button type="button" class="card" [class.card--on]="isOn(role.id)" [attr.aria-pressed]="isOn(role.id)"
                  [disabled]="disabled()" (click)="toggle(role.id)">
            <span class="card__check" aria-hidden="true">{{ isOn(role.id) ? '✓' : '' }}</span>
            <span class="card__name">{{ title(role.name) }}</span>
          </button>
        }
      </div>
      <p class="muted summary" aria-live="polite">
        {{ value().length === 0 ? 'No role selected.' : value().length + ' selected: ' + selectedNames() }}
      </p>
    }
  `,
  styles: [`
    :host { display: block; }
    /* One role per row, under the label: the names are short, so a list scans faster than a grid. */
    .cards { display: grid; gap: 0.5rem; max-width: 32rem; }
    .card { display: flex; gap: 0.75rem; align-items: center; padding: 1rem 0.95rem; border: 1px solid var(--border); border-radius: 14px;
            background: var(--surface); color: var(--text); font: inherit; text-align: start; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
    .card:hover:not(:disabled) { border-color: var(--border-strong); }
    .card:disabled { opacity: 0.6; cursor: not-allowed; }
    .card--on { border: 2px solid var(--primary); background: var(--primary-tint); padding: calc(1rem - 1px) calc(0.95rem - 1px); }
    .card__check { flex: none; display: grid; place-items: center; width: 1.25rem; height: 1.25rem; border-radius: 6px;
                   border: 2px solid var(--border-strong); font-size: 0.8rem; font-weight: 800; color: var(--on-accent); }
    .card--on .card__check { background: var(--primary); border-color: var(--primary); }
    .card__name { font-weight: 700; min-width: 0; }
    .summary { margin: 0.5rem 0 0; font-size: 0.85rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolePickerComponent implements ControlValueAccessor {
  readonly roles = input.required<RoleCard[]>();
  readonly label = input('Roles');
  readonly emptyMessage = input('No roles available to assign.');

  readonly value = signal<number[]>([]);
  readonly disabled = signal(false);

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

  selectedNames(): string {
    return this.roles().filter((role) => this.isOn(role.id)).map((role) => this.title(role.name)).join(', ');
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
