import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  template: `
    <section class="loading-state panel">
      <div class="spinner"></div>
      <p>{{ label() }}</p>
    </section>
  `,
  styles: [`
    .loading-state {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 1rem 1.2rem;
    }

    .spinner {
      width: 1rem;
      height: 1rem;
      border-radius: 999px;
      border: 2px solid rgba(15, 23, 42, 0.12);
      border-top-color: var(--primary);
      animation: spin 0.9s linear infinite;
    }

    p {
      margin: 0;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingStateComponent {
  readonly label = input('Loading...');
}
