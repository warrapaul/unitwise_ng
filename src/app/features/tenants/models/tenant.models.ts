export type TenantStatus =
  // AWAITING_TENANT_ACCEPTANCE and PENDING are two different people's queues:
  // this one waits on the tenant, PENDING waits on the landlord. Never show
  // them in the same list as if they were one backlog.
  | 'AWAITING_TENANT_ACCEPTANCE'
  | 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  | 'EVICTED' | 'NOTICE_GIVEN' | 'REJECTED' | 'VERIFIED';
export type TenantType = 'INDIVIDUAL' | 'CORPORATE' | 'FAMILY' | 'STUDENT';
export type TenantCreationMode = 'SELF_SERVICE' | 'LANDLORD_ASSISTED' | 'FULLY_MANAGED';
export type TenantClaimStatus =
  | 'NOT_APPLICABLE' | 'PENDING_CLAIM' | 'CLAIMED_UNVERIFIED' | 'CLAIMED_VERIFIED' | 'EXPIRED';

export type LeaseStatus = 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'RENEWED';
export type LeaseType = 'FIXED_TERM' | 'MONTH_TO_MONTH' | 'COMMERCIAL';

export type AmendmentType = 'RENT_ADJUSTMENT' | 'LEASE_EXTENSION' | 'TERMS_UPDATE' | 'OCCUPANTS_CHANGE' | 'OTHER';
/**
 * Where a proposed change has got to.
 *
 * It moves by both parties' hands: the landlord drafts and submits, the tenant
 * accepts or refuses, and only an accepted amendment can be applied. There is
 * deliberately no path from DRAFT straight to ACTIVE — that was a landlord
 * changing agreed terms, including rent, on their own say-so.
 */
export type AmendmentStatus =
  | 'DRAFT'             // being written; landlord only, still editable
  | 'PENDING_APPROVAL'  // sent to the tenant, awaiting their decision
  | 'APPROVED'          // the tenant accepted; ready to apply on its effective date
  | 'REJECTED'          // the tenant refused, with a reason. Terminal.
  | 'WITHDRAWN'         // pulled back by the landlord before an answer. Terminal.
  | 'ACTIVE';           // applied; the contract has been reissued and awaits signature

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED';

export type DocumentType =
  /**
   * Filed by the platform, never uploaded: the rendered agreement is archived
   * against the lease when it is issued, hashed and version-numbered. It is
   * not offered as an upload type anywhere for that reason.
   */
  | 'LEASE_AGREEMENT'
  | 'NATIONAL_ID_FRONT' | 'NATIONAL_ID_BACK' | 'PASSPORT' | 'PROOF_OF_EMPLOYMENT'
  | 'UTILITY_BILL' | 'BANK_STATEMENT' | 'REFERENCE_LETTER' | 'OTHER';
export type DocumentStatus = 'DRAFT' | 'SUBMITTED' | 'ARCHIVED' | 'REJECTED';

export type MessageType = 'CONTACT' | 'COMPLAINT' | 'SUGGESTION' | 'OTHER';
export type MessageStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type SnapshotType =
  | 'INITIAL_VERIFICATION' | 'LEASE_RENEWAL' | 'LEASE_AMENDMENT' | 'RE_VERIFICATION';

/** OPEN: the verifying agency can read the documents. SEALED: it cannot. */
export type SnapshotAccessState = 'OPEN' | 'SEALED';

export interface TenantPreview {
  id: number;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  contactPerson?: string | null;
  tenantType?: TenantType | null;
  status?: TenantStatus | null;
  creationMode?: TenantCreationMode | null;
  claimStatus?: TenantClaimStatus | null;
  userId?: number | null;
  userUid?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  intendedRoomId?: number | null;
  intendedRoomNumber?: number | null;
  intendedRoomName?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  agencyId?: number | null;
  agencyName?: string | null;
  moveInDate?: string | null;
  moveOutDate?: string | null;
  createdAt?: string | null;
  verified?: boolean | null;
  verifiedByLandlordAt?: string | null;
}

export interface TenantDetail extends TenantPreview {
  nationalIdNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
  noticeGivenDate?: string | null;
  createdByLandlordId?: number | null;
  createdByLandlordName?: string | null;
  verifiedByLandlordId?: number | null;
  verifiedByLandlordName?: string | null;
  buildingAddress?: string | null;
  updatedAt?: string | null;
}

