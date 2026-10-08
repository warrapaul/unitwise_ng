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
  /** The two finest registry levels: town → estate/area → street/road. */
  estateArea?: string | null;
  estateAreaId?: number | null;
  streetRoad?: string | null;
  streetRoadId?: number | null;
  /** Typed per address — the one level the registry cannot hold. */
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
  estateAreaId?: number | null;
  streetRoadId?: number | null;
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
 * county → sub-county → ward → town/locality → estate/area → street/road. Only
 * the building/house is typed on each address.
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

export interface EstateAreaOption {
  id: number;
  name: string;
  townId: number;
  townName?: string | null;
  wardId?: number | null;
  wardName?: string | null;
  subCountyId?: number | null;
  subCountyName?: string | null;
  countyId?: number | null;
  countyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StreetRoadOption {
  id: number;
  name: string;
  estateAreaId: number;
  estateAreaName?: string | null;
  townId?: number | null;
  townName?: string | null;
  countyId?: number | null;
  countyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EstateAreaUpsertRequest {
  name: string;
  townId: number;
}

export interface StreetRoadUpsertRequest {
  name: string;
  estateAreaId: number;
}
