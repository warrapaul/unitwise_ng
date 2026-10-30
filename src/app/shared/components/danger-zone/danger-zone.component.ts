import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * The destructive action on a detail page, at the end of it.
 *
 * Delete used to be an icon in the header, a finger's width from Edit — the
 * control used most, beside the one that cannot be undone. Here it is the last
 * thing on the page, worded, and visually apart, so reaching it is a decision
 * rather than a slip. The confirm dialog still follows (§40.1); this only
 * makes sure nobody gets there by accident.
 *
 * Wrap it in a permission gate at the call site, as with any action.
 */
@Component({
  selector: 'app-danger-zone',
  standalone: true,
  template: `
    <section class="danger-zone">
      <div class="danger-zone__copy">
        <h2>{{ label() }}</h2>
        @if (message()) {
          <p class="muted">{{ message() }}</p>
        }
      </div>
      <button type="button" class="btn btn-danger" [disabled]="busy() || disabled()" (click)="pressed.emit()">
        {{ busy() ? busyLabel() : label() }}
      </button>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .danger-zone {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3) var(--space-4);
      flex-wrap: wrap;
      padding: var(--space-4) var(--space-5);
      border: 1px solid var(--danger-border);
      border-radius: var(--radius-xl);
      background: var(--surface);
    }

    .danger-zone__copy { display: grid; gap: var(--space-1); min-width: 0; flex: 1 1 14rem; }
    .danger-zone__copy h2 { margin: 0; font-size: var(--text-md); color: var(--danger); }
    .danger-zone__copy p { margin: 0; font-size: var(--text-sm); }

    @media (max-width: 700px) {
      .danger-zone { padding: var(--space-3) var(--space-3); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DangerZoneComponent {
  /** Names the act and the thing — "Delete building" — and is the button's own label. */
  readonly label = input.required<string>();
  /** What goes with it, when that is not obvious (§28.9). */
  readonly message = input<string | null>(null);
  readonly busy = input(false);
  readonly busyLabel = input('Deleting...');
  readonly disabled = input(false);

  readonly pressed = output<void>();
}
