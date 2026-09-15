import { ChangeDetectionStrategy, Component, HostListener, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/** How far down the page counts as "the header card is gone". */
const STICK_AFTER_PX = 140;

/**
 * "‹ Back to buildings" above a detail page's title — and, on a phone, the bar
 * that keeps saying where you are once the title has scrolled away.
 *
 * Back is not an action on the record; it undoes navigation. Rendering it as a
 * button beside Edit, Delete and Utilities gave it the same weight as changing
 * or destroying the thing, and pushed the destructive control into the middle
 * of a row where a mis-click is cheap. A quiet link above the title reads as
 * what it is, and leaves the action row to actions.
 *
 * On a phone a detail page runs several screens, and once the header card is
 * gone there is nothing left saying whose record this is or how to leave it. So
 * past `STICK_AFTER_PX` the bar pins to the top of the viewport carrying the
 * back link and the record's name — and only those two. Edit and Delete stay
 * anchored in the header card: a destructive control permanently under the
 * thumb while someone scrolls to read is a mis-tap waiting to happen.
 *
 * `position: fixed`, not `sticky`, because the bar is a grid item of `.stack`
 * and a grid item's sticky constraint rectangle is its own grid area — one row
 * tall, so it has nowhere to travel and would never pin at all. The host keeps
 * its height while the bar is out of flow, so nothing jumps.
 */
@Component({
  selector: 'app-back-link',
  standalone: true,
  imports: [RouterLink],
  host: {
    '[class.back--stuck]': 'stuck()'
  },
  template: `
    <div class="bar">
      <a class="back" [routerLink]="to()">
        <span class="back__arrow" aria-hidden="true">‹</span>
        <span>{{ label() }}</span>
      </a>
      @if (title()) {
        <span class="bar__title">{{ title() }}</span>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .bar {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      min-width: 0;
    }

    .back {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      flex: none;
    }

    .back:hover {
      color: var(--primary);
    }

    .back__arrow {
      font-size: 1.05rem;
      line-height: 1;
    }

    /*
     * The record's name is redundant on a desktop, where the header card is
     * usually still on screen. It earns its place only in the pinned phone bar.
     */
    .bar__title {
      display: none;
    }

    @media (max-width: 700px) {
      /* Reserved whether or not the bar is currently out of flow. */
      :host {
        min-height: 1.6rem;
      }

      :host(.back--stuck) .bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 40;
        align-items: center;
        padding: 0.6rem 0.9rem;
        /* Opaque — the page scrolls underneath it. */
        background: var(--bg);
        border-bottom: 1px solid var(--border);
        box-shadow: var(--shadow-md);
      }

      :host(.back--stuck) .bar__title {
        display: block;
        min-width: 0;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackLinkComponent {
  readonly to = input.required<string | unknown[]>();
  readonly label = input('Back');
  /** The record's name. Shown only in the pinned phone bar. */
  readonly title = input<string | null>(null);

  readonly stuck = signal(false);

  /**
   * Only ever flips a boolean, and only when it actually changes — a scroll
   * handler that writes a signal on every frame would re-run every computed
   * downstream of it for the length of a flick.
   */
  @HostListener('window:scroll')
  onScroll(): void {
    const past = window.scrollY > STICK_AFTER_PX;
    if (past !== this.stuck()) {
      this.stuck.set(past);
    }
  }
}
