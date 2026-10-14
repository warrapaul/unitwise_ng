export interface GeoRegionPreview {
  id: string;
  name: string;
  areaCode?: string | null;
  description?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface GeoRegionDetail extends GeoRegionPreview {
  polygonWkt?: string | null;
  subRegions?: GeoRegionPreview[];
  updatedAt?: string;
}

export interface GeoRegionLookup {
  id: string;
  name: string;
  areaCode?: string | null;
  parentName?: string | null;
}

export interface CreateGeoRegionRequest {
  name: string;
  areaCode?: string | null;
  description?: string | null;
  parentId?: string | null;
  polygonWkt?: string | null;
  isActive?: boolean;
}

export type UpdateGeoRegionRequest = CreateGeoRegionRequest;

export interface GeoRegionSearchParams {
  name?: string;
  areaCode?: string;
  isActive?: boolean | string;
  parentId?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface GeoLandmarkPreview {
  id: string;
  name: string;
  /** Public code from the region, e.g. KAS-014 — what a caller reads off a banner. */
  code?: string | null;
  landmarkType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  regionId?: string | null;
  regionName?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface GeoLandmarkDetail extends GeoLandmarkPreview {
  description?: string | null;
  regionAreaCode?: string | null;
  parentRegionName?: string | null;
  createdByUserId?: number | null;
  updatedAt?: string;
}

/** What a pasted Google Maps link or "lat, lng" resolves to. */
export interface MapLinkResult {
  found: boolean;
  latitude?: number | null;
  longitude?: number | null;
  name?: string | null;
  /** pin, explicit, place_id or viewport (the least precise). */
  source?: string | null;
  reason?: 'SHORT_LINK_UNRESOLVED' | 'NOT_A_LOCATION' | 'LOOKUP_FAILED' | 'NO_LOCATION_IN_LINK' | string | null;
}

/** Where a pinned address is: region, the region above it, and the nearest landmark. */
export interface GeoContext {
  regionId?: string | null;
  regionName?: string | null;
  regionAreaCode?: string | null;
  parentRegionName?: string | null;
  /** The landmark the customer named by its banner code. */
  customerLandmark?: GeoContext['nearestLandmark'];
  /** Closest mapped building to the customer's pin while none is linked — for the rider to confirm. */
  nearestBuilding?: {
    id: string;
    code?: string | null;
    name: string;
    buildingType?: string | null;
    distanceMeters?: number | null;
  } | null;
  /** The only location is the landmark the customer named, not their home. */
  approximate?: boolean;
  /** The mapped building the address is linked to. */
  building?: {
    id: string;
    code?: string | null;
    name: string;
    buildingType?: string | null;
    description?: string | null;
    floors?: number | null;
    contactName?: string | null;
    contactPhone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  nearestLandmark?: {
    id: string;
    code?: string | null;
    name: string;
    landmarkType?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    distanceMeters?: number | null;
  } | null;
}

/** Floor, room and notes a rider recorded at the door — staff only, never sent to the customer. */
export interface DoorDetails {
  floorNumber?: string | null;
  roomNumber?: string | null;
  riderNotes?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
}

/** A null field is left as it is; '' clears it. */
export interface DoorDetailsRequest {
  floorNumber?: string | null;
  roomNumber?: string | null;
  riderNotes?: string | null;
  geoBuildingId?: string | null;
}

export interface GeoBuildingPreview {
  id: string;
  name: string;
  /** e.g. KAS-B007 */
  code?: string | null;
  buildingType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  regionName?: string | null;
  landmarkId?: string | null;
  landmarkName?: string | null;
  landmarkCode?: string | null;
  /** On nearby searches only. */
  distanceMeters?: number | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface GeoBuildingDetail extends GeoBuildingPreview {
  description?: string | null;
  floors?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  regionId?: string | null;
  parentRegionName?: string | null;
  createdByUserId?: number | null;
  updatedAt?: string;
}

export interface GeoBuildingRequest {
  name: string;
  buildingType?: string | null;
  description?: string | null;
  floors?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  latitude: number;
  longitude: number;
  /** Omit to take the closest landmark; '' clears it on update. */
  landmarkId?: string | null;
  isActive?: boolean;
}

export interface GeoBuildingSearchParams {
  q?: string;
  buildingType?: string;
  regionId?: string;
  landmarkId?: string;
  isActive?: boolean | string;
  page?: number;
  size?: number;
  sort?: string | string[];
}

export const BUILDING_TYPES = ['APARTMENT', 'HOUSE', 'HOSTEL', 'COURT', 'COMMERCIAL', 'OTHER'] as const;

/** "PETROL_STATION" → "Petrol station". */
export function kindLabel(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Common landmark kinds, offered as suggestions; any other word is accepted. */
export const LANDMARK_TYPES = [
  'SCHOOL', 'CHURCH', 'MOSQUE', 'HOSPITAL', 'PETROL_STATION', 'SUPERMARKET', 'SHOPPING_MALL',
  'MARKET', 'BUS_STOP', 'STAGE', 'ESTATE_GATE', 'POLICE_STATION', 'RESTAURANT', 'GENERAL'
] as const;

export interface CreateGeoLandmarkRequest {
  name: string;
  description?: string | null;
  landmarkType?: string | null;
  latitude: number;
  longitude: number;
  isActive?: boolean;
}

export interface UpdateGeoLandmarkRequest extends Partial<CreateGeoLandmarkRequest> {
  /** Manual override only — the backend auto-assigns the region from the GPS point. */
  regionId?: string | null;
}

export interface GeoLandmarkSearchParams {
  name?: string;
  landmarkType?: string;
  regionId?: string;
  isActive?: boolean | string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export const GEO_REGION_SORTABLE_FIELDS = ['name', 'areaCode', 'createdAt'] as const;
export const GEO_LANDMARK_SORTABLE_FIELDS = ['name', 'landmarkType', 'createdAt'] as const;
