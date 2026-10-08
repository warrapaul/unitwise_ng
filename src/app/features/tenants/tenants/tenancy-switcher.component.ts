import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TenantPreview } from '../models/tenant.models';

/**
 * "Your tenancies": every tenancy a person holds, as cards to pick from, the one
 * on screen marked. Each card is a single button — anywhere on it picks it — so
 * the radio dot is a sign of the choice, not the only place to make it.
 *
 * Shared by the dashboard and the Tenancy tab so the two never drift apart.
 */
@Component({
  selector: 'app-tenancy-switcher',
  standalone: true,
  template: `
    <section class="switcher" aria-labelledby="tenancies-title">
      <div class="switcher__head">
        <h2 id="tenancies-title">Your tenancies</h2>
        <span class="muted">{{ hint() }}</span>
      </div>
      <div class="switcher__options" role="radiogroup" aria-labelledby="tenancies-title">
        @for (tenancy of tenancies(); track tenancy.id) {
          <button type="button" role="radio" class="option" [class.option--on]="tenancy.id === selectedId()"
                  [attr.aria-checked]="tenancy.id === selectedId()" (click)="selected.emit(tenancy)">
            <span class="option__dot" aria-hidden="true"></span>
            <span class="option__text">
              <span class="option__where">{{ tenancy.buildingName || 'Building' }} · {{ tenancy.roomName || 'Room' }}</span>
              <span class="muted option__agency">{{ tenancy.agencyName }}</span>
            </span>
            @if (tenancy.id === selectedId()) { <span class="status-chip status-chip--info option__tag">Viewing</span> }
          </button>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .switcher { display: grid; gap: 0.7rem; height: 100%; box-sizing: border-box; align-content: start; padding: 1rem 1.15rem;
                border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
    .switcher__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.75rem; }
    .switcher__head h2 { margin: 0; font-size: 1.05rem; }
    .switcher__head .muted { font-size: 0.86rem; }
    .switcher__options { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: 0.6rem; }
    .option { display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.7rem 0.85rem; border: 1px solid var(--border); border-radius: 12px;
              background: var(--surface); color: var(--text); font: inherit; text-align: start; cursor: pointer; }
    .option:hover { border-color: var(--border-strong); background: var(--surface-2); }
    .option--on, .option--on:hover { border: 2px solid var(--primary); background: var(--primary-tint); padding: calc(0.7rem - 1px) calc(0.85rem - 1px); }
    .option > * { pointer-events: none; }
    .option__dot { flex: none; width: 1.05rem; height: 1.05rem; border-radius: 50%; border: 2px solid var(--border-strong); }
    .option--on .option__dot { border-color: var(--primary); background: radial-gradient(var(--primary) 0 45%, transparent 50%); }
    .option__text { display: grid; gap: 0.1rem; min-width: 0; margin-right: auto; }
    .option__where { font-weight: 700; font-size: 0.92rem; }
    .option__agency { font-size: 0.78rem; }
    .option__tag { flex: none; font-size: 0.7rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenancySwitcherComponent {
  readonly tenancies = input.required<TenantPreview[]>();
  readonly selectedId = input<number | null>(null);
  readonly hint = input('Choose one to see its details.');
  readonly selected = output<TenantPreview>();
}
