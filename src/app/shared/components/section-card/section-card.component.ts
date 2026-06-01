import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-section-card',
  standalone: true,
  template: `
    <section class="panel section-card">
      @if (title()) {
        <header class="section-card__header">
          <div>
            @if (eyebrow()) {
              <p class="eyebrow">{{ eyebrow() }}</p>
            }
            <h2>{{ title() }}</h2>
            @if (subtitle()) {
              <p class="muted">{{ subtitle() }}</p>
            }
          </div>
          <ng-content select="[actions]" />
        </header>
      }
      <ng-content />
    </section>
  `,
  styles: [`
    .section-card {
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }

    .section-card__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    h2, p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionCardComponent {
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly eyebrow = input<string | null>(null);
}
