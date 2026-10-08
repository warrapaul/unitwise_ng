import { DeliveryAddressDetail, DeliveryAddressUpsertRequest } from './models/commerce.models';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import {
  CartValidationRequest,
  CartValidationResult,
  CategoryDetail,
  CategoryPreview,
  CategorySearchParams,
  CategoryTreeNode,
  CustomerPreview,
  CustomerSearchParams,
  EcomCustomerCreateRequest,
  EcomCustomerDetailsUpdate,
  EcomCustomerLookup,
  EcomCustomerDetail,
  EcomCustomerPreview,
  EcomCustomerSearchParams,
  EcomCustomerStaffUpdate,
  CreateOrderRequest,
  OrderCancelRequest,
  OrderDetail,
  OrderPreview,
  OrderSearchParams,
  OrderUpdateRequest,
  ProductDetail,
  ProductPreview,
  ProductSearchParams,
  StoreDetail,
  StorePreview,
  StoreUpsertRequest,
  StoreSearchParams
} from './models/ecommerce.models';
import { ProductTag } from './models/catalog.models';

@Injectable({ providedIn: 'root' })
export class EcommerceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getProducts(params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.apiUrl}/${ApiUrls.products}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getProduct(productId: number): Observable<ProductDetail> {
    return this.http.get<ApiResponse<ProductDetail>>(`${this.apiUrl}/${ApiUrls.productById(productId)}`).pipe(
      map((response) => response.data)
    );
  }

  getActiveProducts(params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.apiUrl}/${ApiUrls.productActive}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getProductBySku(sku: string): Observable<ProductDetail> {
    return this.http.get<ApiResponse<ProductDetail>>(`${this.apiUrl}/${ApiUrls.productBySku(sku)}`).pipe(
      map((response) => response.data)
    );
  }

  getProductBySlug(slug: string): Observable<ProductDetail> {
    return this.http.get<ApiResponse<ProductDetail>>(`${this.apiUrl}/${ApiUrls.productBySlug(slug)}`).pipe(
      map((response) => response.data)
    );
  }

  getProductsByCategory(categoryId: number, params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.apiUrl}/${ApiUrls.productByCategory(categoryId)}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getProductsBySubCategory(subCategoryId: number, params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.apiUrl}/${ApiUrls.productBySubCategory(subCategoryId)}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getFeaturedProductsByCategory(categoryId: number, params: ProductSearchParams = {}): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.apiUrl}/${ApiUrls.productFeaturedByCategory(categoryId)}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getFeaturedProductsBySubCategory(subCategoryId: number, params: ProductSearchParams = {}): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.apiUrl}/${ApiUrls.productFeaturedBySubCategory(subCategoryId)}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getCategoryBySlug(slug: string): Observable<CategoryDetail> {
    return this.http.get<ApiResponse<CategoryDetail>>(`${this.apiUrl}/${ApiUrls.categoryBySlug(slug)}`).pipe(
      map((response) => response.data)
    );
  }

  getSubcategories(parentId?: number, includeInactive = false): Observable<CategoryPreview[]> {
    return this.http.get<ApiResponse<CategoryPreview[]>>(
      `${this.apiUrl}/${ApiUrls.categorySubcategories}`,
      { params: this.toHttpParams({ parentId, includeInactive }) }
    ).pipe(map((response) => response.data ?? []));
  }

  /** Tags a shopper can filter by: active and on at least one product on sale. */
  getShopTags(): Observable<ProductTag[]> {
    return this.http.get<ApiResponse<ProductTag[]>>(`${this.apiUrl}/${ApiUrls.shopTags}`).pipe(map((response) => response.data ?? []));
  }

  getCategoryHierarchy(includeInactive = false): Observable<CategoryTreeNode[]> {
    return this.http.get<ApiResponse<CategoryTreeNode[]>>(
      `${this.apiUrl}/${ApiUrls.categoryHierarchy}`,
      { params: this.toHttpParams({ includeInactive }) }
    ).pipe(map((response) => response.data));
  }

  getCategories(params: CategorySearchParams): Observable<PaginatedResult<CategoryPreview>> {
    return this.http.get<PaginatedApiResponse<CategoryPreview>>(
      `${this.apiUrl}/${ApiUrls.categories}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  searchCategories(params: CategorySearchParams & { keyword: string }): Observable<PaginatedResult<CategoryPreview>> {
    return this.http.get<PaginatedApiResponse<CategoryPreview>>(
      `${this.apiUrl}/${ApiUrls.categorySearch}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getCategory(categoryId: number): Observable<CategoryDetail> {
    return this.http.get<ApiResponse<CategoryDetail>>(`${this.apiUrl}/${ApiUrls.categoryById(categoryId)}`).pipe(
      map((response) => response.data)
    );
  }

  getCategoryProductCount(categoryId: number): Observable<number> {
    return this.http.get<ApiResponse<number>>(`${this.apiUrl}/${ApiUrls.categoryProductCount(categoryId)}`).pipe(
      map((response) => response.data)
    );
  }

  getStores(params: StoreSearchParams): Observable<PaginatedResult<StorePreview>> {
    return this.http.get<PaginatedApiResponse<StorePreview>>(
      `${this.apiUrl}/${ApiUrls.stores}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getStore(storeId: number): Observable<StoreDetail> {
    return this.http.get<ApiResponse<StoreDetail>>(`${this.apiUrl}/${ApiUrls.storeById(storeId)}`).pipe(
      map((response) => response.data)
    );
  }

  createStore(request: StoreUpsertRequest): Observable<StoreDetail> {
    return this.http.post<ApiResponse<StoreDetail>>(`${this.apiUrl}/${ApiUrls.stores}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateStore(storeId: number, request: StoreUpsertRequest): Observable<StoreDetail> {
    return this.http.patch<ApiResponse<StoreDetail>>(`${this.apiUrl}/${ApiUrls.storeById(storeId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  /** `DELETE /v1/stores/{id}` — StoreController, guarded by STORE_DELETE. */
  deleteStore(storeId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.storeById(storeId)}`).pipe(
      map(() => void 0)
    );
  }

  getOrders(params: OrderSearchParams): Observable<PaginatedResult<OrderPreview>> {
    return this.http.get<PaginatedApiResponse<OrderPreview>>(
      `${this.apiUrl}/${ApiUrls.orders}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getOrder(orderId: number): Observable<OrderDetail> {
    return this.http.get<ApiResponse<OrderDetail>>(`${this.apiUrl}/${ApiUrls.orderById(orderId)}`).pipe(
      map((response) => response.data)
    );
  }

  updateOrder(orderId: number, request: OrderUpdateRequest): Observable<OrderDetail> {
    return this.http.patch<ApiResponse<OrderDetail>>(`${this.apiUrl}/${ApiUrls.orderById(orderId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  cancelOrder(orderId: number, request: OrderCancelRequest): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(`${this.apiUrl}/${ApiUrls.orderCancel(orderId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  createOrder(request: CreateOrderRequest): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(`${this.apiUrl}/${ApiUrls.orders}`, request).pipe(
      map((response) => response.data)
    );
  }

  /** Re-prices the cart server-side and checks stock before checkout. */
  validateCart(request: CartValidationRequest): Observable<CartValidationResult> {
    return this.http.post<ApiResponse<CartValidationResult>>(`${this.apiUrl}/${ApiUrls.orderValidateCart}`, request).pipe(
      map((response) => response.data)
    );
  }

  getMyOrders(params: OrderSearchParams): Observable<PaginatedResult<OrderPreview>> {
    return this.http.get<PaginatedApiResponse<OrderPreview>>(
      `${this.apiUrl}/${ApiUrls.orderMyOrders}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getOrdersForCustomer(customerId: number, params: OrderSearchParams): Observable<PaginatedResult<OrderPreview>> {
    return this.http.get<PaginatedApiResponse<OrderPreview>>(
      `${this.apiUrl}/${ApiUrls.orderByCustomer(customerId)}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getCustomers(params: CustomerSearchParams): Observable<PaginatedResult<CustomerPreview>> {
    return this.http.get<PaginatedApiResponse<CustomerPreview>>(
      `${this.apiUrl}/${ApiUrls.ecomUsers.customers}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  // ── Customers: the ecommerce profile staff manage ──

  searchEcomCustomers(params: EcomCustomerSearchParams): Observable<PaginatedResult<EcomCustomerPreview>> {
    return this.http.get<PaginatedApiResponse<EcomCustomerPreview>>(
      `${this.apiUrl}/${ApiUrls.ecomUsers.customers}`,
      { params: this.toHttpParams({ ...params, status: params.status || undefined, source: params.source || undefined }) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getEcomCustomer(id: number): Observable<EcomCustomerDetail> {
    return this.http.get<ApiResponse<EcomCustomerDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerById(id)}`)
      .pipe(map((response) => response.data));
  }

  /** Reuses the account holding the phone number, or creates one the person claims later. */
  createEcomCustomer(request: EcomCustomerCreateRequest): Observable<EcomCustomerLookup> {
    return this.http.post<ApiResponse<EcomCustomerLookup>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customers}`, request)
      .pipe(map((response) => response.data));
  }

  lookupEcomCustomer(phoneNumber: string): Observable<EcomCustomerLookup> {
    return this.http.get<ApiResponse<EcomCustomerLookup>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerLookup}`,
      { params: { phoneNumber } }).pipe(map((response) => response.data));
  }

  updateEcomCustomerDetails(id: number, request: EcomCustomerDetailsUpdate): Observable<EcomCustomerDetail> {
    return this.http.patch<ApiResponse<EcomCustomerDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerDetails(id)}`, request)
      .pipe(map((response) => response.data));
  }

  getEcomCustomerAddresses(id: number): Observable<DeliveryAddressDetail[]> {
    return this.http.get<ApiResponse<DeliveryAddressDetail[]>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerAddresses(id)}`)
      .pipe(map((response) => response.data ?? []));
  }

  addEcomCustomerAddress(id: number, request: DeliveryAddressUpsertRequest): Observable<DeliveryAddressDetail> {
    return this.http.post<ApiResponse<DeliveryAddressDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerAddresses(id)}`, request)
      .pipe(map((response) => response.data));
  }

  updateEcomCustomerAddress(id: number, addressId: number, request: Partial<DeliveryAddressUpsertRequest>): Observable<DeliveryAddressDetail> {
    return this.http.patch<ApiResponse<DeliveryAddressDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerAddress(id, addressId)}`, request)
      .pipe(map((response) => response.data));
  }

  verifyEcomCustomerAddress(id: number, addressId: number): Observable<DeliveryAddressDetail> {
    return this.http.post<ApiResponse<DeliveryAddressDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerAddressVerify(id, addressId)}`, {})
      .pipe(map((response) => response.data));
  }

  updateEcomCustomer(id: number, request: EcomCustomerStaffUpdate): Observable<EcomCustomerDetail> {
    return this.http.patch<ApiResponse<EcomCustomerDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerById(id)}`, request)
      .pipe(map((response) => response.data));
  }

  blockEcomCustomer(id: number, reason: string): Observable<EcomCustomerDetail> {
    return this.http.post<ApiResponse<EcomCustomerDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerBlock(id)}`, { reason })
      .pipe(map((response) => response.data));
  }

  unblockEcomCustomer(id: number): Observable<EcomCustomerDetail> {
    return this.http.post<ApiResponse<EcomCustomerDetail>>(`${this.apiUrl}/${ApiUrls.ecomUsers.customerUnblock(id)}`, {})
      .pipe(map((response) => response.data));
  }

  getRiders(params: CustomerSearchParams): Observable<PaginatedResult<CustomerPreview>> {
    return this.http.get<PaginatedApiResponse<CustomerPreview>>(
      `${this.apiUrl}/${ApiUrls.ecomUsers.riders}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getStoreManagers(params: CustomerSearchParams): Observable<PaginatedResult<CustomerPreview>> {
    return this.http.get<PaginatedApiResponse<CustomerPreview>>(
      `${this.apiUrl}/${ApiUrls.ecomUsers.storeManagers}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  private toPaginatedResult<T>(response: PaginatedApiResponse<T>): PaginatedResult<T> {
    return {
      items: response.data,
      pagination: response.pagination
    };
  }

  private toHttpParams(params: object): HttpParams {
    let httpParams = new HttpParams();

    const entries = params as Record<string, unknown>;
    for (const [key, value] of Object.entries(entries)) {
      if (value === null || value === undefined || value === '' || key === 'direction') {
        continue;
      }

      // Spring reads the direction out of `sort` itself (`sort=price,desc`) and ignores a
      // separate `direction` param — sent apart, every descending sort came back ascending.
      if (key === 'sort' && entries['direction'] && !String(value).includes(',')) {
        httpParams = httpParams.set('sort', `${String(value)},${String(entries['direction'])}`);
        continue;
      }

      const normalizedValue = Array.isArray(value) ? value.join(',') : String(value);
      httpParams = httpParams.set(key, normalizedValue);
    }

    return httpParams;
  }
}
