import { AddressDetail, AddressPreview, AddressUpsertRequest } from '../../addresses/models/address.models';

export type AgencyStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export type AgencyAdminScope = 'BUILDING_LEVEL' | 'AGENCY_WIDE';
export type BuildingStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'DISABLED' | 'CLOSED';
export type RoomStatus = 'VACANT' | 'OCCUPIED' | 'UNDER_MAINTENANCE';
export type RoomMaintenanceStatus = 'OK' | 'NEEDS_REPAIR' | string;
export type UtilityBillingType = 'FIXED' | 'METERED' | 'PER_UNIT' | 'PERCENTAGE_OF_RENT';
export type UtilityBillingTiming = 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE';

export type FloorNamingPattern =
  | 'FLOOR_NUMBER' | 'FLOOR_WITH_PREFIX' | 'ORDINAL' | 'LETTER' | 'ROMAN_NUMERAL' | 'CUSTOM';
export type RoomNamingPattern =
  | 'LETTER_NUMBER' | 'NUMBER_ONLY' | 'PREFIX_NUMBER' | 'FLOOR_ROOM' | 'LETTER_SEQUENTIAL' | 'CUSTOM';

export interface AgencyProfile {
  logoUrl?: string | null;
  website?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
}

export interface AgencyPreview {
  id: number;
  name: string;
  /** Public, shareable code (8 characters). Tenants quote it to share their profile with this agency. */
  agencyCode?: string | null;
  description?: string | null;
  registrationNumber?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  paymentDueDay?: number | null;
  ownerId?: number | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  adminCount?: number | null;
  buildingCount?: number | null;
  roleCount?: number | null;
}

export interface AgencyDetail extends AgencyPreview {
  lateFeeAmount?: number | string | null;
  gracePeriodDays?: number | null;
  agencyProfile?: AgencyProfile | null;
  agencyAddresses?: AddressDetail[] | null;
}

export interface CreateAgencyRequest {
  name: string;
  description?: string | null;
  registrationNumber?: string | null;
  status?: AgencyStatus | null;
  ownerId: number;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  paymentDueDay?: number | null;
  lateFeeAmount?: number | null;
  gracePeriodDays?: number | null;
  agencyProfile?: AgencyProfile | null;
  agencyAddresses?: AddressUpsertRequest[] | null;
}

export type UpdateAgencyRequest = Partial<Omit<CreateAgencyRequest, 'ownerId'>>;

