import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry, shareReplay } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import {
  CascadeScope,
  ContractCascadePreview,
  ContractEditorCatalogue,
  ContractPreviewResult,
  ContractTemplateDetail,
  ContractTemplateHistoryEntry,
  SaveContractTemplateRequest
} from './models/contract.models';

/**
 * The contract document at each level of agency → building → room, plus the
 * catalogue the editor builds itself from.
 *
 * Reading a level always answers with a document: either the one that level owns
 * or the nearest one above it, with `source` and `customized` saying which. So a
 * page never has to walk the chain itself.
 */
@Injectable({ providedIn: 'root' })
export class ContractsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private catalogue$?: Observable<ContractEditorCatalogue>;

  /**
   * Variables and allowed formatting. Cached for the session: it changes only
   * when the backend deploys, and every editor instance needs it.
   */
  getEditorCatalogue(): Observable<ContractEditorCatalogue> {
    this.catalogue$ ??= this.http.get<ApiResponse<ContractEditorCatalogue>>(
      `${this.apiUrl}/${ApiUrls.contractVariables}`
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data),
      shareReplay(1)
    );

    return this.catalogue$;
  }

  // --- Master (platform) ---

  getMasterTemplate(): Observable<ContractTemplateDetail> {
    return this.http.get<ApiResponse<ContractTemplateDetail>>(`${this.apiUrl}/${ApiUrls.contractMaster}`).pipe(
      map((response) => response.data)
    );
  }

  /** Publishes a new master version; existing forks keep their content. */
  publishMasterTemplate(request: SaveContractTemplateRequest): Observable<ContractTemplateDetail> {
    return this.http.put<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractMaster}`,
      request
    ).pipe(map((response) => response.data));
  }

  // --- Agency ---

  getAgencyTemplate(agencyId: number): Observable<ContractTemplateDetail> {
    return this.http.get<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractAgency(agencyId)}`
    ).pipe(map((response) => response.data));
  }

  saveAgencyTemplate(agencyId: number, request: SaveContractTemplateRequest): Observable<ContractTemplateDetail> {
    return this.http.put<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractAgency(agencyId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /** Drops this agency's fork so it inherits the master again. Destructive. */
  resetAgencyTemplate(agencyId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.contractAgency(agencyId)}`).pipe(
      map(() => void 0)
    );
  }

  getAgencyHistory(agencyId: number): Observable<ContractTemplateHistoryEntry[]> {
    return this.http.get<ApiResponse<ContractTemplateHistoryEntry[]>>(
      `${this.apiUrl}/${ApiUrls.contractAgencyHistory(agencyId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  // --- Building ---

  getBuildingTemplate(agencyId: number, buildingId: number): Observable<ContractTemplateDetail> {
    return this.http.get<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractBuilding(agencyId, buildingId)}`
    ).pipe(map((response) => response.data));
  }

  saveBuildingTemplate(
    agencyId: number,
    buildingId: number,
    request: SaveContractTemplateRequest
  ): Observable<ContractTemplateDetail> {
    return this.http.put<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractBuilding(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  resetBuildingTemplate(agencyId: number, buildingId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(
      `${this.apiUrl}/${ApiUrls.contractBuilding(agencyId, buildingId)}`
    ).pipe(map(() => void 0));
  }

  getBuildingHistory(agencyId: number, buildingId: number): Observable<ContractTemplateHistoryEntry[]> {
    return this.http.get<ApiResponse<ContractTemplateHistoryEntry[]>>(
      `${this.apiUrl}/${ApiUrls.contractBuildingHistory(agencyId, buildingId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  // --- Room ---

  getRoomTemplate(agencyId: number, buildingId: number, roomId: number): Observable<ContractTemplateDetail> {
    return this.http.get<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractRoom(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data));
  }

  saveRoomTemplate(
    agencyId: number,
    buildingId: number,
    roomId: number,
    request: SaveContractTemplateRequest
  ): Observable<ContractTemplateDetail> {
    return this.http.put<ApiResponse<ContractTemplateDetail>>(
      `${this.apiUrl}/${ApiUrls.contractRoom(agencyId, buildingId, roomId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  resetRoomTemplate(agencyId: number, buildingId: number, roomId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(
      `${this.apiUrl}/${ApiUrls.contractRoom(agencyId, buildingId, roomId)}`
    ).pipe(map(() => void 0));
  }

  getRoomHistory(agencyId: number, buildingId: number, roomId: number): Observable<ContractTemplateHistoryEntry[]> {
    return this.http.get<ApiResponse<ContractTemplateHistoryEntry[]>>(
      `${this.apiUrl}/${ApiUrls.contractRoomHistory(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  // --- Cascade ---

  previewCascade(agencyId: number, scope: CascadeScope): Observable<ContractCascadePreview> {
    return this.http.get<ApiResponse<ContractCascadePreview>>(
      `${this.apiUrl}/${ApiUrls.contractCascadePreview(agencyId)}`,
      { params: { scope } }
    ).pipe(map((response) => response.data));
  }

  applyCascade(agencyId: number, scope: CascadeScope): Observable<ContractCascadePreview> {
    return this.http.post<ApiResponse<ContractCascadePreview>>(
      `${this.apiUrl}/${ApiUrls.contractCascade(agencyId)}`,
      {},
      { params: { scope } }
    ).pipe(map((response) => response.data));
  }

  // --- Preview ---

  /**
   * Variables are resolved server-side, always: the client has neither the data
   * nor the formatting rules, and a preview that disagreed with the real lease
   * would be worse than none.
   */
  renderPreview(agencyId: number, content: string, buildingId?: number | null): Observable<ContractPreviewResult> {
    return this.http.post<ApiResponse<ContractPreviewResult>>(
      `${this.apiUrl}/${ApiUrls.contractPreview(agencyId)}`,
      { content },
      { params: buildingId ? { buildingId } : {} }
    ).pipe(map((response) => response.data));
  }

  /**
   * The signed document, rendered server-side so the agency's copy and the
   * tenant's are the same bytes.
   *
   * Two routes for one document. The scoped one is the agency's and enforces
   * agency/building access; the unscoped one is the tenant's, authorized purely
   * by owning the lease — a tenant has no agency or building selected anywhere
   * in their app, so a scoped URL is not something they can build.
   */
  downloadLeasePdf(leaseId: number, scope?: { agencyId: number; buildingId: number } | null): Observable<Blob> {
    const url = scope
      ? ApiUrls.leaseDocumentPdf(scope.agencyId, scope.buildingId, leaseId)
      : ApiUrls.myLeaseDocumentPdf(leaseId);

    return this.http.get(`${this.apiUrl}/${url}`, { responseType: 'blob' });
  }
}