/** The `/full` variant bundles the tenant's related records in one payload. */
export interface TenantFullDetail extends TenantDetail {
  intendedRoomMonthlyRent?: number | string | null;
  intendedRoomSecurityDeposit?: number | string | null;
  rentPayments?: unknown[] | null;
  leaseAgreements?: LeasePreview[] | null;
  activeLeaseAgreement?: LeaseDetail | null;
  documents?: TenantDocumentPreview[] | null;
  verificationSnapshots?: VerificationSnapshotDetail[] | null;
  currentVerificationSnapshot?: VerificationSnapshotDetail | null;
  maintenanceRequests?: unknown[] | null;
  roomHistory?: TenantRoomHistoryPreview[] | null;
}

export interface CreateTenantRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phoneNumber: string;
  nationalIdNumber?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  tenantType?: TenantType | null;
  creationMode?: TenantCreationMode | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
  intendedRoomId?: number | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
}

/**
 * The identity and contact fields on a tenancy.
 *
 * Was the tenant's own self-update shape until that endpoint was removed —
 * a tenancy belongs to the landlord who maintains it, and the removed route
 * let a tenant rewrite their name and national ID on a verified tenancy
 * after a lease had been signed against a snapshot of it. Only the landlord
 * request extends this now.
 */
export interface TenancyIdentityFields {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  nationalIdNumber?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  tenantType?: TenantType | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
}

export interface LandlordUpdateTenantRequest extends TenancyIdentityFields {
  status?: TenantStatus | null;
  claimStatus?: TenantClaimStatus | null;
  verified?: boolean | null;
  roomId?: number | null;
  intendedRoomId?: number | null;
  moveInDate?: string | null;
  moveOutDate?: string | null;
  noticeGivenDate?: string | null;
}

export interface TenantSearchParams {
  id?: number;
  userId?: number;
  userUid?: string;
  buildingId?: number;
  roomId?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  nationalId?: string;
  tenantType?: string;
  status?: string;
  creationMode?: string;
  claimStatus?: string;
  roomNumber?: number;
  roomName?: string;
  moveInDateFrom?: string;
  moveInDateTo?: string;
  moveOutDateFrom?: string;
  moveOutDateTo?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface TenantRoomHistoryPreview {
  id: number;
  tenantId?: number | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  buildingName?: string | null;
  moveInDate?: string | null;
  moveOutDate?: string | null;
  rentAmount?: number | string | null;
  isCurrentOccupancy?: boolean | null;
  moveOutReason?: string | null;
  wasEvicted?: boolean | null;
}

export interface LeasePreview {
  id: number;
  leaseNumber?: string | null;
  tenantId?: number | null;
  tenantName?: string | null;
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  monthlyRent?: number | string | null;
  status?: LeaseStatus | null;
  leaseType?: LeaseType | null;
  createdAt?: string | null;
}

export interface LeaseDetail extends LeasePreview {
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  buildingName?: string | null;
  /** Scope of the lease itself, so a scoped action does not depend on the shell. */
  buildingId?: number | null;
  agencyId?: number | null;
  securityDeposit?: number | string | null;
  paymentDueDay?: number | null;
  lateFeeAmount?: number | string | null;
  gracePeriodDays?: number | null;
  /** The rendered agreement, frozen onto the lease when it was issued. */
  contractDocument?: string | null;
  notes?: string | null;
  verificationSnapshotId?: number | null;
  previousLeaseId?: number | null;
  previousLeaseNumber?: string | null;
  createdByUserId?: number | null;
  /**
   * The contract version the signatures below refer to. A reissue starts a
   * new version, which begins unsigned — agreement given to the previous one
   * stays attached to that one.
   */
  contractVersion?: number | null;
  landlordSignature?: LeaseSignature | null;
  tenantSignature?: LeaseSignature | null;
  updatedAt?: string | null;
  amendments?: LeaseAmendmentPreview[] | null;
}

/**
 * One party's decision on one version of the contract.
 *
 * Not a flag saying somebody signed. A signature is only meaningful against a
 * particular document, so it names the version and the hash of the bytes that
 * party was shown — which is what lets a landlord revise terms without either
 * carrying a signature onto wording nobody saw, or erasing the fact that
 * agreement to the earlier wording was ever given.
 */
export interface LeaseSignature {
  party: 'LANDLORD' | 'TENANT';
  decision: 'SIGNED' | 'DECLINED';
  userId?: number | null;
  at?: string | null;
  documentVersion?: number | null;
  documentHash?: string | null;
  /** Present only on a refusal. */
  declineReason?: string | null;
}

/**
 * Correct a verified tenant's record without re-approving them into a room.
 *
 * It carries no identity fields on purpose: a revision reads the tenancy
 * record, so it cannot assert something the tenancy does not say. Update the
 * tenant through the normal endpoint first, then call this.
 */
export interface ReviseVerificationRequest {
  /** What changed and why. Recorded on the snapshot and the reissued contract. */
  reason: string;
  /** Omit to carry the approved documents forward at the version they were checked on. */
  documentIds?: number[] | null;
  verificationNotes?: string | null;
}

export interface ReviseVerificationResult {
  snapshot?: VerificationSnapshotDetail | null;
  /** Null when the tenant has no live lease. */
  lease?: LeaseDetail | null;
  /** True when a contract was reissued and the tenant must sign again. */
  contractReissued?: boolean | null;
}

/** A tenant's refusal of the version in force. The reason is required. */
export interface DeclineLeaseRequest {
  reason: string;
}

export interface GenerateLeaseRequest {
  verificationSnapshotId?: number | null;
  startDate: string;
  endDate?: string | null;
  specialTerms?: string | null;
  notes?: string | null;
  leaseType?: LeaseType | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  paymentDueDay?: number | null;
  lateFeeAmount?: number | null;
  gracePeriodDays?: number | null;
}

export interface RenewLeaseRequest {
  newStartDate: string;
  newEndDate?: string | null;
  newMonthlyRent?: number | null;
  newSecurityDeposit?: number | null;
  paymentDueDay?: number | null;
  lateFeeAmount?: number | null;
  gracePeriodDays?: number | null;
  /*
   * No document here. A renewal reissues from the template rather than
   * carrying wording forward, so a contract supplied by the client is ignored
   * — the field existed only as a way to smuggle unrendered HTML into a lease.
   */
  specialTerms?: string | null;
  notes?: string | null;
  leaseType?: LeaseType | null;
}

export interface LeaseSearchParams {
  leaseNumber?: string;
  tenantName?: string;
  roomNumber?: number;
  roomName?: string;
  status?: string;
  tenantId?: number;
  roomId?: number;
  buildingId?: number;
  agencyId?: number;
  userId?: number;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface LeaseAmendmentPreview {
  id: number;
  leaseAgreementId?: number | null;
  leaseNumber?: string | null;
  amendmentNumber?: number | null;
  amendmentType?: AmendmentType | null;
  effectiveDate?: string | null;
  status?: AmendmentStatus | null;
  createdAt?: string | null;
}

export interface LeaseAmendmentDetail extends LeaseAmendmentPreview {
  description?: string | null;
  newMonthlyRent?: number | string | null;
  newEndDate?: string | null;
  termsChanges?: string | null;
  updatedAt?: string | null;

