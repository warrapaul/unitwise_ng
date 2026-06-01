import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoleConstants, UserRole } from '../../../core/rbac/role.constants';

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PermissionGateComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly permissions = input<string[]>([]);
  readonly roles = input<UserRole[]>([]);
  readonly requireAll = input(false);
  readonly hasAccess = computed(() => {
    if (this.authSession.hasRole(RoleConstants.SUPER_ADMIN)) {
      return true;
    }

    const requiredPermissions = this.permissions();
    const requiredRoles = this.roles();

    const permissionsOk = requiredPermissions.length === 0
      ? true
      : this.requireAll()
        ? requiredPermissions.every((permission) => this.authSession.hasPermission(permission))
        : requiredPermissions.some((permission) => this.authSession.hasPermission(permission));

    const rolesOk = requiredRoles.length === 0
      ? true
      : requiredRoles.some((role) => this.authSession.hasRole(role));

    return permissionsOk && rolesOk;
  });
}
