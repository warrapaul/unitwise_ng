import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { RenterProfileDetail, RenterProfileUpsertRequest } from '../users/models/renter-profile.models';
import {
  AddExistingUserRequest,
  ProceedWithoutAcceptanceRequest,
  AmendmentSearchParams,
  CreateAmendmentRequest,
  CreateRoomApplicationRequest,
  CreateTenantMessageRequest,
  CreateTenantRequest,
  DocumentType,
  GenerateLeaseRequest,
  LandlordUpdateTenantRequest,
  LeaseAmendmentDetail,
  LeaseAmendmentPreview,
  LeaseDetail,
  LeasePreview,
  LeaseSearchParams,
  RenewLeaseRequest,
  RoomApplicationDecisionRequest,
  RoomApplicationDetail,
  RoomApplicationPreview,
  RoomApplicationSearchParams,
  TenantDetail,
  TenantDocumentDetail,
  TenantDocumentPreview,
  TenantDocumentSearchParams,
  TenantFullDetail,
  TenantMessageDetail,
  TenantMessagePreview,
  TenantMessageSearchParams,
  TenantPreview,
  TenantSearchParams,
  UpdateAmendmentRequest,
  UpdateTenantDocumentRequest,
  UpdateTenantMessageRequest,
  VerificationSnapshotDetail,
  VerificationSnapshotPreview,
  VerificationSnapshotSearchParams,
  ReviseVerificationRequest,
  ReviseVerificationResult,
  VerifyAndAssignRequest,
  VerifyAndGenerateLeaseRequest,
  VerifyAndLeaseResponse
} from './models/tenant.models';

/**
 * Tenants and everything that hangs off them: documents, leases, amendments,
 * room applications, messages and verification snapshots. Landlord-side reads
 * are addressed by `{agencyId}/{buildingId}` so the backend can resolve
 * agency-scoped permissions from the path; tenant-side reads use `/my-*`.
 */