  /*
   * Who moved it, and when. A change to somebody's rent should say who
   * proposed it and who agreed to it; status alone recorded that an amendment
   * had been approved and never by whom.
   */
  submittedAt?: string | null;
  submittedByUserId?: number | null;
  /** When the tenant answered. `status` says which way. */
  decidedAt?: string | null;
  decidedByUserId?: number | null;
  rejectionReason?: string | null;
  activatedAt?: string | null;
  activatedByUserId?: number | null;
  withdrawnAt?: string | null;
  withdrawnByUserId?: number | null;
  withdrawalReason?: string | null;
}

/** The tenant refuses a proposed change. The reason is required. */
export interface RejectAmendmentRequest {
  reason: string;
}

/** The landlord pulls a proposal back before the tenant has answered. */
export interface WithdrawAmendmentRequest {
  reason?: string | null;
}

export interface CreateAmendmentRequest {
  leaseAgreementId: number;
  amendmentType: AmendmentType;
  description?: string | null;
  effectiveDate: string;
  newMonthlyRent?: number | null;
  newEndDate?: string | null;
  termsChanges?: string | null;
}

export interface UpdateAmendmentRequest {
  amendmentType?: AmendmentType | null;
  description?: string | null;
  effectiveDate?: string | null;
  newMonthlyRent?: number | null;
  newEndDate?: string | null;
  termsChanges?: string | null;
  status?: AmendmentStatus | null;
}

export interface AmendmentSearchParams {
  leaseNumber?: string;
  tenantName?: string;
  description?: string;
  amendmentType?: string;
  status?: string;
  leaseAgreementId?: number;
  tenantId?: number;
  agencyId?: number;
  buildingId?: number;
  effectiveDateFrom?: string;
  effectiveDateTo?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface RoomApplicationPreview {
  id: number;
  tenantId?: number | null;
  applicantName?: string | null;
  userUid?: string | null;
  roomId?: number | null;
  roomLabel?: string | null;
  buildingName?: string | null;
  status?: ApplicationStatus | null;
  desiredMoveInDate?: string | null;
  createdAt?: string | null;
}

export interface RoomApplicationDetail extends RoomApplicationPreview {
  applicantPhone?: string | null;
  applicantEmail?: string | null;
  buildingId?: number | null;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  applicantMessage?: string | null;
  decisionNotes?: string | null;
  reviewedByLandlordId?: number | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateRoomApplicationRequest {
  tenantId?: number | null;
  roomId: number;
  desiredMoveInDate?: string | null;
  applicantMessage?: string | null;
}

export interface RoomApplicationDecisionRequest {
  approved: boolean;
  decisionNotes?: string | null;
}

export interface RoomApplicationSearchParams {
  tenantId?: number;
  roomId?: number;
  buildingId?: number;
  status?: string;
  applicantName?: string;
  userUid?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

/**
 * Whose document this is.
 *
 * LIBRARY: the person's own, readable by an agency only because they
 * granted access. TENANCY: filed by a landlord against a tenancy — the
 * tenant reads and downloads it but never edits or removes it.
 */
export type DocumentSource = 'LIBRARY' | 'TENANCY';

export interface TenantDocumentPreview {
  id: number;
  tenantId?: number | null;
  tenantName?: string | null;
  source?: DocumentSource | null;
  /** The agency, not the person who pressed upload — staff change, agencies persist. */
  uploadedByAgencyId?: number | null;
  uploadedByAgencyName?: string | null;
  documentType?: DocumentType | null;
  fileName?: string | null;
  fileSize?: number | null;
  status?: DocumentStatus | null;
  versionNumber?: number | null;
  isCurrentVersion?: boolean | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  fileUrl?: string | null;
}

export interface TenantDocumentDetail extends TenantDocumentPreview {
  filePath?: string | null;
  mimeType?: string | null;
  rejectionReason?: string | null;
  hashValue?: string | null;
  ipfsCid?: string | null;
  updatedAt?: string | null;
}

export interface UpdateTenantDocumentRequest {
  status?: DocumentStatus | null;
  documentType?: DocumentType | null;
  rejectionReason?: string | null;
}

export interface TenantDocumentSearchParams {
  tenantName?: string;
  fileName?: string;
  documentType?: string;
  status?: string;
  tenantId?: number;
  userId?: number;
  buildingId?: number;
  isCurrentVersion?: boolean | string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface TenantMessagePreview {
  id: number;
  tenantId?: number | null;
  tenantName?: string | null;
  messagePreview?: string | null;
  type?: MessageType | null;
  status?: MessageStatus | null;
  createdAt?: string | null;
}

export interface TenantMessageDetail extends TenantMessagePreview {
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  message?: string | null;
  updatedAt?: string | null;
}

export interface CreateTenantMessageRequest {
  tenantId?: number | null;
  message: string;
  type: MessageType;
}

export interface UpdateTenantMessageRequest {
  message?: string | null;
  type?: MessageType | null;
  status?: MessageStatus | null;
}

export interface TenantMessageSearchParams {
  tenantName?: string;
  messageContent?: string;
  type?: string;
  status?: string;
  tenantId?: number;
  userId?: number;
  buildingId?: number;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface VerificationSnapshotPreview {
  id: number;
  tenantId?: number | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  nationalIdNumber?: string | null;
  email?: string | null;
  snapshotDate?: string | null;
  verifiedByName?: string | null;
  snapshotType?: SnapshotType | null;
  isCurrent?: boolean | null;
  createdAt?: string | null;
}

export interface VerificationSnapshotDetail extends VerificationSnapshotPreview {
  verifiedById?: number | null;
  /**
   * Whether the documents behind this snapshot are still reachable.
   *
   * Sealing hides the files, never the record: the date, the verifier and the
   * details captured at the time stay readable, or the lease would lose its
   * evidentiary basis. The backend seals a snapshot a month after the tenancy
   * ends — never on a transfer, and never by anyone's hand.
   *
   * Not yet carried by the backend response DTO — the columns exist on the
   * entity but nothing maps them — so this reads undefined today and the UI
   * treats that as "not sealed".
   */
  accessState?: SnapshotAccessState | null;
  sealedAt?: string | null;
  sealedReason?: string | null;
  /** The room this verification reserved. Null on the rejection path. */
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  tenantType?: TenantType | null;
  contactPerson?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  documentReferences?: Array<{ id?: number; documentId?: number; documentType?: string; fileName?: string }> | null;
  verificationNotes?: string | null;
  snapshotHash?: string | null;
  ipfsCid?: string | null;
  updatedAt?: string | null;
}

/**
 * Verification records identity and document evidence only. The money moved to
 * the lease: these fields used to be accepted here and silently dropped, so a
 * rent typed at verification never reached the lease written moments later.
 *
 * `roomId` is optional — omitted, the backend falls back to the room the tenant
 * applied for, and the rejection path needs no room at all.
 */
export interface VerifyAndAssignRequest {
  roomId?: number | null;
  verificationNotes?: string | null;
  approved: boolean;
  rejectionReason?: string | null;
  documentIds?: number[] | null;
}

/** `GenerateLeaseRequest` minus the snapshot id, which the server threads in. */
export interface LeaseTermsRequest {
  startDate: string;
  endDate?: string | null;
  specialTerms?: string | null;
  notes?: string | null;
  leaseType?: LeaseType | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  paymentDueDay?: number | null;
  lateFeeAmount?: number | null;
  gracePeriodDays?: number | null;
}

/**
 * Approve a tenant and issue their lease in one transaction — a lease failure
 * rolls the verification back rather than stranding the tenant as VERIFIED with
 * a reserved room and no lease. Rejections go to `verifyAndAssign`, which the
 * combined endpoint refuses.
 */
/** Mirrors `TenantDtos.CreateFromShareCodeRequest`. */
export interface CreateFromShareCodeRequest {
  shareCode: string;
  intendedRoomId: number;
  /** Rent agreed with this tenant; blank uses room → building → agency. */
  monthlyRent?: number | null;
  notes?: string | null;
}

/**
 * Mirrors `TenantOnboardingDtos.MoveInRequest` — moving a tenant into the room
 * their verification reserved, without a contract. It is what starts billing.
 */
export interface MoveInRequest {
  moveInDate: string;
  /** Rent agreed with this tenant; blank keeps any agreed earlier, else room → building → agency. */
  monthlyRent?: number | null;
  securityDeposit?: number | null;
}

/**
 * One transaction. `lease` is optional: without it the tenant is verified and
 * the room reserved; `moveIn` then moves them in at once. The contract can
 * follow later from the Leases card.
 */
export interface VerifyAndGenerateLeaseRequest {
  verification: VerifyAndAssignRequest;
  lease?: LeaseTermsRequest | null;
  moveIn?: MoveInRequest | null;
}

export interface VerifyAndLeaseResponse {
  snapshot: VerificationSnapshotDetail;
  lease?: LeaseDetail | null;
  moveIn?: unknown | null;
}

export interface VerificationSnapshotSearchParams {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  verifiedByName?: string;
  snapshotType?: string;
  isCurrent?: boolean | string;
  tenantId?: number;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export const TENANT_SORTABLE_FIELDS = ['firstName', 'lastName', 'createdAt', 'moveInDate', 'status'] as const;
export const LEASE_SORTABLE_FIELDS = ['leaseNumber', 'startDate', 'endDate', 'createdAt', 'status'] as const;

/** Mirrors FileUploadContext's tenant-document limits — the backend stays the authority. */
export const TENANT_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
export const TENANT_DOCUMENT_MAX_MB = 10;

/**
 * Adding somebody who already has an account as a tenant of this agency.
 *
 * Carries no identity at all, and that is the change that makes the flow
 * safe: the fields it used to have defaulted to the account's real values, so
 * a uid was enough to copy a stranger's national ID into an agency's records.
 * The tenancy is created nameless and gets its identity only when the person
 * approves a PROFILE grant.
 */
export interface AddExistingUserRequest {
  userUid: string;
  intendedRoomId: number;
  tenantType?: TenantType | null;
  monthlyRent?: number | null;
  contactPerson?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
  /** Ask for their documents in the same call. The point of the flow. */
  requestDocuments?: boolean;
  documentRequestPurpose?: string | null;
}

/**
 * Proceeding with a tenancy the person never answered.
 *
 * Now carries the identity, because that tenancy has none — it was created
 * from a uid alone and nobody has consented to fill it in. This is the one
 * path where a landlord types somebody's details in themselves, and it is
 * recorded as FULLY_MANAGED for exactly that reason.
 */
export interface ProceedWithoutAcceptanceRequest {
  reason: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  nationalIdNumber?: string | null;
}
