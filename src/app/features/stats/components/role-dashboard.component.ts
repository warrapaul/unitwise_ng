import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { AgencyDashboardComponent } from './agency-dashboard.component';
import { PlatformDashboardComponent } from './platform-dashboard.component';
import { CaretakerDashboardComponent } from './caretaker-dashboard.component';
import { EcomDashboardComponent } from './ecom-dashboard.component';
import { TenantDashboardComponent } from './tenant-dashboard.component';
import { StatsDomain } from '../models/stats.models';

/**
 * The dashboard for the role the operator is currently working as.
 *
 * There is no single dashboard: a platform admin, an agency admin, a caretaker
 * and an ecommerce admin are asking different questions, and the backend serves
 * a different endpoint for each. The active role decides which — not the user's
 * full permission set, since someone holding two of these switches between them
 * and should see the one they are working in.
 *
 * This file is only the switch. Each dashboard fetches what it needs and
 * decides how to show it, because what a caretaker's day looks like has nothing
 * in common with a platform operator's month beyond the tile component.
 */
@Component({
  selector: 'app-role-dashboard',
  standalone: true,
  imports: [
    AgencyDashboardComponent,
    PlatformDashboardComponent,
    CaretakerDashboardComponent,
    EcomDashboardComponent,
    TenantDashboardComponent
  ],
  template: `
    @switch (domain()) {
      @case ('PLATFORM') { <app-platform-dashboard /> }
      @case ('AGENCY') { <app-agency-dashboard [agencyId]="agencyId()!" /> }
      @case ('CARETAKER') { <app-caretaker-dashboard /> }
      @case ('ECOM') { <app-ecom-dashboard /> }
      @case ('TENANT') { <app-tenant-dashboard /> }
      @default {
        <!--
          A role with no dashboard scope at all — a shopper, say. Nothing to
          show, and a grid of dashes would say less than saying nothing.
        -->
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleDashboardComponent {
  private readonly context = inject(ActiveContextService);

  /** Needed by the agency dashboard, which the backend scopes by path. */
  readonly agencyId = computed(() => this.context.agencyId());

  /**
   * Which dashboard this role gets, most specific first.
   *
   * The active role, not the full permission set: someone holding both platform
   * and agency stats sees the platform view while working as one and the agency
   * view when they switch, because the role they picked is the question they are
   * asking.
   */
  readonly domain = computed<StatsDomain>(() => {
    if (this.context.can(PermissionConstants.STATS_PLATFORM_READ)) {
      return 'PLATFORM';
    }

    if (this.context.can(PermissionConstants.STATS_ECOM_READ)) {
      return 'ECOM';
    }

    if (this.context.can(PermissionConstants.STATS_AGENCY_READ) && this.context.agencyId() !== null) {
      return 'AGENCY';
    }

    if (this.context.can(PermissionConstants.STATS_BUILDING_READ)) {
      return 'CARETAKER';
    }

    /*
     * Last, because it is the least privileged and the most common: anyone
     * holding a staff scope above sees that instead, and a tenant who is also a
     * caretaker somewhere gets the caretaker view while working as one.
     */
    if (this.context.can(PermissionConstants.STATS_TENANT_READ)) {
      return 'TENANT';
    }

    return 'NONE';
  });
}