@Injectable({ providedIn: 'root' })
export class TenantsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // --- Tenants ---

  searchTenants(params: TenantSearchParams = {}): Observable<PaginatedResult<TenantPreview>> {
    return this.http.get<PaginatedApiResponse<TenantPreview>>(`${this.apiUrl}/${ApiUrls.tenants}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getTenantsForBuilding(agencyId: number, buildingId: number, params: TenantSearchParams = {}): Observable<PaginatedResult<TenantPreview>> {
    return this.http.get<PaginatedApiResponse<TenantPreview>>(
      `${this.apiUrl}/${ApiUrls.tenantsByBuilding(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getActiveTenantsForBuilding(agencyId: number, buildingId: number, params: TenantSearchParams = {}): Observable<PaginatedResult<TenantPreview>> {
    return this.http.get<PaginatedApiResponse<TenantPreview>>(
      `${this.apiUrl}/${ApiUrls.tenantsActiveByBuilding(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getTenantsForRoom(agencyId: number, buildingId: number, roomId: number): Observable<TenantPreview[]> {
    return this.http.get<ApiResponse<TenantPreview[]>>(
      `${this.apiUrl}/${ApiUrls.tenantsByRoom(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  getTenantsForAgency(agencyId: number, params: TenantSearchParams = {}): Observable<PaginatedResult<TenantPreview>> {
    return this.http.get<PaginatedApiResponse<TenantPreview>>(
      `${this.apiUrl}/${ApiUrls.tenantsByAgency(agencyId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getTenantsForUser(userId: number): Observable<TenantPreview[]> {
    return this.http.get<ApiResponse<TenantPreview[]>>(`${this.apiUrl}/${ApiUrls.tenantsByUser(userId)}`).pipe(
      map((response) => response.data ?? [])
    );
  }

  /**
   * Every tenancy behind a uid that the caller is allowed to see.
   *
   * A person can rent from several landlords, so this is a list, and the
   * backend scopes it to the agencies you administer — an empty result means
   * "none you may see", which reads the same as "none at all" on purpose.
   * Distinguishing them would turn the endpoint into a probe for whether
   * somebody rents somewhere else.
   */
  findTenanciesByUid(userUid: string): Observable<TenantDetail[]> {
    return this.http.get<ApiResponse<TenantDetail[]>>(`${this.apiUrl}/${ApiUrls.tenantSearchByUid}`, {
      params: buildHttpParams({ userUid })
    }).pipe(map((response) => response.data ?? []));
  }

  /**
   * Add somebody who already has an account as a tenant of this agency.
   *
   * Creates a separate tenancy their other landlords cannot see, awaiting
   * their acceptance rather than the landlord's verification.
   */
  addExistingUserAsTenant(
    agencyId: number,
    buildingId: number,
    request: AddExistingUserRequest
  ): Observable<TenantDetail> {
    return this.http.post<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantAddExistingUser(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /**
   * Stop waiting for a tenant who never answered.
   *
   * Switches the tenancy to fully-managed and moves it into the landlord's
   * queue. It grants no access to the person's own documents — the landlord
   * collects and uploads their own copies, so skipping the wait buys more
   * work, not more reach.
   */
  proceedWithoutTenantAcceptance(
    agencyId: number,
    buildingId: number,
    tenantId: number,
    request: ProceedWithoutAcceptanceRequest
  ): Observable<TenantDetail> {
    return this.http.patch<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantProceedUnaccepted(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /** The tenant's side: acknowledge a tenancy a landlord created for them. */
  acceptTenancy(tenantId: number): Observable<TenantDetail> {
    return this.http.patch<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenancyAccept(tenantId)}`, {}
    ).pipe(map((response) => response.data));
  }

  declineTenancy(tenantId: number): Observable<TenantDetail> {
    return this.http.patch<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenancyDecline(tenantId)}`, {}
    ).pipe(map((response) => response.data));
  }

  /**
   * The signed-in user's own tenancies.
   *
   * A **list**: one person can rent from several landlords, and the endpoint
   * has always returned an array. It was typed here as a single record, so
   * anything reading `.firstName` off it was reading a property of an array
   * and getting undefined.
   */
  getMyTenantProfiles(): Observable<TenantPreview[]> {
    return this.http.get<ApiResponse<TenantPreview[]>>(`${this.apiUrl}/${ApiUrls.tenantProfile}`).pipe(
      map((response) => response.data ?? [])
    );
  }

  getTenant(agencyId: number, buildingId: number, tenantId: number): Observable<TenantDetail> {
    return this.http.get<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantById(agencyId, buildingId, tenantId)}`
    ).pipe(map((response) => response.data));
  }

  getTenantFull(agencyId: number, buildingId: number, tenantId: number): Observable<TenantFullDetail> {
    return this.http.get<ApiResponse<TenantFullDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantFullById(agencyId, buildingId, tenantId)}`
    ).pipe(map((response) => response.data));
  }

  /**
   * Set up the caller's renter profile and switch their tenant module on.
   *
   * Despite the route name this creates **no tenancy** — a tenancy is a
   * landlord's record of somebody in their room, so only a landlord creates
   * one, against a room, after finding the person by uid. Refused if they
   * already have a profile; edit it through the renter-profile endpoint.
   */
  setUpMyRenterProfile(request: RenterProfileUpsertRequest): Observable<RenterProfileDetail> {
    return this.http.post<ApiResponse<RenterProfileDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantSelfRegister}`, request
    ).pipe(map((response) => response.data));
  }

  createTenantForBuilding(agencyId: number, buildingId: number, request: CreateTenantRequest): Observable<TenantDetail> {
    return this.http.post<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantsByBuilding(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }


  landlordUpdateTenant(agencyId: number, buildingId: number, tenantId: number, request: LandlordUpdateTenantRequest): Observable<TenantDetail> {
    return this.http.patch<ApiResponse<TenantDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantLandlordUpdate(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteTenant(agencyId: number, buildingId: number, tenantId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.tenantById(agencyId, buildingId, tenantId)}`
    ).pipe(map(() => void 0));
  }

  // --- Tenant documents ---

  searchTenantDocuments(params: TenantDocumentSearchParams = {}): Observable<PaginatedResult<TenantDocumentPreview>> {
    return this.http.get<PaginatedApiResponse<TenantDocumentPreview>>(`${this.apiUrl}/${ApiUrls.tenantDocuments}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getMyDocuments(params: TenantDocumentSearchParams = {}): Observable<PaginatedResult<TenantDocumentPreview>> {
    return this.http.get<PaginatedApiResponse<TenantDocumentPreview>>(`${this.apiUrl}/${ApiUrls.tenantDocumentsMine}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  /**
   * Documents filed against one tenancy.
   *
   * Paginated server-side. It was typed as a bare array, which happens to
   * read correctly — `data` is the array in both envelopes — but silently
   * ignored paging, so a tenancy with more than a page of documents showed
   * only the first and gave no sign there were more.
   */
  getDocumentsForTenant(
    agencyId: number,
    buildingId: number,
    tenantId: number,
    params: Record<string, unknown> = {}
  ): Observable<PaginatedResult<TenantDocumentPreview>> {
    return this.http.get<PaginatedApiResponse<TenantDocumentPreview>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentsByTenant(agencyId, buildingId, tenantId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data ?? [], pagination: response.pagination })));
  }

  getCurrentDocumentByType(agencyId: number, buildingId: number, tenantId: number, documentType: DocumentType): Observable<TenantDocumentDetail | null> {
    return this.http.get<ApiResponse<TenantDocumentDetail | null>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentCurrentByType(agencyId, buildingId, tenantId, documentType)}`
    ).pipe(map((response) => response.data ?? null));
  }

  getDocument(documentId: number): Observable<TenantDocumentDetail> {
    return this.http.get<ApiResponse<TenantDocumentDetail>>(`${this.apiUrl}/${ApiUrls.tenantDocumentById(documentId)}`).pipe(
      map((response) => response.data)
    );
  }

  getDocumentVersions(documentId: number): Observable<TenantDocumentPreview[]> {
    return this.http.get<ApiResponse<TenantDocumentPreview[]>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentVersions(documentId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  /**
   * Add a document to the signed-in person's own library.
   *
   * No tenancy: the document belongs to them, is versioned against them, and
   * is visible to no agency until they approve a grant. It lands as `DRAFT`
   * for that reason — putting a file in your own library is not submitting
   * it to anyone.
   *
   * Re-uploading the same `documentType` supersedes the previous one rather
   * than making a parallel copy, so a renewed ID replaces the one ID they
   * have, for every landlord at once.
   */
  uploadMyDocument(file: File, documentType: DocumentType): Observable<TenantDocumentDetail> {
    return this.http.post<ApiResponse<TenantDocumentDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentsMine}`,
      this.toDocumentFormData(file, documentType)
    ).pipe(map((response) => response.data));
  }

  landlordUploadDocument(
    agencyId: number,
    buildingId: number,
    tenantId: number,
    file: File,
    documentType: DocumentType
  ): Observable<TenantDocumentDetail> {
    return this.http.post<ApiResponse<TenantDocumentDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentLandlordUpload(agencyId, buildingId, tenantId)}`,
      this.toDocumentFormData(file, documentType)
    ).pipe(map((response) => response.data));
  }

  /** Metadata-only update — status, type or rejection reason. */
  updateDocument(documentId: number, request: UpdateTenantDocumentRequest): Observable<TenantDocumentDetail> {
    return this.http.patch<ApiResponse<TenantDocumentDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentById(documentId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /** Same URL as `updateDocument`, but multipart — replaces the file with a new version. */
  replaceDocumentFile(documentId: number, file: File, documentType?: DocumentType): Observable<TenantDocumentDetail> {
    return this.http.patch<ApiResponse<TenantDocumentDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantDocumentById(documentId)}`,
      this.toDocumentFormData(file, documentType)
    ).pipe(map((response) => response.data));
  }

  deleteDocument(documentId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.tenantDocumentById(documentId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Lease agreements ---

  searchLeases(params: LeaseSearchParams = {}): Observable<PaginatedResult<LeasePreview>> {
    return this.http.get<PaginatedApiResponse<LeasePreview>>(`${this.apiUrl}/${ApiUrls.leaseAgreements}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getMyLeases(params: LeaseSearchParams = {}): Observable<PaginatedResult<LeasePreview>> {
    return this.http.get<PaginatedApiResponse<LeasePreview>>(`${this.apiUrl}/${ApiUrls.leasesMine}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getLeasesForTenant(agencyId: number, buildingId: number, tenantId: number, params: LeaseSearchParams = {}): Observable<PaginatedResult<LeasePreview>> {
    return this.http.get<PaginatedApiResponse<LeasePreview>>(
      `${this.apiUrl}/${ApiUrls.leasesByTenant(agencyId, buildingId, tenantId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getLeasesForRoom(agencyId: number, buildingId: number, roomId: number, params: LeaseSearchParams = {}): Observable<PaginatedResult<LeasePreview>> {
    return this.http.get<PaginatedApiResponse<LeasePreview>>(
      `${this.apiUrl}/${ApiUrls.leasesByRoom(agencyId, buildingId, roomId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getLeasesForBuilding(agencyId: number, buildingId: number, params: LeaseSearchParams = {}): Observable<PaginatedResult<LeasePreview>> {
    return this.http.get<PaginatedApiResponse<LeasePreview>>(
      `${this.apiUrl}/${ApiUrls.leasesByBuilding(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getLease(leaseId: number): Observable<LeaseDetail> {
    return this.http.get<ApiResponse<LeaseDetail>>(`${this.apiUrl}/${ApiUrls.leaseAgreementById(leaseId)}`).pipe(
      map((response) => response.data)
    );
  }

  generateLease(agencyId: number, buildingId: number, tenantId: number, request: GenerateLeaseRequest): Observable<LeaseDetail> {
    return this.http.post<ApiResponse<LeaseDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseGenerate(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /**
   * Verification and lease generation as one transaction, so an approval never
   * half-lands. Approval only — the backend refuses a rejection here, which
   * belongs to `verifyAndAssign`.
   */
  verifyAndGenerateLease(
    agencyId: number,
    buildingId: number,
    tenantId: number,
    request: VerifyAndGenerateLeaseRequest
  ): Observable<VerifyAndLeaseResponse> {
    return this.http.post<ApiResponse<VerifyAndLeaseResponse>>(
      `${this.apiUrl}/${ApiUrls.leaseVerifyAndGenerate(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  activateLease(agencyId: number, buildingId: number, leaseId: number): Observable<LeaseDetail> {
    return this.http.post<ApiResponse<LeaseDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseActivate(agencyId, buildingId, leaseId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  /**
   * Re-renders a draft's contract now that more values are known — the step
   * between the tenant submitting their form and the lease going out for
   * signature.
   *
   * Stricter than generation: the first render tolerates missing tenant values
   * because nobody has been asked for them yet, and this one refuses, because
   * by now somebody has. Only while the lease is still DRAFT or awaiting
   * signature; the document is fixed after that.
   */
  refreshLeaseContract(leaseId: number): Observable<LeaseDetail> {
    return this.http.post<ApiResponse<LeaseDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseRefreshContract(leaseId)}`, {}
    ).pipe(map((response) => response.data));
  }

  /**
   * The tenant refuses the version in force, with a reason.
   *
   * The counterpart to signing, and the reason it exists: a tenant who read an
   * amended contract and objected used to be indistinguishable from one who
   * had not opened it — both left the lease waiting, and only the landlord
   * could act on that.
   */
  tenantDeclineLease(leaseId: number, reason: string): Observable<LeaseDetail> {
    return this.http.post<ApiResponse<LeaseDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseTenantDecline(leaseId)}`, { reason }
    ).pipe(map((response) => response.data));
  }

  tenantSignLease(leaseId: number): Observable<LeaseDetail> {
    return this.http.post<ApiResponse<LeaseDetail>>(`${this.apiUrl}/${ApiUrls.leaseTenantSign(leaseId)}`, {}).pipe(
      map((response) => response.data)
    );
  }

  renewLease(leaseId: number, request: RenewLeaseRequest): Observable<LeaseDetail> {
    return this.http.post<ApiResponse<LeaseDetail>>(`${this.apiUrl}/${ApiUrls.leaseRenew(leaseId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteLease(leaseId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.leaseAgreementById(leaseId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Lease amendments ---

  searchAmendments(params: AmendmentSearchParams = {}): Observable<PaginatedResult<LeaseAmendmentPreview>> {
    return this.http.get<PaginatedApiResponse<LeaseAmendmentPreview>>(`${this.apiUrl}/${ApiUrls.leaseAmendments}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getAmendmentsForLease(leaseAgreementId: number, params: AmendmentSearchParams = {}): Observable<PaginatedResult<LeaseAmendmentPreview>> {
    return this.http.get<PaginatedApiResponse<LeaseAmendmentPreview>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentsByLease(leaseAgreementId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getAmendmentsForTenant(tenantId: number, params: AmendmentSearchParams = {}): Observable<PaginatedResult<LeaseAmendmentPreview>> {
    return this.http.get<PaginatedApiResponse<LeaseAmendmentPreview>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentsByTenant(tenantId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getAmendmentsByStatus(status: string, params: AmendmentSearchParams = {}): Observable<PaginatedResult<LeaseAmendmentPreview>> {
    return this.http.get<PaginatedApiResponse<LeaseAmendmentPreview>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentsByStatus(status)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getAmendment(amendmentId: number): Observable<LeaseAmendmentDetail> {
    return this.http.get<ApiResponse<LeaseAmendmentDetail>>(`${this.apiUrl}/${ApiUrls.leaseAmendmentById(amendmentId)}`).pipe(
      map((response) => response.data)
    );
  }

  createAmendment(request: CreateAmendmentRequest): Observable<LeaseAmendmentDetail> {
    return this.http.post<ApiResponse<LeaseAmendmentDetail>>(`${this.apiUrl}/${ApiUrls.leaseAmendments}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateAmendment(amendmentId: number, request: UpdateAmendmentRequest): Observable<LeaseAmendmentDetail> {
    return this.http.put<ApiResponse<LeaseAmendmentDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentById(amendmentId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  // --- Amendment lifecycle ---
  //
  // An amendment alters terms both parties agreed to, so it moves by both
  // parties' hands. The landlord drafts, submits and — once accepted —
  // applies; the tenant accepts or refuses. None of these had a route before,
  // and the service allowed DRAFT straight to ACTIVE, so what the API offered
  // was a landlord changing a tenancy's rent by themselves.

  /** Landlord: send the proposal to the tenant. It stops being editable. */
  submitAmendment(amendmentId: number): Observable<LeaseAmendmentDetail> {
    return this.http.post<ApiResponse<LeaseAmendmentDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentSubmit(amendmentId)}`, {}
    ).pipe(map((response) => response.data));
  }

  /**
   * Landlord: pull a proposal back before the tenant answers.
   *
   * The way out of a mistaken proposal that is not asking the tenant to reject
   * it, which would put a refusal on the tenant's record for the landlord's
   * error.
   */
  withdrawAmendment(amendmentId: number, reason?: string | null): Observable<LeaseAmendmentDetail> {
    return this.http.post<ApiResponse<LeaseAmendmentDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentWithdraw(amendmentId)}`, { reason: reason || null }
    ).pipe(map((response) => response.data));
  }

  /** Tenant: accept the proposed change. */
  acceptAmendment(amendmentId: number): Observable<LeaseAmendmentDetail> {
    return this.http.post<ApiResponse<LeaseAmendmentDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentAccept(amendmentId)}`, {}
    ).pipe(map((response) => response.data));
  }

  /** Tenant: refuse the proposed change, with a reason the landlord can act on. */
  rejectAmendment(amendmentId: number, reason: string): Observable<LeaseAmendmentDetail> {
    return this.http.post<ApiResponse<LeaseAmendmentDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentReject(amendmentId)}`, { reason }
    ).pipe(map((response) => response.data));
  }

  /** Landlord: apply an accepted amendment, which reissues the contract. */
  activateAmendment(amendmentId: number): Observable<LeaseAmendmentDetail> {
    return this.http.post<ApiResponse<LeaseAmendmentDetail>>(
      `${this.apiUrl}/${ApiUrls.leaseAmendmentActivate(amendmentId)}`, {}
    ).pipe(map((response) => response.data));
  }

  deleteAmendment(amendmentId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.leaseAmendmentById(amendmentId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Room applications ---

  searchRoomApplications(params: RoomApplicationSearchParams = {}): Observable<PaginatedResult<RoomApplicationPreview>> {
    return this.http.get<PaginatedApiResponse<RoomApplicationPreview>>(`${this.apiUrl}/${ApiUrls.roomApplications}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getMyApplications(params: RoomApplicationSearchParams = {}): Observable<PaginatedResult<RoomApplicationPreview>> {
    return this.http.get<PaginatedApiResponse<RoomApplicationPreview>>(`${this.apiUrl}/${ApiUrls.roomApplicationsMine}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getApplicationsForBuilding(agencyId: number, buildingId: number, params: RoomApplicationSearchParams = {}): Observable<PaginatedResult<RoomApplicationPreview>> {
    return this.http.get<PaginatedApiResponse<RoomApplicationPreview>>(
      `${this.apiUrl}/${ApiUrls.roomApplicationsByBuilding(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getApplicationsForRoom(agencyId: number, buildingId: number, roomId: number, params: RoomApplicationSearchParams = {}): Observable<PaginatedResult<RoomApplicationPreview>> {
    return this.http.get<PaginatedApiResponse<RoomApplicationPreview>>(
      `${this.apiUrl}/${ApiUrls.roomApplicationsByRoom(agencyId, buildingId, roomId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getApplication(applicationId: number): Observable<RoomApplicationDetail> {
    return this.http.get<ApiResponse<RoomApplicationDetail>>(
      `${this.apiUrl}/${ApiUrls.roomApplicationById(applicationId)}`
    ).pipe(map((response) => response.data));
  }

  createApplication(request: CreateRoomApplicationRequest): Observable<RoomApplicationDetail> {
    return this.http.post<ApiResponse<RoomApplicationDetail>>(`${this.apiUrl}/${ApiUrls.roomApplications}`, request).pipe(
      map((response) => response.data)
    );
  }

  withdrawApplication(applicationId: number): Observable<RoomApplicationDetail> {
    return this.http.patch<ApiResponse<RoomApplicationDetail>>(
      `${this.apiUrl}/${ApiUrls.roomApplicationWithdraw(applicationId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  decideApplication(agencyId: number, buildingId: number, applicationId: number, request: RoomApplicationDecisionRequest): Observable<RoomApplicationDetail> {
    return this.http.post<ApiResponse<RoomApplicationDetail>>(
      `${this.apiUrl}/${ApiUrls.roomApplicationDecision(agencyId, buildingId, applicationId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  // --- Tenant messages ---

  searchMessages(params: TenantMessageSearchParams = {}): Observable<PaginatedResult<TenantMessagePreview>> {
    return this.http.get<PaginatedApiResponse<TenantMessagePreview>>(`${this.apiUrl}/${ApiUrls.tenantMessages}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getMyMessages(params: TenantMessageSearchParams = {}): Observable<PaginatedResult<TenantMessagePreview>> {
    return this.http.get<PaginatedApiResponse<TenantMessagePreview>>(`${this.apiUrl}/${ApiUrls.tenantMessagesMine}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getMessagesForTenant(tenantId: number, params: TenantMessageSearchParams = {}): Observable<PaginatedResult<TenantMessagePreview>> {
    return this.http.get<PaginatedApiResponse<TenantMessagePreview>>(
      `${this.apiUrl}/${ApiUrls.tenantMessagesByTenant(tenantId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getMessagesForBuilding(buildingId: number, params: TenantMessageSearchParams = {}): Observable<PaginatedResult<TenantMessagePreview>> {
    return this.http.get<PaginatedApiResponse<TenantMessagePreview>>(
      `${this.apiUrl}/${ApiUrls.tenantMessagesByBuilding(buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getMessagesByStatus(status: string, params: TenantMessageSearchParams = {}): Observable<PaginatedResult<TenantMessagePreview>> {
    return this.http.get<PaginatedApiResponse<TenantMessagePreview>>(
      `${this.apiUrl}/${ApiUrls.tenantMessagesByStatus(status)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getMessagesByType(type: string, params: TenantMessageSearchParams = {}): Observable<PaginatedResult<TenantMessagePreview>> {
    return this.http.get<PaginatedApiResponse<TenantMessagePreview>>(
      `${this.apiUrl}/${ApiUrls.tenantMessagesByType(type)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getMessage(messageId: number): Observable<TenantMessageDetail> {
    return this.http.get<ApiResponse<TenantMessageDetail>>(`${this.apiUrl}/${ApiUrls.tenantMessageById(messageId)}`).pipe(
      map((response) => response.data)
    );
  }

  createMessage(request: CreateTenantMessageRequest): Observable<TenantMessageDetail> {
    return this.http.post<ApiResponse<TenantMessageDetail>>(`${this.apiUrl}/${ApiUrls.tenantMessages}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateMessage(messageId: number, request: UpdateTenantMessageRequest): Observable<TenantMessageDetail> {
    return this.http.put<ApiResponse<TenantMessageDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantMessageById(messageId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  updateMessageStatus(messageId: number, status: string): Observable<TenantMessageDetail> {
    return this.http.patch<ApiResponse<TenantMessageDetail>>(
      `${this.apiUrl}/${ApiUrls.tenantMessageStatus(messageId)}`,
      {},
      { params: buildHttpParams({ status }) }
    ).pipe(map((response) => response.data));
  }

  deleteMessage(messageId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.tenantMessageById(messageId)}`).pipe(
      map(() => void 0)
    );
  }

  getNewMessageCount(tenantId: number): Observable<number> {
    return this.http.get<ApiResponse<number>>(`${this.apiUrl}/${ApiUrls.tenantMessageNewCount(tenantId)}`).pipe(
      map((response) => response.data ?? 0)
    );
  }

  getUnresolvedMessageCount(): Observable<number> {
    return this.http.get<ApiResponse<number>>(`${this.apiUrl}/${ApiUrls.tenantMessageUnresolvedCount}`).pipe(
      map((response) => response.data ?? 0)
    );
  }

  // --- Verification snapshots ---

  searchSnapshots(params: VerificationSnapshotSearchParams = {}): Observable<PaginatedResult<VerificationSnapshotPreview>> {
    return this.http.get<PaginatedApiResponse<VerificationSnapshotPreview>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshots}`,
      { params: buildHttpParams(params) }
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getCurrentSnapshots(params: VerificationSnapshotSearchParams = {}): Observable<PaginatedResult<VerificationSnapshotPreview>> {
    return this.http.get<PaginatedApiResponse<VerificationSnapshotPreview>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotsCurrent}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getSnapshotsByType(snapshotType: string, params: VerificationSnapshotSearchParams = {}): Observable<PaginatedResult<VerificationSnapshotPreview>> {
    return this.http.get<PaginatedApiResponse<VerificationSnapshotPreview>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotsByType(snapshotType)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getSnapshotsForTenant(agencyId: number, buildingId: number, tenantId: number, params: VerificationSnapshotSearchParams = {}): Observable<PaginatedResult<VerificationSnapshotPreview>> {
    return this.http.get<PaginatedApiResponse<VerificationSnapshotPreview>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotsByTenant(agencyId, buildingId, tenantId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getCurrentSnapshotForTenant(agencyId: number, buildingId: number, tenantId: number): Observable<VerificationSnapshotDetail | null> {
    return this.http.get<ApiResponse<VerificationSnapshotDetail | null>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotCurrentForTenant(agencyId, buildingId, tenantId)}`
    ).pipe(map((response) => response.data ?? null));
  }

  getSnapshot(agencyId: number, buildingId: number, tenantId: number, snapshotId: number): Observable<VerificationSnapshotDetail> {
    return this.http.get<ApiResponse<VerificationSnapshotDetail>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotById(agencyId, buildingId, tenantId, snapshotId)}`
    ).pipe(map((response) => response.data));
  }

  /** Verifies the tenant, snapshots their identity documents and optionally assigns a room. */
  verifyAndAssign(agencyId: number, buildingId: number, tenantId: number, request: VerifyAndAssignRequest): Observable<VerificationSnapshotDetail> {
    return this.http.post<ApiResponse<VerificationSnapshotDetail>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotVerify(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /**
   * Re-verify a tenant whose record has changed, and reissue their contract.
   *
   * The path that did not exist: re-running verification on a live tenancy
   * would have failed on an occupied room, and had it not, it would have put
   * the room back to RESERVED and the tenancy back to VERIFIED — taking a
   * sitting tenant out of their own home on paper.
   *
   * This supersedes the current snapshot, carries the approved documents
   * forward at the version they were checked on, leaves room and tenancy
   * status alone, and reissues the contract for signature.
   */
  reviseVerification(
    agencyId: number,
    buildingId: number,
    tenantId: number,
    request: ReviseVerificationRequest
  ): Observable<ReviseVerificationResult> {
    return this.http.post<ApiResponse<ReviseVerificationResult>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotRevise(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteSnapshot(agencyId: number, buildingId: number, tenantId: number, snapshotId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotById(agencyId, buildingId, tenantId, snapshotId)}`
    ).pipe(map(() => void 0));
  }

  setSnapshotIpfsCid(agencyId: number, buildingId: number, tenantId: number, snapshotId: number, ipfsCid: string): Observable<VerificationSnapshotDetail> {
    return this.http.put<ApiResponse<VerificationSnapshotDetail>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotIpfsCid(agencyId, buildingId, tenantId, snapshotId)}`,
      {},
      { params: buildHttpParams({ ipfsCid }) }
    ).pipe(map((response) => response.data));
  }

  markSnapshotNotCurrent(agencyId: number, buildingId: number, tenantId: number, snapshotId: number): Observable<VerificationSnapshotDetail> {
    return this.http.put<ApiResponse<VerificationSnapshotDetail>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotMarkNotCurrent(agencyId, buildingId, tenantId, snapshotId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  verifySnapshotIntegrity(agencyId: number, buildingId: number, tenantId: number, snapshotId: number): Observable<boolean> {
    return this.http.get<ApiResponse<boolean>>(
      `${this.apiUrl}/${ApiUrls.verificationSnapshotVerifyIntegrity(agencyId, buildingId, tenantId, snapshotId)}`
    ).pipe(map((response) => response.data));
  }

  private toDocumentFormData(file: File, documentType?: DocumentType): FormData {
    const formData = new FormData();
    formData.append('file', file);
    if (documentType) {
      formData.append('documentType', documentType);
    }

    return formData;
  }
}
