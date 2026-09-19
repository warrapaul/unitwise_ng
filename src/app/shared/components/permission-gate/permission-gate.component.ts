import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { UserRole } from '../../../core/rbac/role.constants';

@Component({
  selector: 'app-permission-gate',
  standalone: true,
  template: `
    @if (hasAccess()) {
      <ng-content />
    } @else {
      <ng-content select="[fallback]" />
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
/**
 * Shows its content when the **active role** allows it (§30).
 *
 * Not "does the user hold this anywhere" — an operator working as an ecommerce
 * admin should not be offered building controls because they also happen to be
 * an agency admin somewhere else. Switching role re-evaluates every gate.
 */
export class PermissionGateComponent {
  private readonly context = inject(ActiveContextService);
  private readonly session = inject(AuthSessionService);
  // `readonly` so the `as const` PermissionSets tuples pass straight in.
  readonly permissions = input<readonly string[]>([]);
  readonly roles = input<readonly UserRole[]>([]);
  readonly requireAll = input(false);

  /**
   * The agency the guarded control acts on, when it acts on a named one.
   *
   * Without it the gate asks only whether the active role holds the
   * permission — which is the right question for a control that acts on
   * whatever is currently selected, and the wrong one for a control on a
   * particular agency's page. An admin of agency A, working as that admin,
   * passes the active-role check on agency B's page too, and is offered a
   * button that 403s.
   *
   * Set it and the gate additionally asks whether the permission is held *in
   * that agency*. It narrows, never widens: the active-role rule still
   * applies, so an operator working as something else is not offered agency
   * controls just because they administer that agency elsewhere.
   */
  readonly agencyId = input<number | string | null | undefined>(undefined);

  readonly hasAccess = computed(() => {
    const requiredPermissions = this.permissions();
    const requiredRoles = this.roles();

    const activeRoleOk = requiredPermissions.length === 0
      ? true
      : this.requireAll()
        ? this.context.canAll(requiredPermissions)
        : this.context.canAny(requiredPermissions);

    // Route inputs arrive as strings, so coerce rather than make every caller
    // remember to. A value that is not a number is treated as no scope at all.
    const raw = Number(this.agencyId());
    const agencyId = Number.isFinite(raw) && raw > 0 ? raw : null;

    const scopeOk = requiredPermissions.length === 0 || agencyId === null || this.context.isSuperAdmin()
      ? true
      : this.requireAll()
        ? requiredPermissions.every((permission) => this.session.hasPermissionInAgency(permission, agencyId))
        : requiredPermissions.some((permission) => this.session.hasPermissionInAgency(permission, agencyId));

    const permissionsOk = activeRoleOk && scopeOk;

    // A role requirement is about the role being worked as, not one held
    // elsewhere, for the same reason.
    const rolesOk = requiredRoles.length === 0
      ? true
      : this.context.isSuperAdmin() || requiredRoles.some((role) => this.context.active().roleName === role);

    return permissionsOk && rolesOk;
  });
}
