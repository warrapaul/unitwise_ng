/**
 * This backend's JWT carries only `sub` (the user id) and the standard time
 * claims — no roles, no permissions. Authorities are resolved server-side per
 * request from the union of the user's roles, so the client reads them from
 * `GET /v1/users/profile` instead of decoding them out of the token.
 */
export interface TokenPayload {
  /** The user **id**, not the email — see `AuthSessionService.currentUserId`. */
  sub?: string;
  exp?: number;
  iat?: number;
}

export interface JwtResponseDto {
  accessToken: string;
  refreshToken?: string | null;
  passwordResetRequired: boolean;
}

export interface UserAccessPermission {
  name?: string;
  enabled?: boolean;
}

export type RoleScope = 'SYSTEM' | 'AGENCY_MANAGEMENT' | 'AGENCY';
export type AgencyAdminScope = 'BUILDING_LEVEL' | 'AGENCY_WIDE';

export interface UserAccessRole {
  id?: number;
  name?: string;
  enabled?: boolean;
  roleScope?: RoleScope;
  permissions?: UserAccessPermission[] | null;
}

/**
 * One agency-admin assignment. The backend keeps these per agency rather than
 * folding them into `roles`, because the same person can administer several
 * agencies with a different role in each — CARETAKER in one, AGENCY_ADMIN in
 * another — and a flattened list loses which permissions apply where.
 */
export interface UserAgencyRole {
  agencyId?: number | null;
  agencyName?: string | null;
  /** AGENCY_WIDE, or BUILDING_LEVEL limited to `buildingIds`. */
  scope?: AgencyAdminScope | null;
  buildingIds?: number[] | null;
  role?: UserAccessRole | null;
}

export interface UserAccessProfile {
  id?: number;
  /*
   * Identity, for the shell to name who is signed in.
   *
   * `/v1/users/profile` has always returned these — the session simply
   * did not declare them, so the sidebar fell back to the JWT `sub`,
   * which is the user *id*, and rendered a bare number where a name
   * belonged. Declared here rather than fetched again: the call already
   * happens once at login.
   */
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  /** The code a tenant hands to a landlord. Already on the same response. */
  userUid?: string | null;
  /** System-wide grants only. */
  roles?: UserAccessRole[] | null;
  /** One entry per agency assignment. */
  agencyRoles?: UserAgencyRole[] | null;
}
