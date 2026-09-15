import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthSessionService } from './auth-session.service';
import { AgencyGrant } from '../rbac/authority.util';
import { PermissionConstants } from '../rbac/permission.constants';
import { RoleConstants } from '../rbac/role.constants';

/**
 * What the operator is working as, and what they are working on.
 *
 * **Three tiers**, because conflating them made agency switching invisible:
 *
 *   role       personal | a system role | an agency role
 *   agency     which agency that role is being exercised in
 *   building   which building inside it
 *
 * The agency tier used to be folded into the role tier — one option per
 * *agency*, labelled "Riverside · CARETAKER". Switching agency was possible but
 * looked like switching role, and with a single agency there was no visible
 * agency control at all. A role is a job; an agency is where you do it today.
 *
 * One context is one **role**. A user who is an ecommerce admin and a support
 * admin holds two contexts, not one merged super-role; a user with a role in
 * three agencies holds three. `activePermissions` is that one role's permission
 * set and nothing else, which is what the nav and every `app-permission-gate`
 * render from — so switching context genuinely changes what the app offers.
 *
 * This remains a **view scope, not a security boundary**. The server authorises
 * every request itself; narrowing here stops the UI offering an operator
 * controls that belong to a different job, it does not enforce anything.
 */
export type ContextKind = 'none' | 'role' | 'agency';

export interface ContextOption {
  kind: ContextKind;
  /** Stable id used for persistence and comparison. */
  key: string;
  label: string;
  roleName: string | null;
  /**
   * For an agency role, every agency where it is held — the choices behind the
   * agency tier. Empty for personal and system roles.
   */
  agencies: readonly AgencyGrant[];
  /** Exactly this role's permissions — never a union across roles. */
  permissions: ReadonlySet<string>;
}

export interface ActiveContext {
  kind: ContextKind;
  key: string;
  label: string;
  agencyId: number | null;
  agencyName: string | null;
  roleName: string | null;
  buildingId: number | null;
  buildingName: string | null;
  permissions: ReadonlySet<string>;
}

interface PersistedContext {
  key: string;
  /** `null` is "all agencies"; absent is "never chosen". They differ. */
  agencyId?: number | null;
  buildingId: number | null;
}

/*
 * Versioned. v1 wrote `agencyId: null` to mean "nothing selected"; the tri-state
 * reads a present null as "explicitly all agencies", so a stale v1 payload
 * resolved to no agency at all and the switcher said "No agency" for a landlord
 * who has exactly one. Bumping the key retires those payloads rather than
 * guessing what an old null meant.
 */
const STORAGE_PREFIX = 'unitwise_context_v2_';

const EMPTY_PERMISSIONS: ReadonlySet<string> = new Set<string>();

/** ECOMMERCE_ADMIN -> "Ecommerce admin". */
function roleLabel(roleName: string): string {
  const words = roleName.toLowerCase().split('_').filter(Boolean);
  if (words.length === 0) {
    return roleName;
  }

  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}

@Injectable({ providedIn: 'root' })
export class ActiveContextService {
  private readonly session = inject(AuthSessionService);

  private readonly selectedKey = signal<string | null>(null);
  /**
   * Tri-state, and the three states are genuinely different:
   *   `undefined` — never chosen, so the first agency is used
   *   `null`      — explicitly "all my agencies", for work that cuts across them
   *   number      — that agency
   * Collapsing "not chosen" into "all" would silently unscope every list.
   */
  private readonly selectedAgencyId = signal<number | null | undefined>(undefined);
  private readonly selectedBuildingId = signal<number | null>(null);
  private readonly selectedBuildingName = signal<string | null>(null);

  /** Every role the signed-in user could work as, one option each. */
  readonly options = computed<ContextOption[]>(() => {
    const authorities = this.session.authorities();
    /*
     * Only roles the backend granted. "My account" used to sit at the top as a
     * permission-less context, which read as a role the user could work as and
     * showed them an empty app if they picked it. Personal screens are reachable
     * from the nav regardless of the active role, so the entry bought nothing.
     */
    const options: ContextOption[] = [];

    /*
     * Agency grants first, grouped by ROLE rather than by agency: being
     * AGENCY_ADMIN of three agencies is one job done in three places, and the
     * agency is a separate choice below.
     */
    const byRole = new Map<string, AgencyGrant[]>();
    for (const grant of this.session.agencyGrants()) {
      const roleName = grant.roleName ?? 'Agency';
      byRole.set(roleName, [...(byRole.get(roleName) ?? []), grant]);
    }

    /*
     * The profile lists an agency role twice — once in `roles` and again in
     * `agencyRoles` — so an agency admin of one agency was offered "Agency
     * admin" twice and the switcher appeared for a user with a single role.
     *
     * The agency-scoped entry is the real one: it knows where the role is held.
     * A global entry of the same name is the same role with nowhere to work, and
     * picking it would unscope every list.
     */
    for (const role of authorities.globalRoles) {
      if (byRole.has(role.roleName)) {
        continue;
      }

      // One option per system-wide role. Never one merged "Administration": an
      // ecommerce admin and a support admin do different jobs.
      options.push({
        kind: 'role',
        key: `role:${role.roleName}`,
        label: roleLabel(role.roleName),
        roleName: role.roleName,
        agencies: [],
        permissions: role.permissions
      });
    }

    for (const [roleName, grants] of byRole) {
      options.push({
        kind: 'agency',
        key: `agency-role:${roleName}`,
        label: roleLabel(roleName),
        roleName,
        agencies: grants,
        permissions: grants[0].permissions
      });
    }

    return options;
  });

