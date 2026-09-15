import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  CreateGeoLandmarkRequest,
  CreateGeoRegionRequest,
  GeoLandmarkDetail,
  GeoLandmarkPreview,
  GeoLandmarkSearchParams,
  GeoRegionDetail,
  GeoRegionLookup,
  GeoRegionPreview,
  GeoRegionSearchParams,
  UpdateGeoLandmarkRequest,
  UpdateGeoRegionRequest
} from './models/geo.models';

@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  searchRegions(params: GeoRegionSearchParams): Observable<PaginatedResult<GeoRegionPreview>> {
    return this.http.get<PaginatedApiResponse<GeoRegionPreview>>(`${this.apiUrl}/${ApiUrls.geoRegions}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getRootRegions(params: { page?: number; size?: number } = {}): Observable<PaginatedResult<GeoRegionPreview>> {
    return this.http.get<PaginatedApiResponse<GeoRegionPreview>>(`${this.apiUrl}/${ApiUrls.geoRegionRoots}`, {
      params: buildHttpParams({ size: 50, ...params })
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getRegion(regionId: string): Observable<GeoRegionDetail> {
    return this.http.get<ApiResponse<GeoRegionDetail>>(`${this.apiUrl}/${ApiUrls.geoRegionById(regionId)}`).pipe(
      map((response) => response.data)
    );
  }

  createRegion(request: CreateGeoRegionRequest): Observable<GeoRegionDetail> {
    return this.http.post<ApiResponse<GeoRegionDetail>>(`${this.apiUrl}/${ApiUrls.geoRegions}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateRegion(regionId: string, request: UpdateGeoRegionRequest): Observable<GeoRegionDetail> {
    return this.http.patch<ApiResponse<GeoRegionDetail>>(`${this.apiUrl}/${ApiUrls.geoRegionById(regionId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteRegion(regionId: string): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.geoRegionById(regionId)}`).pipe(
      map(() => void 0)
    );
  }

  /** Returns null when no region carries the supplied area code. */
  lookupRegionByAreaCode(areaCode: string): Observable<GeoRegionLookup | null> {
    return this.http.get<ApiResponse<GeoRegionLookup | null>>(`${this.apiUrl}/${ApiUrls.geoRegionLookup}`, {
      params: buildHttpParams({ areaCode })
    }).pipe(map((response) => response.data ?? null));
  }

  /** Returns null when the point falls outside every mapped region polygon. */
  findRegionForPoint(lat: number, lng: number): Observable<GeoRegionLookup | null> {
    return this.http.get<ApiResponse<GeoRegionLookup | null>>(`${this.apiUrl}/${ApiUrls.geoRegionContainsPoint}`, {
      params: buildHttpParams({ lat, lng })
    }).pipe(map((response) => response.data ?? null));
  }

  searchLandmarks(params: GeoLandmarkSearchParams): Observable<PaginatedResult<GeoLandmarkPreview>> {
    return this.http.get<PaginatedApiResponse<GeoLandmarkPreview>>(`${this.apiUrl}/${ApiUrls.geoLandmarks}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getLandmark(landmarkId: string): Observable<GeoLandmarkDetail> {
    return this.http.get<ApiResponse<GeoLandmarkDetail>>(`${this.apiUrl}/${ApiUrls.geoLandmarkById(landmarkId)}`).pipe(
      map((response) => response.data)
    );
  }

  createLandmark(request: CreateGeoLandmarkRequest): Observable<GeoLandmarkDetail> {
    return this.http.post<ApiResponse<GeoLandmarkDetail>>(`${this.apiUrl}/${ApiUrls.geoLandmarks}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateLandmark(landmarkId: string, request: UpdateGeoLandmarkRequest): Observable<GeoLandmarkDetail> {
    return this.http.patch<ApiResponse<GeoLandmarkDetail>>(`${this.apiUrl}/${ApiUrls.geoLandmarkById(landmarkId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteLandmark(landmarkId: string): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.geoLandmarkById(landmarkId)}`).pipe(
      map(() => void 0)
    );
  }

  findNearbyLandmarks(lat: number, lng: number, radiusKm = 2): Observable<GeoLandmarkPreview[]> {
    return this.http.get<ApiResponse<GeoLandmarkPreview[]>>(`${this.apiUrl}/${ApiUrls.geoLandmarksNearby}`, {
      params: buildHttpParams({ lat, lng, radiusKm })
    }).pipe(map((response) => response.data ?? []));
  }
}
