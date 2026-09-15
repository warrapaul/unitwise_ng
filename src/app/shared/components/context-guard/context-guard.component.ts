import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { ContextSwitcherComponent } from '../context-switcher/context-switcher.component';

/**
 * Guards a screen that needs an agency — and usually a building — before it can
 * do anything, so the screen itself never handles those states.
 *
 * Two modes:
 *
 *   selection mode (default)  no ids supplied: the guard reads the active
 *                             context and prompts the operator to choose one.
 *                             Use for screens reached from the nav.
 *
 *   validation mode           `agencyId` supplied: the guard checks that
 *                             specific context instead of prompting. Use for
 *                             screens whose ids come from the route, where
 *                             there is nothing to choose.
 *
 * Either way `requirePermission` is checked **against that agency**, mirroring
 * `@agencySecurityService.hasAgencyPermission(#agencyId, #buildingId, 'PERM')`.
 * The same permission can be held in one agency and not another, so a global
 * check would let the screen render and then fail at the first request.
 *
 * `allowOwner` mirrors the "... or is the owner" half of the backend's
 * expressions: when true, the screen renders for a user acting on their own
 * record even without the agency permission.
 */
@Component({
  selector: 'app-context-guard',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, ContextSwitcherComponent],
  template: `
    <!--
      Exactly ONE <ng-content />. Angular projects a component's children into a
      single outlet, so the same slot declared in two branches leaves whichever
      branch is active rendering nothing — which is how a route-addressed detail
      page came out blank while its data loaded fine.
    -->
    @switch (gate()) {
      @case ('no-agency') {
        <app-empty-state
          title="No agency access"
          description="Your account does not administer any agency yet."
        />
      }
      @case ('pick-agency') {
        <section class="panel gate">
          <h3>Which agency?</h3>
          <p class="muted">{{ agencyPrompt() }}</p>
          <app-context-switcher [inline]="true" />
        </section>
      }
      @case ('pick-building') {
        <!--
          A prompt, not a refusal. It names the operation that needs the
          building, because "select a building" on its own reads as the screen
          being broken rather than as one missing answer. A single-building
          agency never reaches here — the switcher selects it on load.
        -->
        <section class="panel gate">
          <h3>Which building?</h3>
          <p class="muted">{{ buildingPrompt() }}</p>
          <app-context-switcher [inline]="true" />
          <a class="btn btn-secondary" [routerLink]="RoutePaths.buildingCreate" [queryParams]="{ agencyId: context.agencyId() }">
            Add a building
          </a>
        </section>
      }
      @case ('denied') {
        <app-empty-state
          title="Not available here"
          [description]="'Your role in ' + (context.active().agencyName || 'this agency') + ' does not include this.'"
        />
      }
      @default {
        <ng-content />
      }
    }
  `,
  styles: [`
    /*
     * A wrapper that only projects content must not own a box. Left as the
     * default inline host, its children stop being items of the enclosing
     * .stack grid, so the gap between them collapses to nothing and the
     * sections it guards render flush against each other.
     */
    :host {
      display: contents;
    }

    .gate {
      display: grid;
      gap: 1rem;
      justify-items: start;
      padding: 1.4rem;
      max-width: 32rem;
    }

    /*
     * The switcher is the point of this screen, so it reads as a control rather
     * than as loose text: boxed, full width, and clearly separated from the
     * sentence explaining why it is being asked for.
     */
    .gate app-context-switcher {
      display: block;
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface-2);
    }

    h3, p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextGuardComponent {
  readonly RoutePaths = RoutePaths;

  buildingPrompt(): string {
    const action = this.action();
    return action
      ? `Pick the building ${action}.`
      : 'This screen works on one building at a time.';
  }

  agencyPrompt(): string {
    const action = this.action();
    return action
      ? `Pick the agency ${action}.`
      : 'Choose the agency you want to work in.';
  }

  /** Require a building, not just an agency. Selection mode only. */
  readonly requireBuilding = input(true);
  /** Permission that must be held within the agency in play. */
  readonly requirePermission = input<string | null>(null);

  /**
   * What the operator was trying to do, as a phrase: "to add this tenant".
   * Named in the prompt so a missing context reads as one more answer needed
   * rather than as the screen having failed.
   */
  readonly action = input<string | null>(null);
  /** Supply to validate a route-supplied context instead of prompting for one. */
  readonly agencyId = input<number | string | null>(null);
  readonly buildingId = input<number | string | null>(null);
  /** Mirrors the "or is the owner" half of the backend's expressions. */
  readonly allowOwner = input(false);

  readonly context = inject(ActiveContextService);
  private readonly session = inject(AuthSessionService);

  readonly hasAnyAgency = computed(() => this.session.agencyGrants().length > 0);

  /** True when ids were supplied, i.e. there is nothing for the user to choose. */
  readonly validating = computed(() => this.toId(this.agencyId()) !== null);

  /**
   * One verdict, so the template has one branch per outcome and one outlet.
   */
  readonly gate = computed<'ok' | 'denied' | 'no-agency' | 'pick-agency' | 'pick-building'>(() => {
    // Ids supplied by the route: nothing to choose, only to authorise.
    if (this.validating()) {
      return this.permitted() ? 'ok' : 'denied';
    }

    if (!this.hasAnyAgency()) {
      return 'no-agency';
    }

    if (!this.context.isAgencyWorkspace() || this.context.agencyId() === null) {
      return 'pick-agency';
    }

    if (this.requireBuilding() && !this.context.hasBuilding()) {
      return 'pick-building';
    }

    return this.permitted() ? 'ok' : 'denied';
  });

  readonly permitted = computed(() => {
    const permission = this.requirePermission();
    if (!permission || this.allowOwner()) {
      return true;
    }

    const agencyId = this.toId(this.agencyId()) ?? this.context.agencyId();
    if (agencyId === null) {
      return true;
    }

    const buildingId = this.toId(this.buildingId()) ?? this.context.buildingId();
    return buildingId === null
      ? this.session.hasPermissionInAgency(permission, agencyId)
      : this.session.hasPermissionInBuilding(permission, agencyId, buildingId);
  });

  private toId(value: number | string | null): number | null {
    if (value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
