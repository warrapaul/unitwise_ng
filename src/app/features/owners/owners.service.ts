import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { API_URL } from '../../core/tokens/api-url.token';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  ManagementMode,
  MyOwnerAccount,
  OwnerPayout,
  OwnerPayoutRequest,
  OwnerSaveRequest,
  OwnerStatement,
  PropertyOwner,
  CommissionType
} from './owners.models';

interface PageParams { page?: number; size?: number; }

/** Owners of the buildings an agency manages for them, and the landlord's own read-only view. */
@Injectable({ providedIn: 'root' })
export class OwnersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private url(path: string): string {
    return `${this.apiUrl}/${path}`;
  }

  private page<T>(path: string, params: object = {}): Observable<PaginatedResult<T>> {
    return this.http.get<PaginatedApiResponse<T>>(this.url(path), { params: buildHttpParams(params as Record<string, unknown>) })
      .pipe(map((response) => ({ items: response.data ?? [], pagination: response.pagination })));
  }

  private one<T>(path: string, params: object = {}): Observable<T> {
    return this.http.get<ApiResponse<T>>(this.url(path), { params: buildHttpParams(params as Record<string, unknown>) })
      .pipe(map((response) => response.data));
  }

  // ── Agency side ─────────────────────────────────────────────────────────────

  search(agencyId: number, params: PageParams & { search?: string | null } = {}): Observable<PaginatedResult<PropertyOwner>> {
    return this.page(ApiUrls.owners(agencyId), params);
  }

  get(agencyId: number, ownerId: number): Observable<PropertyOwner> {
    return this.one(ApiUrls.owner(agencyId, ownerId));
  }

  create(agencyId: number, request: OwnerSaveRequest): Observable<PropertyOwner> {
    return this.http.post<ApiResponse<PropertyOwner>>(this.url(ApiUrls.owners(agencyId)), request).pipe(map((r) => r.data));
  }

  update(agencyId: number, ownerId: number, request: OwnerSaveRequest): Observable<PropertyOwner> {
    return this.http.put<ApiResponse<PropertyOwner>>(this.url(ApiUrls.owner(agencyId, ownerId)), request).pipe(map((r) => r.data));
  }

  delete(agencyId: number, ownerId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(this.url(ApiUrls.owner(agencyId, ownerId))).pipe(map(() => undefined));
  }

  setBuildings(agencyId: number, ownerId: number, buildingIds: number[]): Observable<PropertyOwner> {
    return this.http.put<ApiResponse<PropertyOwner>>(this.url(ApiUrls.ownerBuildings(agencyId, ownerId)), { buildingIds })
      .pipe(map((r) => r.data));
  }

  setBuildingCommission(agencyId: number, ownerId: number, buildingId: number,
                        commissionType: CommissionType | null, commissionValue: number | null): Observable<PropertyOwner> {
    return this.http.put<ApiResponse<PropertyOwner>>(this.url(ApiUrls.ownerBuildingCommission(agencyId, ownerId, buildingId)),
      { commissionType, commissionValue }).pipe(map((r) => r.data));
  }

  grantPortalAccess(agencyId: number, ownerId: number, userUid: string): Observable<PropertyOwner> {
    return this.http.put<ApiResponse<PropertyOwner>>(this.url(ApiUrls.ownerPortalAccess(agencyId, ownerId)), { userUid })
      .pipe(map((r) => r.data));
  }

  revokePortalAccess(agencyId: number, ownerId: number): Observable<PropertyOwner> {
    return this.http.delete<ApiResponse<PropertyOwner>>(this.url(ApiUrls.ownerPortalAccess(agencyId, ownerId))).pipe(map((r) => r.data));
  }

  payouts(agencyId: number, ownerId: number, params: PageParams = {}): Observable<PaginatedResult<OwnerPayout>> {
    return this.page(ApiUrls.ownerPayouts(agencyId, ownerId), params);
  }

  recordPayout(agencyId: number, ownerId: number, request: OwnerPayoutRequest): Observable<OwnerPayout> {
    return this.http.post<ApiResponse<OwnerPayout>>(this.url(ApiUrls.ownerPayouts(agencyId, ownerId)), request).pipe(map((r) => r.data));
  }

  deletePayout(agencyId: number, ownerId: number, payoutId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(this.url(ApiUrls.ownerPayout(agencyId, ownerId, payoutId))).pipe(map(() => undefined));
  }

  statements(agencyId: number, ownerId: number, params: PageParams = {}): Observable<PaginatedResult<OwnerStatement>> {
    return this.page(ApiUrls.ownerStatements(agencyId, ownerId), params);
  }

  preview(agencyId: number, ownerId: number, month: string): Observable<OwnerStatement> {
    return this.one(ApiUrls.ownerStatementPreview(agencyId, ownerId), { month });
  }

  saveStatement(agencyId: number, ownerId: number, month: string, notes: string | null): Observable<OwnerStatement> {
    return this.http.post<ApiResponse<OwnerStatement>>(this.url(ApiUrls.ownerStatements(agencyId, ownerId)), { month, notes })
      .pipe(map((r) => r.data));
  }

  /** approve, reopen or send. */
  moveStatement(agencyId: number, ownerId: number, statementId: number, action: 'approve' | 'reopen' | 'send'): Observable<OwnerStatement> {
    return this.http.post<ApiResponse<OwnerStatement>>(this.url(`${ApiUrls.ownerStatement(agencyId, ownerId, statementId)}/${action}`), {})
      .pipe(map((r) => r.data));
  }

  statementPdf(agencyId: number, ownerId: number, statementId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(this.url(`${ApiUrls.ownerStatement(agencyId, ownerId, statementId)}/pdf`), { responseType: 'blob', observe: 'response' });
  }

  changeManagementMode(agencyId: number, managementMode: ManagementMode): Observable<unknown> {
    return this.http.put<ApiResponse<unknown>>(this.url(ApiUrls.agencyManagementMode(agencyId)), { managementMode }).pipe(map((r) => r.data));
  }

  // ── The landlord's own view ─────────────────────────────────────────────────

  myAccounts(): Observable<MyOwnerAccount[]> {
    return this.one(ApiUrls.myOwnerAccounts);
  }

  myMonth(ownerId: number, month: string): Observable<OwnerStatement> {
    return this.one(ApiUrls.myOwnerMonth(ownerId), { month });
  }

  myStatements(ownerId: number, params: PageParams = {}): Observable<PaginatedResult<OwnerStatement>> {
    return this.page(ApiUrls.myOwnerStatements(ownerId), params);
  }

  myStatementPdf(ownerId: number, statementId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(this.url(ApiUrls.myOwnerStatementPdf(ownerId, statementId)), { responseType: 'blob', observe: 'response' });
  }

  myPayouts(ownerId: number, params: PageParams = {}): Observable<PaginatedResult<OwnerPayout>> {
    return this.page(ApiUrls.myOwnerPayouts(ownerId), params);
  }
}
