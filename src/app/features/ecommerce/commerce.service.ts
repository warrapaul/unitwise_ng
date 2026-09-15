import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { OrderDetail } from './models/ecommerce.models';
import {
  CartVoucherValidation,
  CreatePartialPaymentPolicyRequest,
  CreateVoucherRequest,
  DeliveryAddressDetail,
  DeliveryAddressPreview,
  DeliveryAddressUpsertRequest,
  MarkCashCollectedRequest,
  MarkMpesaCollectedRequest,
  PartialPaymentEligibility,
  PartialPaymentEligibilityRequest,
  PartialPaymentPolicy,
  PaymentSearchParams,
  PaymentSearchResult,
  PaymentStatus,
  RecordPartialPaymentRequest,
  UpdatePartialPaymentPolicyRequest,
  UpdateVoucherRequest,
  Voucher,
  VoucherSearchParams,
  VoucherValidation
} from './models/commerce.models';

/** Vouchers, payments, partial-payment policies and customer delivery addresses. */
@Injectable({ providedIn: 'root' })
export class CommerceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // --- Vouchers ---

  getVouchers(params: VoucherSearchParams = {}): Observable<PaginatedResult<Voucher>> {
    return this.http.get<PaginatedApiResponse<Voucher>>(`${this.apiUrl}/${ApiUrls.vouchers}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getMyVouchers(params: VoucherSearchParams = {}): Observable<PaginatedResult<Voucher>> {
    return this.http.get<PaginatedApiResponse<Voucher>>(`${this.apiUrl}/${ApiUrls.voucherMine}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getVoucher(voucherId: number): Observable<Voucher> {
    return this.http.get<ApiResponse<Voucher>>(`${this.apiUrl}/${ApiUrls.voucherById(voucherId)}`).pipe(
      map((response) => response.data)
    );
  }

  getVoucherStatistics(voucherId: number): Observable<Voucher> {
    return this.http.get<ApiResponse<Voucher>>(`${this.apiUrl}/${ApiUrls.voucherStats(voucherId)}`).pipe(
      map((response) => response.data)
    );
  }

  createVoucher(request: CreateVoucherRequest): Observable<Voucher> {
    return this.http.post<ApiResponse<Voucher>>(`${this.apiUrl}/${ApiUrls.vouchers}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateVoucher(voucherId: number, request: UpdateVoucherRequest): Observable<Voucher> {
    return this.http.patch<ApiResponse<Voucher>>(`${this.apiUrl}/${ApiUrls.voucherById(voucherId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteVoucher(voucherId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.voucherById(voucherId)}`).pipe(
      map(() => void 0)
    );
  }

  validateVoucher(code: string, orderSubtotal: number): Observable<VoucherValidation> {
    return this.http.get<ApiResponse<VoucherValidation>>(`${this.apiUrl}/${ApiUrls.voucherValidate}`, {
      params: buildHttpParams({ code, orderSubtotal })
    }).pipe(map((response) => response.data));
  }

  validateVouchersForCart(codes: string[], cartSubtotal?: number): Observable<CartVoucherValidation[]> {
    return this.http.post<ApiResponse<CartVoucherValidation[]>>(
      `${this.apiUrl}/${ApiUrls.voucherValidateForCart}`,
      {},
      { params: buildHttpParams({ codes, cartSubtotal }) }
    ).pipe(map((response) => response.data ?? []));
  }

  // --- Payments ---

  searchPayments(params: PaymentSearchParams = {}): Observable<PaginatedResult<PaymentSearchResult>> {
    return this.http.get<PaginatedApiResponse<PaymentSearchResult>>(`${this.apiUrl}/${ApiUrls.payments}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  /** Payments not yet attached to an order — used when reconciling an M-Pesa collection. */
  searchEligiblePayments(params: PaymentSearchParams = {}): Observable<PaginatedResult<PaymentSearchResult>> {
    return this.http.get<PaginatedApiResponse<PaymentSearchResult>>(`${this.apiUrl}/${ApiUrls.paymentOrderSearch}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getPayment(paymentId: number): Observable<PaymentStatus> {
    return this.http.get<ApiResponse<PaymentStatus>>(`${this.apiUrl}/${ApiUrls.paymentById(paymentId)}`).pipe(
      map((response) => response.data)
    );
  }

  getPaymentStatusForOrder(orderId: number): Observable<PaymentStatus> {
    return this.http.get<ApiResponse<PaymentStatus>>(`${this.apiUrl}/${ApiUrls.paymentStatusByOrder(orderId)}`).pipe(
      map((response) => response.data)
    );
  }

  markCashCollected(orderId: number, request: MarkCashCollectedRequest): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(
      `${this.apiUrl}/${ApiUrls.orderMarkCashCollected(orderId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  markMpesaCollected(orderId: number, request: MarkMpesaCollectedRequest): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(
      `${this.apiUrl}/${ApiUrls.orderMarkMpesaCollected(orderId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  // --- Partial payment policies ---

  /** Paging and sort only — the endpoint takes no search criteria. */
  getPartialPaymentPolicies(params: { page?: number; size?: number; sort?: string | string[]; direction?: 'asc' | 'desc' } = {}): Observable<PaginatedResult<PartialPaymentPolicy>> {
    return this.http.get<PaginatedApiResponse<PartialPaymentPolicy>>(
      `${this.apiUrl}/${ApiUrls.partialPaymentPolicies}`,
      { params: buildHttpParams(params) }
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getPartialPaymentPolicy(policyId: number): Observable<PartialPaymentPolicy> {
    return this.http.get<ApiResponse<PartialPaymentPolicy>>(
      `${this.apiUrl}/${ApiUrls.partialPaymentPolicyById(policyId)}`
    ).pipe(map((response) => response.data));
  }

  createPartialPaymentPolicy(request: CreatePartialPaymentPolicyRequest): Observable<PartialPaymentPolicy> {
    return this.http.post<ApiResponse<PartialPaymentPolicy>>(
      `${this.apiUrl}/${ApiUrls.partialPaymentPolicies}`,
      request
    ).pipe(map((response) => response.data));
  }

  updatePartialPaymentPolicy(policyId: number, request: UpdatePartialPaymentPolicyRequest): Observable<PartialPaymentPolicy> {
    return this.http.patch<ApiResponse<PartialPaymentPolicy>>(
      `${this.apiUrl}/${ApiUrls.partialPaymentPolicyById(policyId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  checkPartialPaymentEligibility(request: PartialPaymentEligibilityRequest): Observable<PartialPaymentEligibility> {
    return this.http.post<ApiResponse<PartialPaymentEligibility>>(
      `${this.apiUrl}/${ApiUrls.partialPaymentEligibility}`,
      request
    ).pipe(map((response) => response.data));
  }

  recordPartialPayment(orderId: number, request: RecordPartialPaymentRequest): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(
      `${this.apiUrl}/${ApiUrls.partialPaymentRecord(orderId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  // --- Delivery addresses ---

  getMyDeliveryAddresses(): Observable<DeliveryAddressPreview[]> {
    return this.http.get<ApiResponse<DeliveryAddressPreview[]>>(`${this.apiUrl}/${ApiUrls.deliveryAddresses}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  getMyDeliveryAddressesPaginated(params: { page?: number; size?: number } = {}): Observable<PaginatedResult<DeliveryAddressPreview>> {
    return this.http.get<PaginatedApiResponse<DeliveryAddressPreview>>(
      `${this.apiUrl}/${ApiUrls.deliveryAddressesPaginated}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getDeliveryAddressesForUser(userId: number): Observable<DeliveryAddressPreview[]> {
    return this.http.get<ApiResponse<DeliveryAddressPreview[]>>(
      `${this.apiUrl}/${ApiUrls.deliveryAddressesByUser(userId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  getDeliveryAddress(addressId: number): Observable<DeliveryAddressDetail> {
    return this.http.get<ApiResponse<DeliveryAddressDetail>>(
      `${this.apiUrl}/${ApiUrls.deliveryAddressById(addressId)}`
    ).pipe(map((response) => response.data));
  }

  createDeliveryAddress(request: DeliveryAddressUpsertRequest): Observable<DeliveryAddressDetail> {
    return this.http.post<ApiResponse<DeliveryAddressDetail>>(
      `${this.apiUrl}/${ApiUrls.deliveryAddresses}`,
      request
    ).pipe(map((response) => response.data));
  }

  updateDeliveryAddress(addressId: number, request: Partial<DeliveryAddressUpsertRequest>): Observable<DeliveryAddressDetail> {
    return this.http.patch<ApiResponse<DeliveryAddressDetail>>(
      `${this.apiUrl}/${ApiUrls.deliveryAddressById(addressId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteDeliveryAddress(addressId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.deliveryAddressById(addressId)}`).pipe(
      map(() => void 0)
    );
  }

  verifyDeliveryAddress(addressId: number): Observable<void> {
    return this.http.patch<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.deliveryAddressVerify(addressId)}`, {}).pipe(
      map(() => void 0)
    );
  }
}
