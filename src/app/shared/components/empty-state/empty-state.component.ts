import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="empty-state panel">
      <h3>{{ title() }}</h3>
      <p>{{ description() }}</p>
      @if (actionLabel()) {
        @if (actionLink(); as link) {
          <a class="btn btn-primary" [routerLink]="link">{{ actionLabel() }}</a>
        } @else {
          <button type="button" class="btn btn-primary" (click)="action.emit()">{{ actionLabel() }}</button>
        }
      }
    </section>
  `,
  styles: [`
    .empty-state {
      display: grid;
      gap: var(--space-3);
      justify-items: start;
      padding: var(--space-6);
    }

    h3, p {
      margin: 0;
    }

    /*
     * Inside a card it is the card's content, not a second card: no border, fill or
     * padding of its own. A bordered box with 1.5rem of padding inside a padded card
     * was most of the empty space on pages with nothing to show yet.
     */
    :host-context(.section-card) .empty-state {
      gap: var(--space-2);
      padding: var(--space-1) 0;
      border: 0;
      background: none;
      box-shadow: none;
    }
    :host-context(.section-card) h3 { font-size: var(--text-base); font-weight: var(--weight-semibold); }
    :host-context(.section-card) p { font-size: var(--font-description); color: var(--text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmptyStateComponent {
  readonly title = input('Nothing here yet');
  readonly description = input('No records match the current view.');
  readonly actionLabel = input<string | null>(null);
  /** A route for the action. Without one it stays a button and emits `action`. */
  readonly actionLink = input<string | unknown[] | null>(null);
  readonly action = output<void>();
}
