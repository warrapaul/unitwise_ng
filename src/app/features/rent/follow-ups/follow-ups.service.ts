import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../../core/constants/api-urls';
import { ApiResponse, PaginatedApiResponse } from '../../../core/models/api-response.model';
import { PaginatedResult } from '../../../core/models/pagination.model';
import { API_URL } from '../../../core/tokens/api-url.token';
import { buildHttpParams } from '../../../shared/utils/query-params.util';
import { FollowUp, FollowUpCreateRequest, FollowUpSearchParams, FollowUpSummary, TenantFollowUpState } from './follow-ups.models';

/** The arrears follow-up log and promises to pay. */
@Injectable({ providedIn: 'root' })
export class FollowUpsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  search(agencyId: number, params: FollowUpSearchParams = {}): Observable<PaginatedResult<FollowUp>> {
    return this.http.get<PaginatedApiResponse<FollowUp>>(`${this.apiUrl}/${ApiUrls.followUps(agencyId)}`, { params: buildHttpParams(params) })
      .pipe(map((response) => ({ items: response.data ?? [], pagination: response.pagination })));
  }

  summary(agencyId: number, buildingId: number | null): Observable<FollowUpSummary> {
    return this.http.get<ApiResponse<FollowUpSummary>>(`${this.apiUrl}/${ApiUrls.followUpSummary(agencyId)}`, { params: buildHttpParams({ buildingId }) })
      .pipe(map((response) => response.data));
  }

  states(agencyId: number, tenantIds: number[]): Observable<TenantFollowUpState[]> {
    return this.http.get<ApiResponse<TenantFollowUpState[]>>(`${this.apiUrl}/${ApiUrls.followUpStates(agencyId)}`,
      { params: buildHttpParams({ tenantIds: tenantIds.join(',') }) })
      .pipe(map((response) => response.data ?? []));
  }

  create(agencyId: number, buildingId: number, request: FollowUpCreateRequest): Observable<FollowUp> {
    return this.http.post<ApiResponse<FollowUp>>(`${this.apiUrl}/${ApiUrls.followUpsForBuilding(agencyId, buildingId)}`, request)
      .pipe(map((response) => response.data));
  }

  cancel(agencyId: number, buildingId: number, id: number): Observable<FollowUp> {
    return this.http.post<ApiResponse<FollowUp>>(`${this.apiUrl}/${ApiUrls.followUp(agencyId, buildingId, id)}/cancel`, {})
      .pipe(map((response) => response.data));
  }

  delete(agencyId: number, buildingId: number, id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.followUp(agencyId, buildingId, id)}`).pipe(map(() => undefined));
  }
}
