import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-error-card',
  standalone: true,
  template: `
    <section class="alert alert-error" role="alert">
      <strong>{{ title() }}</strong>
      <p>{{ message() }}</p>
      @if (details().length > 0) {
        <ul>
          @for (detail of details(); track detail) {
            <li>{{ detail }}</li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    p {
      margin: var(--space-1-5) 0 0;
    }

    ul {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-4);
      display: grid;
      gap: var(--space-1);
      font-size: var(--text-md);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorCardComponent {
  readonly title = input('Unable to save');
  readonly message = input('Please review the form and try again.');
  readonly details = input<string[]>([]);
}
