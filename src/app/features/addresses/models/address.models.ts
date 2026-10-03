export interface AddressPreview {
  id: number;
  townId?: number | null;
  subCountyId?: number | null;
  wardId?: number | null;
  county?: string | null;
  countyId?: number | null;
  subCounty?: string | null;
  ward?: string | null;
  town?: string | null;
  /** Typed per address, what the registry cannot hold — coarse to fine. */
  estate?: string | null;
  street?: string | null;
  buildingHouse?: string | null;
  postalCode?: string | null;
  createdAt?: string | null;
}

export interface AddressDetail extends AddressPreview {
  /** How someone finds it on the ground — not part of the postal address. */
  description?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  mapPin?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface AddressSearchParams {
  /** Prefer the ids: they match the registry FK rather than a typed string.
   *  Nullable because a cleared filter is a real state the form can hold. */
  countyId?: number | null;
  county?: string;
  subCounty?: string;
  ward?: string;
  postalCode?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface AddressUpsertRequest {
  countyId?: number | null;
  subCountyId?: number | null;
  wardId?: number | null;
  townId?: number | null;
  estate?: string | null;
  street?: string | null;
  buildingHouse?: string | null;
  description?: string | null;
  county?: string | null;
  subCounty?: string | null;
  ward?: string | null;
  postalCode?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  mapPin?: string | null;
}

export interface CountyOption {
  id: number;
  name: string;
  code?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * The place hierarchy, one chain kept by the super admin and picked by users:
 * county → sub-county → ward → town/locality. What it cannot hold — estate,
 * street, building — is typed on each address.
 */
export interface SubCountyOption {
  id: number;
  name: string;
  countyId?: number | null;
  countyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WardOption {
  id: number;
  name: string;
  subCountyId?: number | null;
  subCountyName?: string | null;
  countyId?: number | null;
  countyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SubCountyUpsertRequest {
  name: string;
  countyId?: number | null;
}

export interface WardUpsertRequest {
  name: string;
  subCountyId?: number | null;
}

export interface TownOption {
  id: number;
  name: string;
  wardId: number;
  wardName?: string | null;
  subCountyId?: number | null;
  subCountyName?: string | null;
  countyId?: number | null;
  countyName?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CountyUpsertRequest {
  name: string;
  code?: string | null;
  isActive?: boolean | null;
}

export interface TownUpsertRequest {
  name: string;
  wardId: number;
  isActive?: boolean | null;
}
