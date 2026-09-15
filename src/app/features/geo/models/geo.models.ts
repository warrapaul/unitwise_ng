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
  updatedAt?: string;
}

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
