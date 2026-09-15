import { UserAccessProfile, UserAgencyRole } from '../models/auth.models';

/**
 * Authorisation is decided by **permission**, matching the backend's
 * `@PreAuthorize("hasAuthority('PERM')")`. Roles are never the check — they are
 * only labels for a bundle of permissions.
 *
 * Two tiers, because `GET /v1/users/profile` returns two lists:
 *
 * - `roles[]`       — system-wide grants. The permission applies everywhere.
 * - `agencyRoles[]` — one entry per agency assignment, each carrying its own
 *                     agency, role and permissions. The same permission name in
 *                     two entries can mean different agencies, so these are kept
 *                     keyed by agency and never flattened together.
 */
export interface AgencyGrant {
  agencyId: number;
  agencyName: string | null;
  roleName: string | null;
  /** AGENCY_WIDE, or limited to `buildingIds`. */
  buildingIds: ReadonlySet<number>;
  agencyWide: boolean;
  permissions: ReadonlySet<string>;
}

/**
 * One system-wide role, kept whole.
 *
 * Global roles are **not** flattened together: an ecommerce admin and a support
 * admin are different jobs, and a user who holds both should work as one at a
 * time. Unioning them produces a workspace that is neither — housing controls
 * appearing for the ecommerce admin, and no way to get rid of them.
 */
export interface GlobalRoleGrant {
  roleName: string;
  permissions: ReadonlySet<string>;
}

export interface EffectiveAuthorities {
  /** One entry per system-wide role, in name order. */
  globalRoles: readonly GlobalRoleGrant[];
  /**
   * Every system-wide permission, unioned.
   *
   * This answers "could this user do it in *some* role" — the right question
   * for a route guard deciding whether a URL is reachable at all, and the wrong
   * one for deciding what to render. Rendering asks the active context.
   */
  global: ReadonlySet<string>;
  /** Per-agency grants, keyed by agency id. One role per agency. */
  byAgency: ReadonlyMap<number, AgencyGrant>;
  /** Role names held anywhere — for display, never for authorisation. */
  roles: ReadonlySet<string>;
}

export const EMPTY_AUTHORITIES: EffectiveAuthorities = {
  globalRoles: [],
  global: new Set<string>(),
  byAgency: new Map<number, AgencyGrant>(),
  roles: new Set<string>()
};

export function resolveAuthorities(profile: UserAccessProfile | null): EffectiveAuthorities {
  const global = new Set<string>();
  const globalRoles = new Map<string, Set<string>>();
  const byAgency = new Map<number, AgencyGrant>();
  const roles = new Set<string>();

  for (const role of profile?.roles ?? []) {
    if (role.enabled === false || !role.name) {
      continue;
    }

    roles.add(role.name);
    const own = globalRoles.get(role.name) ?? new Set<string>();
    for (const permission of role.permissions ?? []) {
      if (permission.enabled !== false && permission.name) {
        own.add(permission.name);
        global.add(permission.name);
      }
    }

    globalRoles.set(role.name, own);
  }

  for (const assignment of profile?.agencyRoles ?? []) {
    const grant = toGrant(assignment);
    if (!grant) {
      continue;
    }

    if (grant.roleName) {
      roles.add(grant.roleName);
    }

    // A user holds one role per agency. Repeat entries for the same agency are
    // building-level slices of that role, so only their reach is merged — never
    // two roles' permissions, which would invent a role the user was not given.
    const existing = byAgency.get(grant.agencyId);
    byAgency.set(grant.agencyId, existing ? mergeReach(existing, grant) : grant);
  }

  return {
    globalRoles: [...globalRoles.entries()]
      .map(([roleName, permissions]) => ({ roleName, permissions }))
      .sort((a, b) => a.roleName.localeCompare(b.roleName)),
    global,
    byAgency,
    roles
  };
}

function toGrant(assignment: UserAgencyRole): AgencyGrant | null {
  const agencyId = assignment.agencyId;
  const role = assignment.role;
  if (typeof agencyId !== 'number' || !role || role.enabled === false) {
    return null;
  }

  const permissions = new Set<string>();
  for (const permission of role.permissions ?? []) {
    if (permission.enabled !== false && permission.name) {
      permissions.add(permission.name);
    }
  }

  return {
    agencyId,
    agencyName: assignment.agencyName ?? null,
    roleName: role.name ?? null,
    buildingIds: new Set(assignment.buildingIds ?? []),
    agencyWide: assignment.scope !== 'BUILDING_LEVEL',
    permissions
  };
}

/**
 * Widens which buildings a grant covers. Permissions are taken from the first
 * assignment only: entries for one agency describe one role, so a second entry
 * adds reach, not authority. If the roles genuinely differ the backend has
 * broken its own invariant, and the safe reading is the narrower one.
 */
function mergeReach(a: AgencyGrant, b: AgencyGrant): AgencyGrant {
  if (a.roleName !== b.roleName) {
    return a;
  }

  return {
    ...a,
    agencyName: a.agencyName ?? b.agencyName,
    buildingIds: new Set([...a.buildingIds, ...b.buildingIds]),
    agencyWide: a.agencyWide || b.agencyWide
  };
}
