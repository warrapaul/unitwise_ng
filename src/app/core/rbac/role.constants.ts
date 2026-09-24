/** Mirrors the roles `RolesAndPermissionsInitializer` bootstraps. */
export const RoleConstants = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  CARETAKER: 'CARETAKER',
  ECOM_ADMIN: 'ECOM_ADMIN',
  TENANT: 'TENANT',
  GUEST: 'GUEST'
} as const;

export type UserRole = typeof RoleConstants[keyof typeof RoleConstants];

/**
 * Which roles a caller may hand to someone else, by the roles the caller holds.
 *
 * The server enforces this — the UI only stops offering what would be refused.
 * Platform roles (SUPER_ADMIN, GUEST, ECOM_ADMIN) are a super admin's to give;
 * an agency admin staffs their agency (AGENCY_ADMIN, CARETAKER); nobody else
 * assigns anything. TENANT is never picked by hand: a tenancy grants it.
 *
 * Mirrors the backend's `RoleAssignmentPolicy`, which enforces it on the global
 * user-roles endpoint and on the agency's /admins add and update. Change the
 * two together; this copy only decides what the UI offers.
 */
export function assignableRoleNames(callerRoles: Iterable<string | null | undefined>): ReadonlySet<string> | 'ALL' {
  const held = new Set([...callerRoles].filter((role): role is string => !!role));

  if (held.has(RoleConstants.SUPER_ADMIN)) {
    return 'ALL';
  }

  if (held.has(RoleConstants.AGENCY_ADMIN)) {
    return new Set([RoleConstants.AGENCY_ADMIN, RoleConstants.CARETAKER]);
  }

  return new Set();
}
