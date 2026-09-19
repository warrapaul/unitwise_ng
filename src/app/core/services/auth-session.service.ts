import { Injectable, computed, signal } from '@angular/core';
import { JwtResponseDto, TokenPayload, UserAccessProfile } from '../models/auth.models';
import { RoleConstants, UserRole } from '../rbac/role.constants';
import { AgencyGrant, EMPTY_AUTHORITIES, EffectiveAuthorities, resolveAuthorities } from '../rbac/authority.util';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly refreshTokenKey = 'unitwise_refresh_token';
  private readonly accessTokenKey = 'unitwise_access_token';
  private readonly passwordResetKey = 'unitwise_password_reset_required';

  /*
   * Held in storage as well as in memory, because one session legitimately has
   * no refresh token to rebuild itself from: a login that answers
   * `passwordResetRequired` returns a short-lived access token alone, and that
   * token is the only thing authorising `POST /v1/auth/password-change`. Kept in
   * memory only, a reload on the change-password screen dropped it and the one
   * request the token exists for went out bare and came back 401.
   *
   * `sessionStorage`, not `localStorage`: tab-scoped and gone when the tab
   * closes, and it already holds the refresh token, so this widens nothing.
   */
  private readonly accessTokenState = signal<string | null>(sessionStorage.getItem('unitwise_access_token'));
  private readonly userProfileState = signal<UserAccessProfile | null>(null);

  /*
   * Stored, not just held: the change-password screen decides whether to offer
   * a way out of it, and a reload must not turn a forced change into an
   * optional one.
   */
  private readonly passwordResetRequiredState = signal<boolean>(
    sessionStorage.getItem('unitwise_password_reset_required') === 'true'
  );

  readonly accessToken = this.accessTokenState.asReadonly();
  readonly payload = computed<TokenPayload | null>(() => this.decodeToken(this.accessTokenState()));
  readonly isAuthenticated = computed(() => !!this.accessTokenState());
  readonly userProfile = this.userProfileState.asReadonly();

  /** The session may do nothing but change the password until this clears. */
  readonly passwordResetRequired = this.passwordResetRequiredState.asReadonly();

  /**
   * The user's effective permissions, split into system-wide grants and
   * per-agency grants. The JWT carries no permission claims, so this comes
   * entirely from `GET /v1/users/profile`.
   */
  readonly authorities = computed<EffectiveAuthorities>(() => {
    const profile = this.userProfileState();
    return profile ? resolveAuthorities(profile) : EMPTY_AUTHORITIES;
  });

  /** Every agency the user administers, for the workspace switcher. */
  readonly agencyGrants = computed<AgencyGrant[]>(() =>
    [...this.authorities().byAgency.values()].sort((a, b) =>
      (a.agencyName ?? '').localeCompare(b.agencyName ?? '')
    )
  );

  /** Role names held anywhere. Display only — authorisation never reads this. */
  readonly userRoles = computed(() => [...this.authorities().roles]);

  /** Every permission held at any tier, for nav visibility. */
  readonly userPermissions = computed(() => {
    const authorities = this.authorities();
    const all = new Set(authorities.global);
    for (const grant of authorities.byAgency.values()) {
      for (const permission of grant.permissions) {
        all.add(permission);
      }
    }

    return [...all];
  });

  readonly currentUserId = computed(() => {
    const fromProfile = this.userProfileState()?.id;
    if (typeof fromProfile === 'number') {
      return fromProfile;
    }

    const sub = Number(this.payload()?.sub);
    return Number.isFinite(sub) ? sub : null;
  });

  /**
   * Replaces whatever was stored. The password-change response carries a full
   * pair, so completing that flow overwrites the temporary access-token-only
   * session with a normal one and every later request uses it.
   */
  setSession(auth: JwtResponseDto): void {
    this.setAccessToken(auth.accessToken);

    if (auth.refreshToken) {
      sessionStorage.setItem(this.refreshTokenKey, auth.refreshToken);
    } else {
      sessionStorage.removeItem(this.refreshTokenKey);
    }

    this.setPasswordResetRequired(auth.passwordResetRequired === true);
  }

  setUserProfile(profile: UserAccessProfile | null): void {
    this.userProfileState.set(profile);
  }

  clear(): void {
    this.accessTokenState.set(null);
    this.userProfileState.set(null);
    sessionStorage.removeItem(this.refreshTokenKey);
    sessionStorage.removeItem(this.accessTokenKey);
    this.setPasswordResetRequired(false);
  }

  /** The single writer for the access token, in memory and in storage. */
  setAccessToken(accessToken: string | null): void {
    this.accessTokenState.set(accessToken);

    if (accessToken) {
      sessionStorage.setItem(this.accessTokenKey, accessToken);
    } else {
      sessionStorage.removeItem(this.accessTokenKey);
    }
  }

  private setPasswordResetRequired(required: boolean): void {
    this.passwordResetRequiredState.set(required);

    if (required) {
      sessionStorage.setItem(this.passwordResetKey, 'true');
    } else {
      sessionStorage.removeItem(this.passwordResetKey);
    }
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem(this.refreshTokenKey);
  }

  /**
   * Do I hold this permission anywhere — system-wide or in any agency? Use this
   * for nav and menu visibility. For an action against a specific agency's data,
   * use `hasPermissionInAgency` so the check matches the backend's own scoping.
   */
  hasPermission(permission: string): boolean {
    const authorities = this.authorities();
    if (authorities.global.has(permission)) {
      return true;
    }

    for (const grant of authorities.byAgency.values()) {
      if (grant.permissions.has(permission)) {
        return true;
      }
    }

    return false;
  }

  /** Do I hold this permission in this specific agency? */
  hasPermissionInAgency(permission: string, agencyId: number): boolean {
    const authorities = this.authorities();
    return authorities.global.has(permission)
      || !!authorities.byAgency.get(agencyId)?.permissions.has(permission);
  }

  /**
   * Do I hold this permission over this building? A BUILDING_LEVEL assignment
   * only covers the buildings it names; an AGENCY_WIDE one covers all of them.
   */
  hasPermissionInBuilding(permission: string, agencyId: number, buildingId: number): boolean {
    const authorities = this.authorities();
    if (authorities.global.has(permission)) {
      return true;
    }

    const grant = authorities.byAgency.get(agencyId);
    if (!grant?.permissions.has(permission)) {
      return false;
    }

    return grant.agencyWide || grant.buildingIds.has(buildingId);
  }

  /**
   * Mirrors the backend's "permission OR resource ownership" expressions
   * (skills §8): hold the permission, or own the record.
   */
  canActOnOwn(permission: string, ownerId?: number | null): boolean {
    if (this.hasPermission(permission)) {
      return true;
    }

    const userId = this.currentUserId();
    return !!userId && ownerId === userId;
  }

  /** Display only. Authorisation is by permission, never by role. */
  hasRole(role: UserRole): boolean {
    const roles = this.authorities().roles;
    return roles.has(role) || roles.has(RoleConstants.SUPER_ADMIN);
  }

  private decodeToken(token: string | null): TokenPayload | null {
    if (!token) {
      return null;
    }

    try {
      const [, payload] = token.split('.');
      if (!payload) {
        return null;
      }

      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(atob(padded)) as TokenPayload;
    } catch {
      return null;
    }
  }
}