  /** Named for what it answers, alongside `canSwitchAgency` and `canSwitchBuilding`. */
  readonly canSwitchRole = computed(() => this.options().length > 1);

  readonly active = computed<ActiveContext>(() => {
    const options = this.options();
    // Nothing stored: the most capable role if they hold it, else simply the
    // first. A user always has at least one role, so there is always one active.
    const selected = options.find((option) => option.key === this.selectedKey())
      ?? options.find((option) => option.roleName === RoleConstants.SUPER_ADMIN)
      ?? options[0];

    // A signed-in user with no role at all: nothing to act as, and every gate
    // closed. Rare, but it must not throw on the way to saying so.
    if (!selected) {
      return {
        kind: 'none',
        key: 'none',
        label: 'No role',
        agencyId: null,
        agencyName: null,
        roleName: null,
        buildingId: null,
        buildingName: null,
        permissions: EMPTY_PERMISSIONS
      };
    }

    /*
     * Which agencies this context can act in.
     *
     * An agency role names them itself. A *system* role does not — but a super
     * admin still manages agencies, and AGENCY_ADMIN granted platform-wide
     * lands in `roles[]` with no per-agency grant attached. Falling back to
     * every agency the user reaches keeps the agency tier available there
     * instead of stranding them with a role picker and nothing else.
     */
    const pool = selected.kind === 'agency'
      ? selected.agencies
      : selected.kind === 'role' ? this.session.agencyGrants() : [];

    /*
     * A stored choice wins; otherwise fall to the first agency.
     *
     * With one agency there is nothing to pick. With several, landing on none
     * is worse than landing on a guess: the scoped list endpoints need an
     * agency, so an unscoped page falls back to the platform-wide route and
     * 403s for exactly the roles this tier exists for. The switcher shows which
     * agency is active at all times, and changing it persists (§30.7).
     */
    /*
     * "All agencies" only means something when there is more than one. With a
     * single agency the two are the same set, and leaving `agencyId` null there
     * would unscope every list for no gain.
     */
    const chosen = this.selectedAgencyId();
    const grant = chosen === null && pool.length > 1
      ? null                                      // explicitly across all agencies
      : pool.find((candidate) => candidate.agencyId === chosen) ?? pool[0] ?? null;

    return {
      kind: selected.kind,
      key: selected.key,
      label: selected.label,
      agencyId: grant?.agencyId ?? null,
      agencyName: grant?.agencyName ?? null,
      roleName: selected.roleName,
      buildingId: grant ? this.selectedBuildingId() : null,
      buildingName: grant ? this.selectedBuildingName() : null,
      // A system role keeps its own permissions even while scoped to an
      // agency; only an agency role draws them from the grant.
      permissions: selected.kind === 'agency' ? (grant?.permissions ?? selected.permissions) : selected.permissions
    };
  });

  /** The agencies the active role can be exercised in. */
  readonly agencies = computed<readonly AgencyGrant[]>(() => {
    const active = this.active();
    if (active.kind === 'none') {
      return [];
    }

    const own = this.options().find((option) => option.key === active.key)?.agencies ?? [];
    return own.length > 0 ? own : this.session.agencyGrants();
  });

  /**
   * Whether the agency tier means anything for the active role.
   *
   * `AGENCY_READ` is the discriminator, and it separates the roles cleanly:
   * AGENCY_ADMIN and CARETAKER hold it and work *inside* an agency, so they
   * choose one. GUEST and ECOM_ADMIN never touch agencies. TENANT holds
   * BUILDING_READ but not AGENCY_READ — their building is *where they live*,
   * settled by their tenancy rather than chosen from a menu, so the tier would
   * be asking them to administer something they only occupy.
   *
   * By permission, never by role name (§30.1): the seeder changes, and a new
   * agency-side role should get the tier without anyone editing this.
   */
  readonly showAgencyTier = computed(() =>
    this.agencies().length > 0
    && this.canAny([PermissionConstants.AGENCY_READ, PermissionConstants.AGENCY_READ_ALL]));

