import { Permission } from '../../../core/rbac/permission.constants';

export type UserStatus = 'PENDING_CLAIM' | 'ACTIVE' | 'INACTIVE';

export interface RoleResponse {
  id: number;
  name: string;
  description?: string;
  enabled?: boolean;
  roleScope?: 'SYSTEM' | 'AGENCY_MANAGEMENT' | 'AGENCY';
  permissions?: PermissionResponse[];
}

export interface PermissionResponse {
  id?: number;
  name?: string;
  description?: string;
  enabled?: boolean;
}

export interface UserAccountResponse {
  id?: number;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  lastLogin?: string | null;
  isLocked?: boolean;
  lockedUntil?: string | null;
  failedLoginAttempts?: number;
  passwordResetRequired?: boolean;
  passwordChangedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfileResponse {
  id?: number;
  profileImageUrl?: string | null;
  idPicFront?: string | null;
  idPicBack?: string | null;
  phoneNumberSecondary?: string | null;
  dateOfBirth?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserPreview {
  id: number;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  userUid?: string | null;
  phoneNumber: string;
  nationalIdNumber: string;
  isActive?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
  lastLogin?: string | null;
  profileImageUrl?: string | null;
}

export interface UserDetail extends UserPreview {
  status?: UserStatus;
  updatedAt?: string;
  userProfile?: UserProfileResponse | null;
  userAccount?: UserAccountResponse | null;
  roles?: RoleResponse[];
}

export interface RegisterUserRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
  nationalIdNumber: string;
}

export interface CreateUserRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  password?: string | null;
  phoneNumber: string;
  nationalIdNumber: string;
  roleIds?: number[];
}

export interface UpdateUserRequest {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  nationalIdNumber?: string;
  phoneNumberSecondary?: string;
  profileImageUrl?: string;
  idPicFront?: string;
  idPicBack?: string;
  dateOfBirth?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
}

export interface AdminUpdateUserRequest extends UpdateUserRequest {
  status?: UserStatus;
  isLocked?: boolean;
  lockedUntil?: string | null;
  passwordResetRequired?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  resetFailedLoginAttempts?: boolean;
}

export interface UserSearchParams {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  nationalId?: string;
  userUid?: string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}
