import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionItem } from '../models/stats.models';

/**
 * The part of a dashboard someone acts on.
 *
 * Each item carries its own route, so this links without knowing what any of
 * them are about — a new kind of item appears with a working link the day the
 * backend starts sending it. Ordered by severity, because a dashboard that
 * lists twelve things in arbitrary order is a list, not a priority.
 */
@Component({
  selector: 'app-stat-actions',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (items().length === 0) {
      <p class="muted">Nothing needs attention.</p>
    } @else {
      <!--
        The whole row is the link, rather than a button pinned to the far
        right. At full width that button sat most of a screen away from the
        label it belonged to, so the eye had to travel back and forth to pair
        them — and the row itself, which is what people aim at, did nothing.
      -->
      <ul class="actions">
        @for (item of sorted(); track item.key || item.label) {
          <li>
            @if (item.targetPath) {
              <a
                class="action action--link"
                [class.action--critical]="item.severity === 'CRITICAL'"
                [class.action--warning]="item.severity === 'WARNING'"
                [routerLink]="item.targetPath"
              >
                <span class="action__count">{{ item.count ?? 0 }}</span>
                <span class="action__body">
                  <span class="action__label" [title]="item.label">{{ item.label }}</span>
                  @if (item.oldestItemAgeDays) {
                    <span class="action__age">oldest {{ item.oldestItemAgeDays }}d</span>
                  }
                </span>
                <span class="action__go" aria-hidden="true">›</span>
              </a>
            } @else {
              <span
                class="action"
                [class.action--critical]="item.severity === 'CRITICAL'"
                [class.action--warning]="item.severity === 'WARNING'"
              >
                <span class="action__count">{{ item.count ?? 0 }}</span>
                <span class="action__body">
                  <span class="action__label" [title]="item.label">{{ item.label }}</span>
                  @if (item.oldestItemAgeDays) {
                    <span class="action__age">oldest {{ item.oldestItemAgeDays }}d</span>
                  }
                </span>
              </span>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    /*
     * Columns, not one long row each. Full width, a single column stretched
     * every item to the width of the page, so a count and its label sat in
     * the first fifth and the chevron a screen away — the same pairing
     * problem the button had, moved rather than solved.
     *
     * Severity order survives: the grid flows row-major, so the most urgent
     * is still top-left and the eye reads across then down.
     */
    .actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* The row fills its column, whatever the column turned out to be. */
    .actions > li { display: flex; min-width: 0; }
    .actions > li > * { flex: 1; min-width: 0; }

    .action {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--border);
      border-left-width: 3px;
      border-radius: 10px;
      background: var(--surface);
      color: inherit;
      text-decoration: none;
    }

    .action--link { cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }

    .action--link:hover,
    .action--link:focus-visible {
      background: var(--primary-tint);
      border-color: var(--primary-ring);
    }

    /* The affordance sits with the row, not a screen away from it. */
    .action__go { flex: none; color: var(--text-subtle); font-size: 1.1rem; }
    .action--link:hover .action__go { color: var(--primary-strong); }

    /* Severity on the edge, not as a fill: the row stays readable and the
       scan down the left tells you where to start. */
    .action--warning { border-left-color: var(--warning); }
    .action--critical { border-left-color: var(--danger); }

    .action__count {
      min-width: 2rem;
      font-size: 1.05rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .action__body { display: grid; flex: 1; min-width: 0; }

    .action__label {
      font-size: 0.9rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .action__age { font-size: 0.72rem; color: var(--text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatActionsComponent {
  readonly items = input<ActionItem[]>([]);

  /** Critical first, then by size — the biggest backlog of equal urgency. */
  sorted(): ActionItem[] {
    const rank: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

    return [...this.items()].sort((a, b) => {
      const bySeverity = (rank[a.severity ?? 'INFO'] ?? 2) - (rank[b.severity ?? 'INFO'] ?? 2);
      return bySeverity !== 0 ? bySeverity : (b.count ?? 0) - (a.count ?? 0);
    });
  }
}
