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
      margin: 0.4rem 0 0;
    }

    ul {
      margin: 0.5rem 0 0;
      padding-left: 1.1rem;
      display: grid;
      gap: 0.2rem;
      font-size: 0.88rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorCardComponent {
  readonly title = input('Unable to save');
  readonly message = input('Please review the form and try again.');
  readonly details = input<string[]>([]);
}
