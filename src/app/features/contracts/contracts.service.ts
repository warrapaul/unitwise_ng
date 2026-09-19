import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry, shareReplay, tap } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { ReferenceCache } from '../../core/cache/reference-cache';
import {
  CascadeScope,
  ContractCascadePreview,
  ContractEditorCatalogue,
  ContractPreviewResult,
  ContractReadiness,
  ContractTemplateDetail,
  ContractTemplateValidation,
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

  /*
   * One cache, not one per agency. The catalogue is the platform's alone now
   * that agencies cannot define variables of their own — the endpoint takes
   * an agencyId only to decide who may read it, and says so.
   */
  private readonly catalogue = new ReferenceCache<ContractEditorCatalogue>(
    () => this.fetchCatalogue(this.lastAgencyId));

  private lastAgencyId: number | null = null;

  /**
   * Variables and allowed formatting. Cached for the session: it is the same
   * for every agency and changes only when the platform deploys.
   */
  getEditorCatalogue(agencyId?: number | null): Observable<ContractEditorCatalogue> {
    this.lastAgencyId = agencyId ?? null;
    return this.catalogue.read();
  }

  private fetchCatalogue(agencyId?: number | null): Observable<ContractEditorCatalogue> {
    const params = agencyId ? new HttpParams().set('agencyId', agencyId) : undefined;

    return this.http.get<ApiResponse<ContractEditorCatalogue>>(
      `${this.apiUrl}/${ApiUrls.contractVariables}`,
      { params }
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data)
    );
  }

  /**
   * Whether this property can produce a lease as things stand, and what has
   * to be recorded first.
   *
   * Distinct from validation, which reads the wording and can only catch what
   * the wording can be wrong about. This resolves against the real agency,
   * building and room, so it catches an unset landlord ID or a building with
   * no pets policy — while it is still cheap to act on rather than at the
   * moment somebody is issuing a tenancy.
   */
  getReadiness(agencyId: number, scope?: { buildingId?: number | null; roomId?: number | null }): Observable<ContractReadiness> {
    let params = new HttpParams();
    if (scope?.buildingId) { params = params.set('buildingId', scope.buildingId); }
    if (scope?.roomId) { params = params.set('roomId', scope.roomId); }

    return this.http.get<ApiResponse<ContractReadiness>>(
      `${this.apiUrl}/${ApiUrls.contractReadiness(agencyId)}`, { params }
    ).pipe(map((response) => response.data));
  }

  // --- Validation ---

  /**
   * What is wrong with a draft, and what a person still has to type. Called on
   * save in the editor and before Generate on the lease page — the renderer
   * refuses at generation time, which is correct but far too late to act on.
   */
  validateTemplate(agencyId: number, content: string): Observable<ContractTemplateValidation> {
    return this.http.post<ApiResponse<ContractTemplateValidation>>(
      `${this.apiUrl}/${ApiUrls.contractValidate(agencyId)}`, { content }
    ).pipe(map((response) => response.data));
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