export interface AgencySearchParams {
  countyId?: number | null;
  cityId?: number | null;
  name?: string;
  registrationNumber?: string;
  ownerFirstName?: string;
  ownerMiddleName?: string;
  ownerLastName?: string;
  ownerEmail?: string;
  ownerPhoneNumber?: string;
  status?: string;
  city?: string;
  county?: string;
  subCounty?: string;
  postalCode?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface AgencyAdminRoleInfo {
  roleId?: number | null;
  roleName?: string | null;
  scope?: string | null;
  permissions?: string[] | null;
}

export interface AgencyAdmin {
  id: number;
  user?: { id?: number; firstName?: string; lastName?: string; email?: string; phoneNumber?: string } | null;
  role?: { id?: number; name?: string } | null;
  agency?: AgencyPreview | null;
  assignedBuildings?: BuildingPreview[] | null;
  scope?: string | null;
  isEnabled?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateAgencyAdminRequest {
  /**
   * The account's numeric id. Reachable only by searching every user, which
   * needs USER_READ_ALL — so in practice only a super admin can supply it.
   */
  userId?: number | null;
  /**
   * How a landlord identifies somebody: the uid that person handed them.
   *
   * Either identifier is accepted and both resolve to the same account;
   * `userId` wins when the request carries both.
   */
  userUid?: string | null;
  roleId: number;
  scope: AgencyAdminScope;
  buildingIds?: number[] | null;
}

/**
 * One of the signed-in user's own agencies, with their role in it. Same shape and
 * same page envelope as `AgencyPreview` — /user-agencies takes the whole agency
 * search request now, so this list filters and sorts exactly like the global one.
 */
export interface AgencyPreviewWithRole extends AgencyPreview {
  adminRole?: AgencyAdminRoleInfo | null;
  assignedBuildingIds?: number[] | null;
  isEnabled?: boolean | null;
}

/** @deprecated The flat shape /user-agencies returned before it was paginated. */
export interface UserAgencyMembership {
  agencyId: number;
  agencyName?: string | null;
  description?: string | null;
  registrationNumber?: string | null;
  agencyStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  ownerId?: number | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  userRole?: string | null;
  userScope?: string | null;
  userRoleId?: number | null;
  isEnabled?: boolean | null;
  assignedBuildingIds?: number[] | null;
}

export interface BuildingNamingConvention {
  floorPattern?: FloorNamingPattern | null;
  floorPrefix?: string | null;
  // floorSuffix?: string | null;
  roomPattern?: RoomNamingPattern | null;
  roomPrefix?: string | null;
  roomSeparator?: string | null;
  customFloorFormat?: string | null;
  customRoomFormat?: string | null;
}

export interface BuildingNamingPreview {
  convention?: BuildingNamingConvention | null;
  floors?: Array<{ floorName: string; rooms: string[] }> | null;
  summary?: string | null;
}

export interface BuildingPreview {
  id: number;
  name: string;
  description?: string | null;
  registrationNumber?: string | null;
  status?: string | null;
  agency?: AgencyPreview | null;
  address?: AddressPreview | null;
  buildingProfile?: { profilePic?: string | null } | null;
  floorCount?: number | null;
  totalRoomCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  paymentDueDay?: number | null;
  rentArrearsGenerateDay?: number | null;
}

export interface BuildingPreviewWithRole extends BuildingPreview {
  adminRole?: AgencyAdminRoleInfo | null;
}

export interface BuildingDetail extends BuildingPreview {
  address?: AddressDetail | null;
  floors?: BuildingFloorDetail[] | null;
  lateFeeAmount?: number | string | null;
  gracePeriodDays?: number | null;
}

export interface CreateBuildingRequest {
  name: string;
  description?: string | null;
  registrationNumber?: string | null;
  agencyId: number;
  numberOfFloors?: number | null;
  roomsPerFloor?: number | null;
  namingConvention?: BuildingNamingConvention | null;
  amenities?: string[] | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  paymentDueDay?: number | null;
  rentArrearsGenerateDay?: number | null;
  lateFeeAmount?: number | null;
  gracePeriodDays?: number | null;
}

export interface UpdateBuildingRequest {
  name?: string | null;
  description?: string | null;
  registrationNumber?: string | null;
  status?: BuildingStatus | null;
  buildingProfile?: { profilePic?: string | null; removeProfilePic?: boolean | null } | null;
  monthlyRent?: number | null;
}

export interface BuildingSearchParams {
  countyId?: number | null;
  cityId?: number | null;
  name?: string;
  registrationNumber?: string;
  status?: string;
  agencyId?: number;
  city?: string;
  county?: string;
  subCounty?: string;
  postalCode?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface BuildingFloorPreview {
  id: number;
  floorNumber?: number | null;
  name?: string | null;
  roomCount?: number | null;
}

export interface BuildingFloorDetail extends BuildingFloorPreview {
  rooms?: RoomPreview[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AddFloorRequest {
  floorNumber: number;
  name?: string | null;
  numberOfRooms?: number | null;
  namingConvention?: BuildingNamingConvention | null;
}

export interface UpdateFloorRequest {
  name?: string | null;
  floorNumber?: number | null;
}

export interface RoomPreview {
  id: number;
  roomNumber?: number | null;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  maintenanceStatus?: string | null;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  paymentDueDay?: number | null;
  rentArrearsGenerateDay?: number | null;
  lateFeeAmount?: number | string | null;
  gracePeriodDays?: number | null;
  additionalTermsAndConditions?: string | null;
  amenities?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RoomDetail extends RoomPreview {
  /**
   * The contract a lease for this room would be generated from — resolved, not
   * read off the room: a room with no override of its own still has a contract,
   * and `contractTemplateSource` says which level supplied it.
   */
  contractTemplateContent?: string | null;
  contractTemplateSource?: ContractTemplateSource | null;
  contractTemplateCustomized?: boolean | null;
  buildingTermsAndConditions?: string | null;
  agencyTermsAndConditions?: string | null;
  floorId?: number | null;
  floorName?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  utilities?: RoomUtility[] | null;
}

/** Which level of the chain supplied the contract document. */
export type ContractTemplateSource = 'ROOM' | 'BUILDING' | 'AGENCY' | 'MASTER';

/** Which level of the room → building → agency chain supplied a term. */
export type RoomTermSource = 'ROOM' | 'BUILDING' | 'AGENCY' | 'DEFAULT' | 'UNSET';

/**
 * What a lease for this room would actually be written with, resolved down the
 * room → building → agency chain — so a room that prices nothing of its own
 * still shows the building's figure instead of a blank.
 *
 * A null `monthlyRent` means no level has priced the room at all; lease
 * generation refuses that, so the operator has to enter one.
 */
export interface RoomEffectiveTerms {
  roomId: number;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  paymentDueDay?: number | null;
  lateFeeAmount?: number | string | null;
  gracePeriodDays?: number | null;
  sources?: Partial<Record<
    'monthlyRent' | 'securityDeposit' | 'paymentDueDay' | 'lateFeeAmount' | 'gracePeriodDays',
    RoomTermSource
  >> | null;
}

export interface AddRoomRequest {
  roomNumber: number;
  name?: string | null;
  description?: string | null;
  monthlyRent?: number | null;
  amenities?: string[] | null;
  status?: RoomStatus | null;
  /**
   * Optional room-specific contract document. Supplying it forks a room-level
   * template; omitted, the room inherits its building's. Variables are
   * `<span data-var="key">` elements, never {{token}} text.
   */
  contractTemplateContent?: string | null;
}

export interface UpdateRoomRequest {
  name?: string | null;
  description?: string | null;
  roomNumber?: number | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  paymentDueDay?: number | null;
  rentArrearsGenerateDay?: number | null;
  lateFeeAmount?: number | null;
  gracePeriodDays?: number | null;
  additionalTermsAndConditions?: string | null;
  amenities?: string[] | null;
  status?: RoomStatus | null;
  /** As on create: present forks a room-level document, absent leaves inheritance alone. */
  contractTemplateContent?: string | null;
}

export interface AvailableRoomSearchParams {
  buildingId?: number;
  agencyId?: number;
  minRent?: number;
  maxRent?: number;
  buildingName?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface RoomUtility {
  id: number;
  name: string;
  description?: string | null;
  billingType?: UtilityBillingType | null;
  fixedAmount?: number | string | null;
  unitRate?: number | string | null;
  billingTiming?: UtilityBillingTiming | null;
  percentage?: number | string | null;
  unit?: string | null;
  meterNumber?: string | null;
  includedInRent?: boolean | null;
  isActive?: boolean | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RoomUtilityUpsertRequest {
  name: string;
  description?: string | null;
  billingType: UtilityBillingType;
  fixedAmount?: number | null;
  billingTiming?: UtilityBillingTiming | null;
  percentage?: number | null;
  unitRate?: number | null;
  unit?: string | null;
  meterNumber?: string | null;
  includedInRent?: boolean | null;
  isActive?: boolean | null;
  notes?: string | null;
}

export const AGENCY_SORTABLE_FIELDS = ['name', 'registrationNumber', 'createdAt', 'status'] as const;
export const BUILDING_SORTABLE_FIELDS = ['name', 'registrationNumber', 'createdAt', 'status'] as const;

/** Mirrors `LeasePolicy.Pets`. */
export type PetsPolicy = 'PERMITTED' | 'NOT_PERMITTED' | 'ON_APPROVAL';
/** Mirrors `LeasePolicy.Parking`. */
export type ParkingPolicy = 'INCLUDED' | 'EXTRA' | 'NONE';
/** Mirrors `LeasePolicy.ServiceChargeBorneBy`. */
export type ServiceChargeBorneBy = 'LANDLORD' | 'TENANT';
/** Mirrors `LeasePolicy.StampDutyBorneBy`. */
export type StampDutyBorneBy = 'LANDLORD' | 'TENANT' | 'SHARED';

/**
 * Mirrors `AgencyProfileDtos.ContractSettings` — the agency-wide values a
 * contract states. A building may override the landlord and payment values;
 * these are the fallback. PUT replaces the whole object: a null clears.
 */
export interface AgencyContractSettings {
  landlordFullName?: string | null;
  landlordIdNumber?: string | null;
  landlordPostalAddress?: string | null;
  landlordPhone?: string | null;
  landlordEmail?: string | null;
  mpesaPaybill?: string | null;
  mpesaAccount?: string | null;
  bankAccount?: string | null;
  petsPolicy?: PetsPolicy | null;
  parkingPolicy?: ParkingPolicy | null;
  serviceChargeBorneBy?: ServiceChargeBorneBy | null;
  stampDutyBorneBy?: StampDutyBorneBy | null;
  utilitiesNote?: string | null;
  noticePeriodDays?: number | null;
}

/**
 * Mirrors `BuildingDtos.ContractSettings`: the agency's fields plus the
 * building's LR number. A null value falls back to the agency's.
 */
export interface BuildingContractSettings extends AgencyContractSettings {
  lrNumber?: string | null;
  /** Read-only: what applies where this building leaves a field blank. Ignored on PUT. */
  agencyDefaults?: AgencyContractSettings | null;
}

/** Mirrors `AgencyDtos.PublicIdentity` — all a by-code lookup reveals. */
export interface AgencyPublicIdentity {
  id: number;
  agencyCode: string;
  name: string;
  logoUrl?: string | null;
}
