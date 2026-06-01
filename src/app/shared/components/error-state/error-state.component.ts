import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <section class="alert alert-error">
      <strong>{{ title() }}</strong>
      <p>{{ message() }}</p>
      @if (retryLabel()) {
        <button type="button" class="btn btn-secondary" (click)="retry.emit()">{{ retryLabel() }}</button>
      }
    </section>
  `,
  styles: [`
    p {
      margin: 0.4rem 0 0;
      color: #9b3f3f;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorStateComponent {
  readonly title = input('Something went wrong');
  readonly message = input('Please try again.');
  readonly retryLabel = input<string | null>('Retry');
  readonly retry = output<void>();
}
