export interface AddressPreview {
  id: number;
  townId?: number | null;
  subCountyId?: number | null;
  wardId?: number | null;
  city?: string | null;
  /** Registry id. The text `city` stays as the display value and the fallback
   *  for legacy rows that never matched a registry entry. */
  cityId?: number | null;
  county?: string | null;
  countyId?: number | null;
  subCounty?: string | null;
  ward?: string | null;
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
  cityId?: number | null;
  city?: string;
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
  cityId?: number | null;
  townId?: number | null;
  subCountyId?: number | null;
  wardId?: number | null;
  description?: string | null;
  city?: string | null;
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

export interface CityOption {
  id: number;
  name: string;
  countyId: number;
  countyName?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * The administrative hierarchy — county → sub-county → ward — which runs
 * parallel to the settlement one, county → city → town. A Kenyan address is
 * normally given in both, so an address carries a level from each rather than
 * one path through a single tree.
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
  cityId: number;
  cityName?: string | null;
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

export interface CityUpsertRequest {
  name: string;
  countyId: number;
  isActive?: boolean | null;
}

export interface TownUpsertRequest {
  name: string;
  cityId: number;
  isActive?: boolean | null;
}