  /** Only worth a control when there is more than one agency to choose. */
  readonly canSwitchAgency = computed(() => this.agencies().length > 1);

  /**
   * An agency role with several agencies and none chosen yet. The operator has
   * to pick before agency-scoped screens mean anything.
   */
  readonly needsAgency = computed(() => this.showAgencyTier() && this.active().agencyId === null);

  /** The active role's permissions, and only those. */
  readonly activePermissions = computed<ReadonlySet<string>>(() => this.active().permissions);

  /** True while the active role is SUPER_ADMIN, whose grant list may be empty. */
  readonly isSuperAdmin = computed(() => this.active().roleName === RoleConstants.SUPER_ADMIN);

  /**
   * Does the **active role** hold this permission? This is the question the nav
   * and every `app-permission-gate` ask. It is deliberately narrower than
   * `AuthSessionService.hasPermission`, which answers "anywhere" and belongs to
   * the route guard.
   */
  can(permission: string): boolean {
    return this.isSuperAdmin() || this.activePermissions().has(permission);
  }

  canAny(permissions: readonly string[]): boolean {
    return permissions.length === 0 || permissions.some((permission) => this.can(permission));
  }

  canAll(permissions: readonly string[]): boolean {
    return permissions.every((permission) => this.can(permission));
  }

  /**
   * Moves to a role that holds one of these permissions, so a deep link into a
   * section the current role cannot see switches to the role that can rather
   * than dead-ending on a page with every control hidden. Returns false when no
   * role would help, which is a genuine denial.
   */
  adoptContextGranting(permissions: readonly string[]): boolean {
    if (permissions.length === 0 || this.canAny(permissions)) {
      return true;
    }

    const candidate = this.options().find(
      (option) => option.roleName === RoleConstants.SUPER_ADMIN
        || permissions.some((permission) => option.permissions.has(permission))
    );

    if (!candidate) {
      return false;
    }

    this.selectWorkspace(candidate);
    return true;
  }

  /** The grant backing the active agency, or null outside an agency workspace. */
  readonly activeGrant = computed<AgencyGrant | null>(() => {
    const agencyId = this.active().agencyId;
    return agencyId === null ? null : this.session.authorities().byAgency.get(agencyId) ?? null;
  });

  readonly agencyId = computed(() => this.active().agencyId);
  readonly buildingId = computed(() => this.active().buildingId);
  /**
   * Working inside an agency — true for an agency role, and for a system role
   * that has scoped itself to one, since both address `{agencyId}` endpoints.
   */
  readonly isAgencyWorkspace = computed(() => this.active().agencyId !== null || this.active().kind === 'agency');
  readonly hasBuilding = computed(() => this.active().buildingId !== null);

  /**
   * Buildings this user may switch to inside the active agency. An AGENCY_WIDE
   * assignment reaches every building; a BUILDING_LEVEL one only the buildings
   * it names, so the picker must not offer more than the grant covers.
   */
  readonly restrictedToBuildingIds = computed<ReadonlySet<number> | null>(() => {
    const grant = this.activeGrant();
    if (!grant || grant.agencyWide) {
      return null;
    }

    return grant.buildingIds;
  });

  constructor() {
    // Restore on sign-in, clear on sign-out, and drop a stored context that no
    // longer resolves — an agency the user was removed from, or one deleted.
    effect(() => {
      const userId = this.session.currentUserId();
      if (userId === null) {
        this.selectedKey.set(null);
        this.selectedBuildingId.set(null);
        this.selectedBuildingName.set(null);
        return;
      }

      const stored = this.read(userId);
      const options = this.options();
      if (!stored || !options.some((option) => option.key === stored.key)) {
        return;
      }

      this.selectedKey.set(stored.key);
      this.selectedAgencyId.set(stored.agencyId);
      this.selectedBuildingId.set(stored.buildingId);
    });
  }

  selectWorkspace(option: ContextOption): void {
    if (!this.options().some((candidate) => candidate.key === option.key)) {
      return;
    }

    this.selectedKey.set(option.key);
    // An agency belongs to one role and a building to one agency, so changing
    // the role invalidates both tiers below it.
    this.selectedAgencyId.set(null);
    this.selectedBuildingId.set(null);
    this.selectedBuildingName.set(null);
    this.persist();
  }

