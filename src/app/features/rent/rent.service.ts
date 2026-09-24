import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  AdjustChargeRequest,
  AdjustmentDetail,
  ArrearsReportingDetail,
  ArrearsMonthRecord,
  BuildingMonthlyReport,
  BulkAdjustmentResult,
  BulkChargeRequest,
  BulkMeterReadingResult,
  BulkWaiveRequest,
  ChargeTemplate,
  ConfirmMonthRequest,
  CreateChargeTemplateRequest,
  CreateRentPaymentRequest,
  MeterReadingRequest,
  MeterReadingSubmissionRequest,
  MonthlyPaymentRecord,
  OneOffChargeRequest,
  PortfolioOverduePayment,
  PortfolioOverdueSearchParams,
  PendingReadingTask,
  RentPaymentDetail,
  RentPaymentPreview,
  RentPaymentSearchParams,
  RentPaymentSummary,
  RentPaymentTransaction,
  RentMpesaCheckout,
  RentMpesaInitiateRequest,
  RentMpesaPaymentStatus,
  RoomPaymentStatus,
  TenantArrearsDetail,
  TenantPaymentStatus,
  TriggerAcknowledgement,
  TriggerArrearsRequest,
  UpdateChargeTemplateRequest,
  UpdateRentPaymentRequest,
  WaiveChargeRequest,
  toMonthPath
} from './models/rent.models';

/**
 * Rent collection: payments, the monthly arrears cycle, charge adjustments,
 * utility charge templates and meter readings. Landlord-side endpoints are
 * addressed by `{agencyId}/{buildingId}`; tenants read their own via `/my-*`.
 */
