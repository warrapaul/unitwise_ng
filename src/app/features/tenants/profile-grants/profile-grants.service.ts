import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../../core/models/api-response.model';
import { PaginatedResult } from '../../../core/models/pagination.model';
import { ApiUrls } from '../../../core/constants/api-urls';
import { buildHttpParams } from '../../../shared/utils/query-params.util';
import {
  ApproveGrantRequest,
  CreateShareCodeRequest,
  ProfileGrant,
  GrantSnapshotAccessRequest,
  RedeemShareCodeRequest,
  RequestDocumentAccess,
  RevokeGrantRequest,
  SnapshotAccessGrant
} from '../models/profile-grant.models';

/**
 * Document sharing consent, and the re-opening of sealed snapshots.
 *
 * The method list is the security model: the owner approves, declines, revokes
 * and issues codes; the agency requests and redeems. Nothing here lets an
 * agency grant itself anything, and that absence is the point — a userUid is
 * short and meant to be shared, so it must never be enough to reach a national
 * ID.
 */
@Injectable({ providedIn: 'root' })
export class ProfileGrantsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // ── The owner's side ──────────────────────────────────────────────────────

  /** Everything this person is sharing or has been asked for. */
  getMyGrants(params: Record<string, unknown> = {}): Observable<PaginatedResult<ProfileGrant>> {
    return this.http.get<PaginatedApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantsMine}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  /** Exactly which documents, and until when. There is no "share everything". */
  approveGrant(grantId: number, request: ApproveGrantRequest): Observable<ProfileGrant> {
    return this.http.patch<ApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantApprove(grantId)}`, request
    ).pipe(map((response) => response.data));
  }

  declineGrant(grantId: number): Observable<ProfileGrant> {
    return this.http.patch<ApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantDecline(grantId)}`, {}
    ).pipe(map((response) => response.data));
  }

  /**
   * Closes the agency's access now. Any verification snapshot already taken is
   * untouched — the agency keeps its frozen record of what it verified, which
   * is what makes revoking safe to offer at all.
   */
  revokeGrant(grantId: number, request: RevokeGrantRequest = {}): Observable<ProfileGrant> {
    return this.http.patch<ApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantRevoke(grantId)}`, request
    ).pipe(map((response) => response.data));
  }

  /**
   * For handovers in person, or before the landlord has set anything up.
   *
   * The response carries `shareCode` once and never again — only its hash is
   * stored — so whatever calls this must put the code in front of the person
   * immediately rather than expecting to re-read it.
   */
  createShareCode(request: CreateShareCodeRequest): Observable<ProfileGrant> {
    return this.http.post<ApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantShareCodes}`, request
    ).pipe(map((response) => response.data));
  }

  // ── The agency's side ─────────────────────────────────────────────────────

  /** Asks. Grants nothing on its own — a request is not consent. */
  requestAccess(agencyId: number, request: RequestDocumentAccess): Observable<ProfileGrant> {
    return this.http.post<ApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantRequests(agencyId)}`, request
    ).pipe(map((response) => response.data));
  }

  /** A code names the agency it was issued for; redemption by any other is refused. */
  redeemShareCode(agencyId: number, request: RedeemShareCodeRequest): Observable<ProfileGrant> {
    return this.http.post<ApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantRedeem(agencyId)}`, request
    ).pipe(map((response) => response.data));
  }

  getAgencyGrants(
    agencyId: number,
    params: Record<string, unknown> = {}
  ): Observable<PaginatedResult<ProfileGrant>> {
    return this.http.get<PaginatedApiResponse<ProfileGrant>>(
      `${this.apiUrl}/${ApiUrls.profileGrantsByAgency(agencyId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  // ── Sealed snapshots ──────────────────────────────────────────────────────

  /**
   * Re-opens a sealed snapshot for one named person. Reason and expiry are
   * both required, and you cannot issue one to yourself, so every unseal has
   * two people behind it and an answer to "why".
   */
  grantSnapshotAccess(
    snapshotId: number,
    request: GrantSnapshotAccessRequest
  ): Observable<SnapshotAccessGrant> {
    return this.http.post<ApiResponse<SnapshotAccessGrant>>(
      `${this.apiUrl}/${ApiUrls.snapshotAccessGrants(snapshotId)}`, request
    ).pipe(map((response) => response.data));
  }

  revokeSnapshotAccess(grantId: number): Observable<SnapshotAccessGrant> {
    return this.http.patch<ApiResponse<SnapshotAccessGrant>>(
      `${this.apiUrl}/${ApiUrls.snapshotAccessRevoke(grantId)}`, {}
    ).pipe(map((response) => response.data));
  }

  /** Who was let in, by whom, why, and whether they used it. */
  getSnapshotGrants(snapshotId: number): Observable<SnapshotAccessGrant[]> {
    return this.http.get<ApiResponse<SnapshotAccessGrant[]>>(
      `${this.apiUrl}/${ApiUrls.snapshotAccessGrants(snapshotId)}`
    ).pipe(map((response) => response.data ?? []));
  }
}
