import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';

/** A role as the picker shows it. */
export interface RoleCard {
  id: number;
  name: string;
  description?: string | null;
  /** SYSTEM, AGENCY_MANAGEMENT or ECOMMERCE — shown as where the role applies. */
  roleScope?: string | null;
  permissionCount?: number | null;
}

const SCOPE_LABELS: Record<string, string> = {
  SYSTEM: 'Platform',
  AGENCY_MANAGEMENT: 'Agency',
  ECOMMERCE: 'Shop'
};

/**
 * Roles as cards to switch on and off, not a list of ticks.
 *
 * A role is a bundle of power, and the card says what it is for before it is
 * given: its name, what it does, where it applies. The cards that are on are
 * filled and ticked, so what the user will hold reads at a glance, from across
 * the form. Each card is a toggle button; the value is the list of role ids.
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
            <span class="card__body">
              <span class="card__name">{{ title(role.name) }}</span>
              @if (role.description) { <span class="card__desc">{{ role.description }}</span> }
              <span class="card__meta">
                @if (role.roleScope && scopes[role.roleScope]) { <span class="card__scope">{{ scopes[role.roleScope] }}</span> }
                @if (role.permissionCount) { <span>{{ role.permissionCount }} permissions</span> }
              </span>
            </span>
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
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: 0.6rem; }
    .card { display: flex; gap: 0.65rem; align-items: flex-start; padding: 0.75rem 0.85rem; border: 1px solid var(--border); border-radius: 14px;
            background: var(--surface); color: var(--text); font: inherit; text-align: start; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
    .card:hover:not(:disabled) { border-color: var(--border-strong); }
    .card:disabled { opacity: 0.6; cursor: not-allowed; }
    .card--on { border: 2px solid var(--primary); background: var(--primary-tint); padding: calc(0.75rem - 1px) calc(0.85rem - 1px); }
    .card__check { flex: none; display: grid; place-items: center; width: 1.25rem; height: 1.25rem; margin-top: 0.1rem; border-radius: 6px;
                   border: 2px solid var(--border-strong); font-size: 0.8rem; font-weight: 800; color: var(--on-accent); }
    .card--on .card__check { background: var(--primary); border-color: var(--primary); }
    .card__body { display: grid; gap: 0.2rem; min-width: 0; }
    .card__name { font-weight: 700; }
    .card__desc { font-size: 0.84rem; color: var(--text-muted); }
    .card__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; font-size: 0.75rem; color: var(--text-muted); }
    .card__scope { padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--surface-2); font-weight: 700; }
    .card--on .card__scope { background: var(--surface); }
    .summary { margin: 0.5rem 0 0; font-size: 0.85rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolePickerComponent implements ControlValueAccessor {
  readonly roles = input.required<RoleCard[]>();
  readonly label = input('Roles');
  readonly emptyMessage = input('No roles available to assign.');

  readonly scopes = SCOPE_LABELS;
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
