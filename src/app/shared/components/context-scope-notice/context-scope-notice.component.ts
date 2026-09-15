import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';

/**
 * Says out loud that a list is showing part of the data, and why.
 *
 * A list narrowed by the active context looks identical to a list that is
 * simply short — so an operator who set a building two screens ago, or who
 * inherited a stored context from last week, reads four tenants as "we have
 * four tenants". That is the bug this exists to prevent: not a missing
 * filter, a **silently applied** one.
 *
 * It renders nothing when nothing is narrowing the view, so pages can mount it
 * unconditionally above their results.
 */
@Component({
  selector: 'app-context-scope-notice',
  standalone: true,
  template: `
    @if (scopeLabel(); as label) {
      <p class="scope-notice">
        <span class="scope-notice__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16"><use href="#act-filter" /></svg>
        </span>
        <span>
          Showing {{ noun() }} for <strong>{{ label }}</strong> only.
        </span>
        @if (canClear()) {
          <button type="button" class="scope-notice__clear" (click)="clear()">
            Show all {{ widerLabel() }}
          </button>
        }
      </p>
    }
  `,
  styles: [`
    :host { display: contents; }

    .scope-notice {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin: 0;
      padding: 0.6rem 0.85rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-lg);
      background: var(--primary-tint);
      font-size: 0.88rem;
    }

    .scope-notice__icon { display: inline-flex; color: var(--primary-strong); }

    /* A link, not a button: it undoes a filter, it does not submit anything. */
    .scope-notice__clear {
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary-strong);
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextScopeNoticeComponent {
  /** What the page lists, in plural lowercase — "tenants", "leases", "messages". */
  readonly noun = input('records');

  private readonly context = inject(ActiveContextService);

  /** The narrowest tier actually in force; the building wins over the agency. */
  readonly scopeLabel = computed(() => {
    const active = this.context.active();

    if (active.buildingId !== null) {
      return active.buildingName ?? `Building #${active.buildingId}`;
    }

    // An agency alone narrows the view too, but only say so when the operator
    // could actually be seeing more — a single-agency admin has no wider view,
    // and telling them they are filtered is noise.
    if (active.agencyId !== null && this.context.showAgencyTier() && this.hasWiderReach()) {
      return active.agencyName ?? `Agency #${active.agencyId}`;
    }

    return null;
  });

  /** Only a building can be dropped from here; clearing the agency is the switcher's job. */
  readonly canClear = computed(() => this.context.buildingId() !== null);

  readonly widerLabel = computed(() => {
    const agencyName = this.context.active().agencyName;
    return agencyName ? `in ${agencyName}` : 'in this agency';
  });

  /** Only worth mentioning the agency when there is more than one to be in. */
  private hasWiderReach(): boolean {
    return this.context.agencies().length > 1;
  }

  clear(): void {
    this.context.clearBuilding();
  }
}
