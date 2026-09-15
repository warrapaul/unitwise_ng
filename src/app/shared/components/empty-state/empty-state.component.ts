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
      gap: 0.75rem;
      justify-items: start;
      padding: 1.4rem;
    }

    h3, p {
      margin: 0;
    }
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
