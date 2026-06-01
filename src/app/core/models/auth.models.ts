export interface TokenPayload {
  sub?: string;
  userId?: number;
  roles?: string[];
  permissions?: string[];
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

export interface UserAccessRole {
  name?: string;
  enabled?: boolean;
  permissions?: UserAccessPermission[] | null;
}

export interface UserAccessProfile {
  roles?: UserAccessRole[] | null;
}
