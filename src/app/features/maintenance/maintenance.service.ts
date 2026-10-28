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
  MaintenanceStatusChange
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

  changeStatus(agencyId: number, buildingId: number, id: number, request: MaintenanceStatusChange): Observable<MaintenanceDetail> {
    return this.http.patch<ApiResponse<MaintenanceDetail>>(`${this.apiUrl}/${ApiUrls.maintenanceStatus(agencyId, buildingId, id)}`, request)
      .pipe(map((response) => response.data));
  }
}
