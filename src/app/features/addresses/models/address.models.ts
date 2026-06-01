export interface AddressPreview {
  id: number;
  city?: string | null;
  county?: string | null;
  subCounty?: string | null;
  ward?: string | null;
  postalCode?: string | null;
  createdAt?: string | null;
}

export interface AddressDetail extends AddressPreview {
  latitude?: number | string | null;
  longitude?: number | string | null;
  mapPin?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface AddressSearchParams {
  city?: string;
  county?: string;
  subCounty?: string;
  ward?: string;
  postalCode?: string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface AddressUpsertRequest {
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
