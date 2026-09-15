/**
 * The renter profile: what a person states about themselves as a tenant,
 * written once and reused with every landlord they ever deal with.
 *
 * The official name and ID number live here rather than on the account, and
 * that separation is the point. An account carries a display name people are
 * free to set to an alias or a short form; a tenancy ends in a lease and
 * possibly in court, so it runs on what the person deliberately stated is
 * legally theirs. Nothing here reaches an agency without an approved grant
 * carrying the PROFILE scope.
 */

export type TenancyProfileStatus = 'DRAFT' | 'COMPLETE';

export type EmploymentStatus =
  | 'EMPLOYED' | 'SELF_EMPLOYED' | 'STUDENT' | 'RETIRED' | 'UNEMPLOYED' | 'OTHER';

/** Everything the owner may set. A whole-object replace: omitting a field clears it. */
export interface RenterProfileUpsertRequest {
  officialFirstName?: string | null;
  officialMiddleName?: string | null;
  officialLastName?: string | null;
  nationalIdNumber?: string | null;
  officialPhoneNumber?: string | null;
  officialEmail?: string | null;

  employmentStatus?: EmploymentStatus | null;
  employerName?: string | null;
  jobTitle?: string | null;
  employedSince?: string | null;
  monthlyIncome?: number | null;

  previousLandlordName?: string | null;
  previousLandlordPhone?: string | null;
  previousAddress?: string | null;
  previousTenancyStart?: string | null;
  previousTenancyEnd?: string | null;
  reasonForLeaving?: string | null;

  occupantCount?: number | null;
  hasPets?: boolean | null;
  petDetails?: string | null;
  smoker?: boolean | null;

  preferredMoveInDate?: string | null;
  maxMonthlyBudget?: number | null;
  aboutMe?: string | null;

  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;

  referenceName?: string | null;
  referencePhone?: string | null;
  referenceRelationship?: string | null;

  /** COMPLETE is refused unless the legal name and ID number are filled in. */
  status?: TenancyProfileStatus | null;
}

/** What the owner sees of their own. */
export interface RenterProfileDetail extends RenterProfileUpsertRequest {
  userId?: number | null;
  userUid?: string | null;
  /**
   * Whether the legal name and ID number are present. Surfaced so the form can
   * prompt before the person hits a refusal they did not expect — accepting a
   * tenancy and sharing a profile both require it.
   */
  officialIdentityComplete?: boolean | null;
  completedAt?: string | null;
  documentCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * What an agency sees through an approved PROFILE grant.
 *
 * A separate shape rather than the detail with fields blanked, so a field
 * added later cannot leak by being serialised into a view nobody re-checked.
 */
export interface SharedRenterProfile {
  userUid?: string | null;
  officialFirstName?: string | null;
  officialMiddleName?: string | null;
  officialLastName?: string | null;
  nationalIdNumber?: string | null;
  officialPhoneNumber?: string | null;
  officialEmail?: string | null;
  status?: TenancyProfileStatus | null;

  employmentStatus?: EmploymentStatus | null;
  employerName?: string | null;
  jobTitle?: string | null;
  employedSince?: string | null;
  monthlyIncome?: number | null;

  previousLandlordName?: string | null;
  previousLandlordPhone?: string | null;
  previousAddress?: string | null;
  previousTenancyStart?: string | null;
  previousTenancyEnd?: string | null;
  reasonForLeaving?: string | null;

  occupantCount?: number | null;
  hasPets?: boolean | null;
  petDetails?: string | null;
  smoker?: boolean | null;

  preferredMoveInDate?: string | null;
  maxMonthlyBudget?: number | null;
  aboutMe?: string | null;

  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;

  referenceName?: string | null;
  referencePhone?: string | null;
  referenceRelationship?: string | null;

  updatedAt?: string | null;
}
