import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  MaintenanceCreateRequest,
  MaintenanceDetail,
  MaintenancePreview,
  MaintenanceSearchParams,
  MaintenanceStatusChange,
  MaintenanceMetrics,
  StaffOption
} from './maintenance.models';

@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // ── The tenant's own ───────────────────────────────────────────────────────

  report(request: MaintenanceCreateRequest): Observable<MaintenanceDetail> {
    return this.http.post<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceRequests}`, request)
      .pipe(map((response) => response.data));
  }

  getMine(params: { page?: number; size?: number } = {}): Observable<PaginatedResult<MaintenancePreview>> {
    return this.http.get<PaginatedApiResponse<MaintenancePreview>>(`${this.apiUrl}/${ApiUrls.maintenanceMine}`, {
      params: buildHttpParams(params)
    }).pipe(retry({ count: 2, delay: 1000 }), map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getMineById(id: number): Observable<MaintenanceDetail> {
    return this.http.get<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceMineById(id)}`)
      .pipe(map((response) => response.data));
  }

  cancelMine(id: number, reason: string): Observable<MaintenanceDetail> {
    // The server fixes the target status to CANCELLED; the body still has to name one.
    return this.http.patch<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceMineCancel(id)}`,
      { status: 'CANCELLED', workNotes: reason } satisfies MaintenanceStatusChange)
      .pipe(map((response) => response.data));
  }

  // ── Staff ──────────────────────────────────────────────────────────────────

  getForAgency(agencyId: number, params: MaintenanceSearchParams = {}): Observable<PaginatedResult<MaintenancePreview>> {
    return this.http.get<PaginatedApiResponse<MaintenancePreview>>(`${this.apiUrl}/${ApiUrls.maintenanceByAgency(agencyId)}`, {
      params: buildHttpParams(params)
    }).pipe(retry({ count: 2, delay: 1000 }), map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getById(agencyId: number, buildingId: number, id: number): Observable<MaintenanceDetail> {
    return this.http.get<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceById(agencyId, buildingId, id)}`)
      .pipe(map((response) => response.data));
  }

  /** A photo of the problem on the tenant's own request. */
  addMyPhoto(id: number, file: File): Observable<MaintenanceDetail> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceMinePhotos(id)}`, body)
      .pipe(map((response) => response.data));
  }

  metrics(agencyId: number, buildingId?: number): Observable<MaintenanceMetrics> {
    return this.http.get<ApiResponse<MaintenanceMetrics>>(`${this.apiUrl}/${ApiUrls.maintenanceMetrics(agencyId)}`, {
      params: buildHttpParams({ buildingId })
    }).pipe(map((response) => response.data));
  }

  staff(agencyId: number): Observable<StaffOption[]> {
    return this.http.get<ApiResponse<StaffOption[]>>(`${this.apiUrl}/${ApiUrls.maintenanceStaff(agencyId)}`)
      .pipe(map((response) => response.data ?? []));
  }

  assign(agencyId: number, buildingId: number, id: number, userId: number | null): Observable<MaintenanceDetail> {
    return this.http.patch<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceAction(agencyId, buildingId, id, 'assign')}`, { userId })
      .pipe(map((response) => response.data));
  }

  /** Plans the visit: sets the scheduled date on the request. */
  schedule(agencyId: number, buildingId: number, id: number, scheduledDate: string): Observable<MaintenanceDetail> {
    return this.http.patch<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceUpdate(agencyId, buildingId, id)}`, { scheduledDate })
      .pipe(map((response) => response.data));
  }

  /** Bills the tenant for the repair through the rent module; once only. */
  charge(agencyId: number, buildingId: number, id: number, request: { amount: number; reason: string; billedMonth: string | null }): Observable<MaintenanceDetail> {
    return this.http.post<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceAction(agencyId, buildingId, id, 'charge')}`, request)
      .pipe(map((response) => response.data));
  }

  addPhoto(agencyId: number, buildingId: number, id: number, file: File): Observable<MaintenanceDetail> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceAction(agencyId, buildingId, id, 'photos')}`, body)
      .pipe(map((response) => response.data));
  }

  changeStatus(agencyId: number, buildingId: number, id: number, request: MaintenanceStatusChange): Observable<MaintenanceDetail> {
    return this.http.patch<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceStatus(agencyId, buildingId, id)}`, request)
      .pipe(map((response) => response.data));
  }
}