@Injectable({ providedIn: 'root' })
export class RentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // --- Rent payments ---

  searchPayments(params: RentPaymentSearchParams = {}): Observable<PaginatedResult<RentPaymentPreview>> {
    return this.http.get<PaginatedApiResponse<RentPaymentPreview>>(`${this.apiUrl}/${ApiUrls.rentPayments}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getMyPayments(params: RentPaymentSearchParams = {}): Observable<PaginatedResult<RentPaymentPreview>> {
    return this.http.get<PaginatedApiResponse<RentPaymentPreview>>(`${this.apiUrl}/${ApiUrls.rentPaymentsMine}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getPaymentsForUser(userId: number, params: RentPaymentSearchParams = {}): Observable<PaginatedResult<RentPaymentPreview>> {
    return this.http.get<PaginatedApiResponse<RentPaymentPreview>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentsByUser(userId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getPaymentsForBuilding(agencyId: number, buildingId: number, params: RentPaymentSearchParams = {}): Observable<PaginatedResult<RentPaymentPreview>> {
    return this.http.get<PaginatedApiResponse<RentPaymentPreview>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentsByBuilding(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getPayment(agencyId: number, buildingId: number, paymentId: number): Observable<RentPaymentDetail> {
    return this.http.get<ApiResponse<RentPaymentDetail>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentById(agencyId, buildingId, paymentId)}`
    ).pipe(map((response) => response.data));
  }

  createPayment(agencyId: number, buildingId: number, request: CreateRentPaymentRequest): Observable<RentPaymentDetail> {
    return this.http.post<ApiResponse<RentPaymentDetail>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentsByBuilding(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  updatePayment(agencyId: number, buildingId: number, paymentId: number, request: UpdateRentPaymentRequest): Observable<RentPaymentDetail> {
    return this.http.patch<ApiResponse<RentPaymentDetail>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentById(agencyId, buildingId, paymentId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deletePayment(agencyId: number, buildingId: number, paymentId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentById(agencyId, buildingId, paymentId)}`
    ).pipe(map(() => void 0));
  }

  getPaymentTransactions(agencyId: number, buildingId: number, paymentId: number): Observable<RentPaymentTransaction[]> {
    return this.http.get<ApiResponse<RentPaymentTransaction[]>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentTransactions(agencyId, buildingId, paymentId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  /** Expected-vs-paid per room for a month, before payments are recorded. */
  previewMonth(agencyId: number, buildingId: number, params: { month?: string; page?: number; size?: number } = {}): Observable<PaginatedResult<MonthlyPaymentRecord>> {
    return this.http.get<PaginatedApiResponse<MonthlyPaymentRecord>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentPreview(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getOverduePayments(agencyId: number, buildingId: number, params: RentPaymentSearchParams = {}): Observable<PaginatedResult<RentPaymentPreview>> {
    return this.http.get<PaginatedApiResponse<RentPaymentPreview>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentOverdue(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  /**
   * Cross-building worklist. The backend resolves the caller's building scope;
   * callers may only supply ordinary filters, never accessible building IDs.
   */
  getPortfolioOverduePayments(
    params: PortfolioOverdueSearchParams = {}
  ): Observable<PaginatedResult<PortfolioOverduePayment>> {
    return this.http.get<PaginatedApiResponse<PortfolioOverduePayment>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentPortfolioOverdue}`,
      { params: buildHttpParams(params) }
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getPaymentSummary(agencyId: number, buildingId: number, params: { month?: number; year?: number } = {}): Observable<RentPaymentSummary> {
    return this.http.get<ApiResponse<RentPaymentSummary>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentSummary(agencyId, buildingId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => response.data));
  }

  // --- Arrears lifecycle ---

  getArrearsStatus(agencyId: number, buildingId: number, month: string): Observable<ArrearsMonthRecord> {
    return this.http.get<ApiResponse<ArrearsMonthRecord>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsStatus(agencyId, buildingId, toMonthPath(month))}`
    ).pipe(map((response) => response.data));
  }

  generateArrears(agencyId: number, buildingId: number, request: TriggerArrearsRequest): Observable<TriggerAcknowledgement> {
    return this.http.post<ApiResponse<TriggerAcknowledgement>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsGenerate(agencyId, buildingId)}`,
      { ...request, month: toMonthPath(request.month) }
    ).pipe(map((response) => response.data));
  }

  confirmArrearsMonth(agencyId: number, buildingId: number, month: string, request: ConfirmMonthRequest): Observable<ArrearsMonthRecord> {
    return this.http.post<ApiResponse<ArrearsMonthRecord>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsConfirm(agencyId, buildingId, toMonthPath(month))}`,
      request
    ).pipe(map((response) => response.data));
  }

  getPendingReadingTasks(agencyId: number, buildingId: number, month: string): Observable<PendingReadingTask[]> {
    return this.http.get<ApiResponse<PendingReadingTask[]>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsPendingTasks(agencyId, buildingId, toMonthPath(month))}`
    ).pipe(map((response) => response.data ?? []));
  }

  // --- Arrears reporting ---

  getTenantArrears(agencyId: number, buildingId: number, tenantId: number, month: string): Observable<ArrearsReportingDetail> {
    return this.http.get<ApiResponse<ArrearsReportingDetail>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsForTenant(agencyId, buildingId, tenantId, toMonthPath(month))}`
    ).pipe(map((response) => response.data));
  }

  getRoomPaymentStatuses(agencyId: number, buildingId: number, month: string, params: { page?: number; size?: number } = {}): Observable<PaginatedResult<RoomPaymentStatus>> {
    return this.http.get<PaginatedApiResponse<RoomPaymentStatus>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsRooms(agencyId, buildingId, toMonthPath(month))}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getTenantPaymentStatuses(agencyId: number, buildingId: number, month: string, params: { page?: number; size?: number } = {}): Observable<PaginatedResult<TenantPaymentStatus>> {
    return this.http.get<PaginatedApiResponse<TenantPaymentStatus>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsTenants(agencyId, buildingId, toMonthPath(month))}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getBuildingMonthlyReport(agencyId: number, buildingId: number, month: string): Observable<BuildingMonthlyReport> {
    return this.http.get<ApiResponse<BuildingMonthlyReport>>(
      `${this.apiUrl}/${ApiUrls.rentArrearsReport(agencyId, buildingId, toMonthPath(month))}`
    ).pipe(map((response) => response.data));
  }

  /** The signed-in tenant's own arrears. */
  getMyCurrentArrears(): Observable<TenantArrearsDetail> {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return this.http.get<ApiResponse<TenantArrearsDetail>>(`${this.apiUrl}/${ApiUrls.myArrearsForMonth(month)}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data)
    );
  }

  getMyArrearsForMonth(month: string): Observable<TenantArrearsDetail> {
    return this.http.get<ApiResponse<TenantArrearsDetail>>(
      `${this.apiUrl}/${ApiUrls.myArrearsForMonth(toMonthPath(month))}`
    ).pipe(map((response) => response.data));
  }

  /** Tenant self-service M-Pesa payment. The backend resolves tenant and phone from the session. */
  initiateMyMpesaPayment(request: RentMpesaInitiateRequest = {}): Observable<RentMpesaCheckout> {
    return this.http.post<ApiResponse<RentMpesaCheckout>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentMpesaInitiate}`,
      request.month || request.amount !== null && request.amount !== undefined
        ? { ...request, month: request.month ? toMonthPath(request.month) : null }
        : {}
    ).pipe(map((response) => response.data));
  }

  getMyMpesaPaymentStatus(checkoutRequestId: string): Observable<RentMpesaPaymentStatus> {
    return this.http.get<ApiResponse<RentMpesaPaymentStatus>>(
      `${this.apiUrl}/${ApiUrls.rentPaymentMpesaStatus(checkoutRequestId)}`
    ).pipe(map((response) => response.data));
  }

  // --- Charge adjustments ---

  addOneOffCharge(agencyId: number, buildingId: number, request: OneOffChargeRequest): Observable<AdjustmentDetail> {
    return this.http.post<ApiResponse<AdjustmentDetail>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentOneOff(agencyId, buildingId)}`,
      { ...request, billedMonth: toMonthPath(request.billedMonth) }
    ).pipe(map((response) => response.data));
  }

  waiveCharge(agencyId: number, buildingId: number, request: WaiveChargeRequest): Observable<AdjustmentDetail> {
    return this.http.post<ApiResponse<AdjustmentDetail>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentWaive(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  adjustCharge(agencyId: number, buildingId: number, request: AdjustChargeRequest): Observable<AdjustmentDetail> {
    return this.http.patch<ApiResponse<AdjustmentDetail>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentAdjust(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  bulkCharge(agencyId: number, buildingId: number, request: BulkChargeRequest): Observable<BulkAdjustmentResult> {
    return this.http.post<ApiResponse<BulkAdjustmentResult>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentBulkCharge(agencyId, buildingId)}`,
      { ...request, billedMonth: toMonthPath(request.billedMonth) }
    ).pipe(map((response) => response.data));
  }

  bulkWaive(agencyId: number, buildingId: number, request: BulkWaiveRequest): Observable<BulkAdjustmentResult> {
    return this.http.post<ApiResponse<BulkAdjustmentResult>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentBulkWaive(agencyId, buildingId)}`,
      { ...request, billedMonth: toMonthPath(request.billedMonth) }
    ).pipe(map((response) => response.data));
  }

  getChargeAdjustmentHistory(agencyId: number, buildingId: number, chargeId: number): Observable<AdjustmentDetail[]> {
    return this.http.get<ApiResponse<AdjustmentDetail[]>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentChargeHistory(agencyId, buildingId, chargeId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  getMonthAdjustmentHistory(agencyId: number, buildingId: number, month: string): Observable<AdjustmentDetail[]> {
    return this.http.get<ApiResponse<AdjustmentDetail[]>>(
      `${this.apiUrl}/${ApiUrls.rentAdjustmentMonthHistory(agencyId, buildingId, toMonthPath(month))}`
    ).pipe(map((response) => response.data ?? []));
  }

  // --- Charge templates ---

  getChargeTemplates(agencyId: number, buildingId: number): Observable<ChargeTemplate[]> {
    return this.http.get<ApiResponse<ChargeTemplate[]>>(
      `${this.apiUrl}/${ApiUrls.rentChargeTemplates(agencyId, buildingId)}`
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  getChargeTemplatesForRoom(agencyId: number, buildingId: number, roomId: number): Observable<ChargeTemplate[]> {
    return this.http.get<ApiResponse<ChargeTemplate[]>>(
      `${this.apiUrl}/${ApiUrls.rentChargeTemplatesByRoom(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  createChargeTemplate(agencyId: number, buildingId: number, request: CreateChargeTemplateRequest): Observable<ChargeTemplate> {
    return this.http.post<ApiResponse<ChargeTemplate>>(
      `${this.apiUrl}/${ApiUrls.rentChargeTemplates(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  createTenantChargeTemplate(agencyId: number, buildingId: number, tenantId: number, request: CreateChargeTemplateRequest): Observable<ChargeTemplate> {
    return this.http.post<ApiResponse<ChargeTemplate>>(
      `${this.apiUrl}/${ApiUrls.rentChargeTemplatesForTenant(agencyId, buildingId, tenantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  updateChargeTemplate(agencyId: number, buildingId: number, templateId: number, request: UpdateChargeTemplateRequest): Observable<ChargeTemplate> {
    return this.http.patch<ApiResponse<ChargeTemplate>>(
      `${this.apiUrl}/${ApiUrls.rentChargeTemplateById(agencyId, buildingId, templateId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  // --- Meter readings ---

  submitMeterReadings(agencyId: number, buildingId: number, request: MeterReadingSubmissionRequest): Observable<BulkMeterReadingResult> {
    return this.http.patch<ApiResponse<BulkMeterReadingResult>>(
      `${this.apiUrl}/${ApiUrls.rentMeterReadings(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }
}
