import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { toMonthPath } from './models/rent.models';
import {
  ReceivedCounts,
  ReceivedPayment,
  ReceivedPaymentStatus,
  ReadMessageResult,
  RecordReceivedRequest
} from './reconciliation.models';

/** Money the landlord received, matched against what tenants report. */
@Injectable({ providedIn: 'root' })
export class ReconciliationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  record(agencyId: number, request: RecordReceivedRequest): Observable<ReceivedPayment> {
    return this.http.post<ApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationReceived(agencyId)}`, request)
      .pipe(map((response) => response.data));
  }

  list(agencyId: number, params: { status?: ReceivedPaymentStatus; page?: number; size?: number } = {}): Observable<PaginatedResult<ReceivedPayment>> {
    return this.http.get<PaginatedApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationReceived(agencyId)}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  /** Reads a pasted confirmation message and suggests the tenant; saves nothing. */
  readMessage(agencyId: number, message: string): Observable<ReadMessageResult> {
    return this.http.post<ApiResponse<ReadMessageResult>>(`${this.apiUrl}/${ApiUrls.reconciliationReadMessage(agencyId)}`, { message })
      .pipe(map((response) => response.data));
  }

  counts(agencyId: number): Observable<ReceivedCounts> {
    return this.http.get<ApiResponse<ReceivedCounts>>(`${this.apiUrl}/${ApiUrls.reconciliationCounts(agencyId)}`)
      .pipe(map((response) => response.data));
  }

  matchWith(agencyId: number, id: number, submissionId: number): Observable<ReceivedPayment> {
    return this.http.post<ApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationMatch(agencyId, id, submissionId)}`, {})
      .pipe(map((response) => response.data));
  }

  unmatch(agencyId: number, id: number): Observable<ReceivedPayment> {
    return this.http.post<ApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationAction(agencyId, id, 'unmatch')}`, {})
      .pipe(map((response) => response.data));
  }

  discard(agencyId: number, id: number, reason: string): Observable<ReceivedPayment> {
    return this.http.post<ApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationAction(agencyId, id, 'discard')}`, { reason })
      .pipe(map((response) => response.data));
  }

  /** Approves the matched tenant report for the amount that actually arrived. */
  confirm(agencyId: number, buildingId: number, id: number): Observable<ReceivedPayment> {
    return this.http.post<ApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationInBuilding(agencyId, buildingId, id, 'confirm')}`, {})
      .pipe(map((response) => response.data));
  }

  assign(agencyId: number, buildingId: number, id: number, tenantId: number, month: string): Observable<ReceivedPayment> {
    return this.http.post<ApiResponse<ReceivedPayment>>(`${this.apiUrl}/${ApiUrls.reconciliationInBuilding(agencyId, buildingId, id, 'assign')}`,
      { tenantId, paymentForMonth: toMonthPath(month) })
      .pipe(map((response) => response.data));
  }
}
