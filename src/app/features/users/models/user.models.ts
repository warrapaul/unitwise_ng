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
  /** Optional for a user account; a tenant's ID lives on their renter profile. */
  nationalIdNumber?: string | null;
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
  /** Optional for a user account; a tenant's ID lives on their renter profile. */
  nationalIdNumber?: string | null;
}

/**
 * Admin-created users get no password from us. `createUser` on the backend calls
 * `createUserWithTemporaryPassword`, so anything sent here would be discarded —
 * and an admin who typed a password would believe they had set one.
 *
 * Self-signup is the other path and does carry a password: see
 * `RegisterUserRequest`.
 */
export interface CreateUserRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  phoneNumber: string;
  /** Optional for a user account; a tenant's ID lives on their renter profile. */
  nationalIdNumber?: string | null;
  roleIds?: number[];
}

export interface UpdateUserRequest {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  nationalIdNumber?: string | null;
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
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

/**
 * All a userUid lookup returns.
 *
 * Deliberately smaller than a user preview, which carries phone number and
 * national ID. A uid is an identifier, not an authenticator: nine characters,
 * designed to be handed to a prospective landlord, and shown in the holder's
 * own UI — so anything reachable with it alone is reachable by anyone who ever
 * saw it once. It answers one question: is this the person I think it is?
 */
export interface UserIdentity {
  userUid?: string | null;
  /**
   * From their renter profile, not their account.
   *
   * The account name is a display name people set to aliases; what a landlord
   * needs to confirm is the name the person stated as legally theirs. There is
   * no account id here either — a uid is the only handle an agency gets.
   */
  officialFirstName?: string | null;
  officialLastName?: string | null;
  /** An unclaimed account cannot accept an invitation or grant profile access. */
  accountActive?: boolean | null;
  /** Whether they have a renter profile worth asking for. */
  hasTenancyProfile?: boolean | null;
  /** Whether that profile can actually name them on a tenancy yet. */
  officialIdentityComplete?: boolean | null;
}
