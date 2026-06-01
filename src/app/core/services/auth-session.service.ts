import { Injectable, computed, signal } from '@angular/core';
import { JwtResponseDto, TokenPayload, UserAccessProfile } from '../models/auth.models';
import { RoleConstants, UserRole } from '../rbac/role.constants';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly accessTokenState = signal<string | null>(null);
  private readonly userProfileState = signal<UserAccessProfile | null>(null);
  private readonly refreshTokenKey = 'unitwise_refresh_token';

  readonly accessToken = this.accessTokenState.asReadonly();
  readonly payload = computed<TokenPayload | null>(() => this.decodeToken(this.accessTokenState()));
  readonly isAuthenticated = computed(() => !!this.accessTokenState());
  readonly userRoles = computed(() => this.resolveRoles());
  readonly userPermissions = computed(() => this.resolvePermissions());

  setSession(auth: JwtResponseDto): void {
    this.accessTokenState.set(auth.accessToken);
    if (auth.refreshToken) {
      sessionStorage.setItem(this.refreshTokenKey, auth.refreshToken);
    } else {
      sessionStorage.removeItem(this.refreshTokenKey);
    }
  }

  setUserProfile(profile: UserAccessProfile | null): void {
    this.userProfileState.set(profile);
  }

  clear(): void {
    this.accessTokenState.set(null);
    this.userProfileState.set(null);
    sessionStorage.removeItem(this.refreshTokenKey);
  }

  setAccessToken(accessToken: string | null): void {
    this.accessTokenState.set(accessToken);
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem(this.refreshTokenKey);
  }

  hasRole(role: UserRole): boolean {
    const roles = this.userRoles();
    return roles.includes(role) || roles.includes(RoleConstants.SUPER_ADMIN);
  }

  hasPermission(permission: string): boolean {
    return this.userPermissions().includes(permission);
  }

  private resolveRoles(): string[] {
    const profileRoles = this.userProfileState()?.roles?.filter((role) => role.enabled !== false && !!role.name).map((role) => role.name!) ?? [];
    if (profileRoles.length > 0) {
      return [...new Set(profileRoles)];
    }

    return this.payload()?.roles ?? [];
  }

  private resolvePermissions(): string[] {
    const profilePermissions = this.userProfileState()?.roles
      ?.flatMap((role) => {
        if (role.enabled === false || !role.permissions) {
          return [];
        }

        return role.permissions
          .filter((permission) => permission.enabled !== false && !!permission.name)
          .map((permission) => permission.name!);
      }) ?? [];

    if (profilePermissions.length > 0) {
      return [...new Set(profilePermissions)];
    }

    return this.payload()?.permissions ?? [];
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
