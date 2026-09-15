import { SharedRenterProfile } from '../../users/models/renter-profile.models';

/**
 * Consent for an agency to read someone's identity documents.
 *
 * The asymmetry in these types is the security model, not an accident of
 * naming: an agency can only ever *ask* or *redeem*, and only the owner can
 * approve, decline or revoke. There is no shape here by which an agency grants
 * itself access, because the backend has no such operation.
 */

/**
 * What a consent covers.
 *
 * PROFILE is what the person *states* — their legal name, ID number, employer,
 * who they rented from last. DOCUMENTS is the *evidence* behind it: images of
 * the ID card, payslips, bank statements. Handing over a stated ID number so a
 * landlord can start a tenancy is a different act from handing over photographs
 * of the card, so the two are answered separately.
 */
export type GrantScope = 'PROFILE' | 'DOCUMENTS';

/** PULL_REQUEST: the agency asked. PUSH_CODE: the tenant handed over a code. */
export type ProfileGrantType = 'PULL_REQUEST' | 'PUSH_CODE';

export type ProfileGrantStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'DECLINED';

/** A document inside a grant. Metadata only — a URL is a separate authorised read. */
export interface SharedDocument {
  id: number;
  documentType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  versionNumber?: number | null;
}

export interface ProfileGrant {
  id: number;
  grantType?: ProfileGrantType | null;
  status?: ProfileGrantStatus | null;
  scopes?: GrantScope[] | null;
  /** Present only on a live grant carrying PROFILE. */
  tenancyProfile?: SharedRenterProfile | null;
  /** Whether it authorises access right now, expiry included — trust this over `status`. */
  currentlyValid?: boolean | null;
  userId?: number | null;
  userName?: string | null;
  tenantId?: number | null;
  agencyId?: number | null;
  agencyName?: string | null;
  purpose?: string | null;
  documents?: SharedDocument[] | null;
  /**
   * Returned exactly once, at creation. Only the hash is stored, so this is
   * the sole moment it can be shown; every later read has it null.
   */
  shareCode?: string | null;
  shareCodeExpiresAt?: string | null;
  requestedAt?: string | null;
  grantedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
}

/** An agency asking. Carries no document ids: it has no business enumerating what someone holds. */
export interface RequestDocumentAccess {
  tenantId: number;
  purpose?: string | null;
  /** Defaults server-side to both. */
  scopes?: GrantScope[];
}

/**
 * An approval may narrow what was asked for, but never widen it.
 *
 * No document ids: access is resolved through the owner, so a grant covers
 * their library as it stands — including whatever they add afterwards. That
 * is the whole point of granting the profile rather than a list of files.
 */
export interface ApproveGrantRequest {
  scopes?: GrantScope[];
  /** Defaults to 90 days server-side. Never unbounded. */
  expiresAt?: string | null;
}

export interface CreateShareCodeRequest {
  agencyId: number;
  /** Defaults server-side to DOCUMENTS. */
  scopes?: GrantScope[];
  purpose?: string | null;
  /** How long the code stays redeemable; defaults to 72. */
  validForHours?: number | null;
  expiresAt?: string | null;
}

export interface RedeemShareCodeRequest {
  shareCode: string;
  /** Required when the code named no tenancy. */
  tenantId?: number | null;
}

export interface RevokeGrantRequest {
  reason?: string | null;
}

/** A sealed snapshot keeps its date and verifier readable; only the files close. */
export type SnapshotAccessState = 'OPEN' | 'SEALED';

export type SnapshotGrantStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface SnapshotAccessGrant {
  id: number;
  snapshotId?: number | null;
  tenantId?: number | null;
  grantedToUserId?: number | null;
  grantedToName?: string | null;
  grantedByUserId?: number | null;
  grantedByName?: string | null;
  reason?: string | null;
  grantedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  status?: SnapshotGrantStatus | null;
  currentlyValid?: boolean | null;
}

/** Both fields are mandatory: an unexplained or unbounded unseal is not an unseal. */
export interface GrantSnapshotAccessRequest {
  grantedToUserId: number;
  reason: string;
  expiresAt: string;
}
