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
            <!-- The title plus whatever belongs beside it, such as a code to copy. -->
            <div class="section-card__title">
              <h2>{{ title() }}</h2>
              <ng-content select="[title-addon]" />
            </div>
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

    /*
     * Title, primary action and the filter toggle share one row. The title
     * takes the slack, so the controls sit together on the right and only wrap
     * when they genuinely cannot fit.
     */
    .section-card__header {
      display: flex;
      align-items: center;
      gap: 0.5rem 0.75rem;
      flex-wrap: wrap;
    }

    .section-card__header > :first-child {
      flex: 1 1 12rem;
      min-width: 0;
    }

    h2, p {
      margin: 0;
    }

    /* Whatever belongs to the title — a code to copy — sits on the line below it. */
    .section-card__title {
      display: grid;
      justify-items: start;
      gap: 0.3rem;
    }

    @media (max-width: 700px) {
      .section-card {
        padding: 0.7rem 0.75rem;
        gap: 0.6rem;
      }

      /*
       * A row, not a column. Stacking the title and its actions spent three
       * rows of a phone screen on chrome before any data appeared; wrapping
       * keeps them together and only breaks when they genuinely will not fit.
       */
      .section-card__header {
        align-items: center;
        gap: 0.5rem 0.6rem;
      }

      /*
       * One action still shares the title's row. Two or more do not: squeezed
       * into the slack beside a title they become a narrow column of
       * half-buttons wrapping at odd points — Edit and Utilities on one line,
       * Delete alone on the next, none of them lining up with anything. Given
       * the full width they lay out as the clean two-column grid they already
       * ask for.
       *
       * An ng-container with the actions attribute renders no element, so the
       * projected button row is the header's own child and can be styled here.
       */
      .section-card__header > .button-row:has(> :nth-child(2)),
      .section-card__header > .detail-actions:has(> :nth-child(2)) {
        flex: 1 1 100%;
      }

      .section-card__header h2 {
        font-size: 1.05rem;
      }

      /*
       * A short title ("Users") next to Search and one primary action fits a
       * phone row; a 12rem basis for the title pushed both controls onto a row
       * of their own. Let it shrink to its words and wrap only when it must.
       */
      .section-card__header > :first-child {
        flex: 1 1 6rem;
      }

      /* The subtitle is the first thing worth losing when space is short. */
      .section-card__header .muted {
        font-size: 0.8rem;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionCardComponent {
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly eyebrow = input<string | null>(null);
}