  selectAgency(agencyId: number): void {
    if (!this.agencies().some((grant) => grant.agencyId === agencyId)) {
      return;
    }

    this.selectedAgencyId.set(agencyId);
    // Buildings belong to one agency.
    this.selectedBuildingId.set(null);
    this.selectedBuildingName.set(null);
    this.persist();
  }

  selectBuilding(buildingId: number, buildingName?: string | null): void {
    if (!this.isAgencyWorkspace()) {
      return;
    }

    const allowed = this.restrictedToBuildingIds();
    if (allowed && !allowed.has(buildingId)) {
      return;
    }

    this.selectedBuildingId.set(buildingId);
    this.selectedBuildingName.set(buildingName ?? null);
    this.persist();
  }

  /**
   * Widens to every agency the operator administers.
   *
   * Some work is not about one agency — a broadcast to all tenants, a figure
   * across the portfolio. Screens that need a single agency prompt for one
   * (`context-guard`'s 'pick-agency'); screens that do not use
   * `scopedAgencyIds()` and act on each.
   */
  clearAgency(): void {
    this.selectedAgencyId.set(null);
    this.selectedBuildingId.set(null);
    this.selectedBuildingName.set(null);
    this.persist();
  }

  /** True while working across every administered agency rather than one. */
  readonly allAgencies = computed(() => this.selectedAgencyId() === null && this.agencies().length > 1);

  /**
   * The agencies an action should apply to: the selected one, or every agency
   * the operator holds a grant in. A cross-cutting action iterates these, so it
   * only ever reaches agencies the backend will accept it for.
   */
  readonly scopedAgencyIds = computed<readonly number[]>(() => {
    const agencyId = this.active().agencyId;
    return agencyId !== null ? [agencyId] : this.agencies().map((grant) => grant.agencyId);
  });

  clearBuilding(): void {
    this.selectedBuildingId.set(null);
    this.selectedBuildingName.set(null);
    this.persist();
  }

  /**
   * Aligns the active context with a route the operator navigated into, so the
   * switcher reflects where they actually are. Ignored when the agency is not
   * one they administer, which keeps a hand-typed URL from moving their context
   * somewhere they cannot act.
   */
  syncFromRoute(agencyId: number, buildingId?: number | null, buildingName?: string | null): void {
    // Find the agency role that covers this agency. A user may hold different
    // roles in different agencies, so the role tier follows the agency, not the
    // other way round.
    const option = this.options().find(
      (candidate) => candidate.kind === 'agency'
        && candidate.agencies.some((grant) => grant.agencyId === agencyId)
    );

    if (!option) {
      return;
    }

    if (this.selectedKey() !== option.key || this.selectedAgencyId() !== agencyId) {
      this.selectedKey.set(option.key);
      this.selectedAgencyId.set(agencyId);
      this.selectedBuildingId.set(null);
      this.selectedBuildingName.set(null);
    }

    if (buildingId != null) {
      const allowed = this.restrictedToBuildingIds();
      if (!allowed || allowed.has(buildingId)) {
        this.selectedBuildingId.set(buildingId);
        this.selectedBuildingName.set(buildingName ?? null);
      }
    }

    this.persist();
  }

  /** Throws when no agency is selected — use in code paths that require one. */
  requireAgencyId(): number {
    const agencyId = this.active().agencyId;
    if (agencyId === null) {
      throw new Error('No agency selected. Choose an agency workspace first.');
    }

    return agencyId;
  }

  /** Throws unless both an agency and a building are selected. */
  requireBuildingContext(): { agencyId: number; buildingId: number } {
    const context = this.active();
    if (context.agencyId === null || context.buildingId === null) {
      throw new Error('No building selected. Choose a building before this action.');
    }

    return { agencyId: context.agencyId, buildingId: context.buildingId };
  }

  private persist(): void {
    const userId = this.session.currentUserId();
    if (userId === null) {
      return;
    }

    try {
      const payload: PersistedContext = {
        key: this.active().key,
        // `null` here means "all agencies" and must survive a reload; a missing
        // key means never chosen, which defaults to the first.
        agencyId: this.selectedAgencyId() === null ? null : this.active().agencyId,
        buildingId: this.selectedBuildingId()
      };
      localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(payload));
    } catch {
      // A restricted browsing context just means the choice lasts this session.
    }
  }

  private read(userId: number): PersistedContext | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      if (!raw) {
        return null;
      }

      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      const candidate = parsed as PersistedContext;
      return typeof candidate.key === 'string'
        ? {
          key: candidate.key,
          // `in`, not `??`: an explicit null means "all agencies" and must not
          // be read back as "never chosen", which defaults to the first.
          agencyId: 'agencyId' in candidate ? candidate.agencyId : undefined,
          buildingId: candidate.buildingId ?? null
        }
        : null;
    } catch {
      return null;
    }
  }
}
