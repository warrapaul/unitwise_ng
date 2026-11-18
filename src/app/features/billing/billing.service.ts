import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse } from '../../core/models/api-response.model';
import { API_URL } from '../../core/tokens/api-url.token';
import {
  BillingCatalog,
  BillingInvoice,
  BillingPayment,
  BillingPlan,
  BillingPlanRequest,
  BillingSummary,
  EntitlementOverride,
  GenerateResult,
  PaymentReport,
  PlanRequest,
  ReportPaymentRequest,
  ReportStatus,
  PlanRequestStatus,
  PlanOption,
  BillingOverview,
  PendingCounts,
  PlanHistoryEntry,
  OverrideRequest,
  PayResponse,
  RecordPaymentRequest,
  Subscription,
  SubscriptionUpdateRequest
} from './billing.models';

/** The platform's billing: plans, each agency's subscription, invoices and payments. */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private url(path: string): string {
    return `${this.apiUrl}/${path}`;
  }

  private agency(agencyId: number, rest = ''): string {
    return this.url(`${ApiUrls.agencyBilling(agencyId)}${rest}`);
  }

  // Plans (super admin; the list is also readable by agencies, public plans only)
  plans(): Observable<BillingPlan[]> {
    return this.http.get<ApiResponse<BillingPlan[]>>(this.url(ApiUrls.billingPlans)).pipe(map((r) => r.data ?? []));
  }

  plan(id: number): Observable<BillingPlan> {
    return this.http.get<ApiResponse<BillingPlan>>(this.url(ApiUrls.billingPlan(id))).pipe(map((r) => r.data));
  }

  createPlan(request: BillingPlanRequest): Observable<BillingPlan> {
    return this.http.post<ApiResponse<BillingPlan>>(this.url(ApiUrls.billingPlans), request).pipe(map((r) => r.data));
  }

  updatePlan(id: number, request: BillingPlanRequest): Observable<BillingPlan> {
    return this.http.put<ApiResponse<BillingPlan>>(this.url(ApiUrls.billingPlan(id)), request).pipe(map((r) => r.data));
  }

  catalog(): Observable<BillingCatalog> {
    return this.http.get<ApiResponse<BillingCatalog>>(this.url(ApiUrls.billingCatalog)).pipe(map((r) => r.data));
  }

  // An agency's billing
  summary(agencyId: number): Observable<BillingSummary> {
    return this.http.get<ApiResponse<BillingSummary>>(this.agency(agencyId)).pipe(map((r) => r.data));
  }

  invoices(agencyId: number): Observable<BillingInvoice[]> {
    return this.http.get<ApiResponse<BillingInvoice[]>>(this.agency(agencyId, '/invoices')).pipe(map((r) => r.data ?? []));
  }

  invoice(agencyId: number, invoiceId: number): Observable<BillingInvoice> {
    return this.http.get<ApiResponse<BillingInvoice>>(this.agency(agencyId, `/invoices/${invoiceId}`)).pipe(map((r) => r.data));
  }

  /** The invoice as a PDF, with the file name the server gives it. */
  invoicePdf(agencyId: number, invoiceId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(this.agency(agencyId, `/invoices/${invoiceId}/pdf`), { responseType: 'blob', observe: 'response' });
  }

  payments(agencyId: number): Observable<BillingPayment[]> {
    return this.http.get<ApiResponse<BillingPayment[]>>(this.agency(agencyId, '/payments')).pipe(map((r) => r.data ?? []));
  }

  /** Sends an M-Pesa prompt for the invoice's balance, or returns paybill instructions. */
  payInvoice(agencyId: number, invoiceId: number, phoneNumber: string): Observable<PayResponse> {
    return this.http.post<ApiResponse<PayResponse>>(this.agency(agencyId, `/invoices/${invoiceId}/pay`), { phoneNumber }).pipe(map((r) => r.data));
  }

  /** Pays ahead: the money waits as credit for the next invoice. */
  prepay(agencyId: number, phoneNumber: string, amount: number): Observable<PayResponse> {
    return this.http.post<ApiResponse<PayResponse>>(this.agency(agencyId, '/prepay'), { phoneNumber, amount }).pipe(map((r) => r.data));
  }

  paymentStatus(agencyId: number, paymentId: number): Observable<BillingPayment> {
    return this.http.get<ApiResponse<BillingPayment>>(this.agency(agencyId, `/payments/${paymentId}/status`)).pipe(map((r) => r.data));
  }

  // Super admin: subscription, overrides, invoices and payments
  updateSubscription(agencyId: number, request: SubscriptionUpdateRequest): Observable<Subscription> {
    return this.http.put<ApiResponse<Subscription>>(this.agency(agencyId, '/subscription'), request).pipe(map((r) => r.data));
  }

  activate(agencyId: number, billingStartsOn: string | null, notes: string | null): Observable<Subscription> {
    return this.http.post<ApiResponse<Subscription>>(this.agency(agencyId, '/subscription/activate'), { billingStartsOn, notes }).pipe(map((r) => r.data));
  }

  extendTrial(agencyId: number, days: number, notes: string | null): Observable<Subscription> {
    return this.http.post<ApiResponse<Subscription>>(this.agency(agencyId, '/subscription/extend-trial'), { days, notes }).pipe(map((r) => r.data));
  }

  suspend(agencyId: number, reason: string): Observable<Subscription> {
    return this.http.post<ApiResponse<Subscription>>(this.agency(agencyId, '/subscription/suspend'), { reason }).pipe(map((r) => r.data));
  }

  cancel(agencyId: number, reason: string): Observable<Subscription> {
    return this.http.post<ApiResponse<Subscription>>(this.agency(agencyId, '/subscription/cancel'), { reason }).pipe(map((r) => r.data));
  }

  overrides(agencyId: number): Observable<EntitlementOverride[]> {
    return this.http.get<ApiResponse<EntitlementOverride[]>>(this.agency(agencyId, '/overrides')).pipe(map((r) => r.data ?? []));
  }

  grantOverride(agencyId: number, request: OverrideRequest): Observable<EntitlementOverride> {
    return this.http.post<ApiResponse<EntitlementOverride>>(this.agency(agencyId, '/overrides'), request).pipe(map((r) => r.data));
  }

  revokeOverride(agencyId: number, overrideId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(this.agency(agencyId, `/overrides/${overrideId}`)).pipe(map(() => undefined));
  }

  generateInvoices(agencyId: number): Observable<GenerateResult> {
    return this.http.post<ApiResponse<GenerateResult>>(this.agency(agencyId, '/invoices/generate'), {}).pipe(map((r) => r.data));
  }

  voidInvoice(agencyId: number, invoiceId: number, reason: string, reissue: boolean): Observable<BillingInvoice> {
    return this.http.post<ApiResponse<BillingInvoice>>(this.agency(agencyId, `/invoices/${invoiceId}/void`), { reason, reissue }).pipe(map((r) => r.data));
  }

  recordPayment(agencyId: number, request: RecordPaymentRequest): Observable<BillingPayment> {
    return this.http.post<ApiResponse<BillingPayment>>(this.agency(agencyId, '/payments'), request).pipe(map((r) => r.data));
  }

  reversePayment(agencyId: number, paymentId: number, reason: string): Observable<BillingPayment> {
    return this.http.post<ApiResponse<BillingPayment>>(this.agency(agencyId, `/payments/${paymentId}/reverse`), { reason }).pipe(map((r) => r.data));
  }

  // Super admin: payments that named no invoice we know
  unmatchedPayments(): Observable<BillingPayment[]> {
    return this.http.get<ApiResponse<BillingPayment[]>>(this.url(ApiUrls.billingUnmatchedPayments)).pipe(map((r) => r.data ?? []));
  }

  allocatePayment(paymentId: number, request: { invoiceId?: number | null; agencyId?: number | null; notes?: string | null }): Observable<BillingPayment> {
    return this.http.post<ApiResponse<BillingPayment>>(this.url(ApiUrls.billingAllocatePayment(paymentId)), request).pipe(map((r) => r.data));
  }

  // Agency requests: "we paid" and "move us to that plan"
  reportPayment(agencyId: number, request: ReportPaymentRequest): Observable<PaymentReport> {
    return this.http.post<ApiResponse<PaymentReport>>(this.agency(agencyId, '/payment-reports'), request).pipe(map((r) => r.data));
  }

  agencyReports(agencyId: number): Observable<PaymentReport[]> {
    return this.http.get<ApiResponse<PaymentReport[]>>(this.agency(agencyId, '/payment-reports')).pipe(map((r) => r.data ?? []));
  }

  withdrawReport(agencyId: number, reportId: number): Observable<PaymentReport> {
    return this.http.post<ApiResponse<PaymentReport>>(this.agency(agencyId, `/payment-reports/${reportId}/withdraw`), {}).pipe(map((r) => r.data));
  }

  requestPlan(agencyId: number, planId: number, note: string | null): Observable<PlanRequest> {
    return this.http.post<ApiResponse<PlanRequest>>(this.agency(agencyId, '/plan-requests'), { planId, note }).pipe(map((r) => r.data));
  }

  agencyPlanRequests(agencyId: number): Observable<PlanRequest[]> {
    return this.http.get<ApiResponse<PlanRequest[]>>(this.agency(agencyId, '/plan-requests')).pipe(map((r) => r.data ?? []));
  }

  withdrawPlanRequest(agencyId: number, requestId: number): Observable<PlanRequest> {
    return this.http.post<ApiResponse<PlanRequest>>(this.agency(agencyId, `/plan-requests/${requestId}/withdraw`), {}).pipe(map((r) => r.data));
  }

  // Super admin: the queues
  paymentReports(status?: ReportStatus): Observable<PaymentReport[]> {
    return this.http.get<ApiResponse<PaymentReport[]>>(this.url('v1/billing/payment-reports'), { params: status ? { status } : {} })
      .pipe(map((r) => r.data ?? []));
  }

  approveReport(reportId: number, request: { invoiceId?: number | null; amount?: number | null; note?: string | null } = {}): Observable<PaymentReport> {
    return this.http.post<ApiResponse<PaymentReport>>(this.url(`v1/billing/payment-reports/${reportId}/approve`), request).pipe(map((r) => r.data));
  }

  rejectReport(reportId: number, reason: string): Observable<PaymentReport> {
    return this.http.post<ApiResponse<PaymentReport>>(this.url(`v1/billing/payment-reports/${reportId}/reject`), { reason }).pipe(map((r) => r.data));
  }

  planRequests(status?: PlanRequestStatus): Observable<PlanRequest[]> {
    return this.http.get<ApiResponse<PlanRequest[]>>(this.url('v1/billing/plan-requests'), { params: status ? { status } : {} })
      .pipe(map((r) => r.data ?? []));
  }

  approvePlanRequest(requestId: number, note: string | null): Observable<PlanRequest> {
    return this.http.post<ApiResponse<PlanRequest>>(this.url(`v1/billing/plan-requests/${requestId}/approve`), { note }).pipe(map((r) => r.data));
  }

  declinePlanRequest(requestId: number, reason: string): Observable<PlanRequest> {
    return this.http.post<ApiResponse<PlanRequest>>(this.url(`v1/billing/plan-requests/${requestId}/decline`), { reason }).pipe(map((r) => r.data));
  }

  // Changing plan without asking
  planOptions(agencyId: number): Observable<PlanOption[]> {
    return this.http.get<ApiResponse<PlanOption[]>>(this.agency(agencyId, '/plan-options')).pipe(map((r) => r.data ?? []));
  }

  switchPlan(agencyId: number, planId: number): Observable<Subscription> {
    return this.http.post<ApiResponse<Subscription>>(this.agency(agencyId, '/plan-switch'), { planId }).pipe(map((r) => r.data));
  }

  cancelScheduledSwitch(agencyId: number): Observable<Subscription> {
    return this.http.delete<ApiResponse<Subscription>>(this.agency(agencyId, '/plan-switch')).pipe(map((r) => r.data));
  }

  // Super admin: the business at a glance, and what a plan edit reaches
  overview(): Observable<BillingOverview> {
    return this.http.get<ApiResponse<BillingOverview>>(this.url(ApiUrls.billingOverview)).pipe(map((r) => r.data));
  }

  pendingCounts(): Observable<PendingCounts> {
    return this.http.get<ApiResponse<PendingCounts>>(this.url(ApiUrls.billingPendingCounts)).pipe(map((r) => r.data));
  }

  planAgencyCounts(): Observable<Record<number, number>> {
    return this.http.get<ApiResponse<Record<number, number>>>(this.url(ApiUrls.billingPlanAgencyCounts)).pipe(map((r) => r.data ?? {}));
  }

  planHistory(id: number): Observable<PlanHistoryEntry[]> {
    return this.http.get<ApiResponse<PlanHistoryEntry[]>>(this.url(ApiUrls.billingPlanHistory(id))).pipe(map((r) => r.data ?? []));
  }
}
