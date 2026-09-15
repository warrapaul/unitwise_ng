import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
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
  // `readonly` so the `as const` PermissionSets tuples pass straight in.
  readonly permissions = input<readonly string[]>([]);
  readonly roles = input<readonly UserRole[]>([]);
  readonly requireAll = input(false);
  readonly hasAccess = computed(() => {
    const requiredPermissions = this.permissions();
    const requiredRoles = this.roles();

    const permissionsOk = requiredPermissions.length === 0
      ? true
      : this.requireAll()
        ? this.context.canAll(requiredPermissions)
        : this.context.canAny(requiredPermissions);

    // A role requirement is about the role being worked as, not one held
    // elsewhere, for the same reason.
    const rolesOk = requiredRoles.length === 0
      ? true
      : this.context.isSuperAdmin() || requiredRoles.some((role) => this.context.active().roleName === role);

    return permissionsOk && rolesOk;
  });
}
