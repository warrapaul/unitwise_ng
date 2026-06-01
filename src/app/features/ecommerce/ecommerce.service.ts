import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import {
  CategoryDetail,
  CategoryPreview,
  CategorySearchParams,
  CategoryTreeNode,
  CustomerPreview,
  CustomerSearchParams,
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
    return this.http.put<ApiResponse<StoreDetail>>(`${this.apiUrl}/${ApiUrls.storeById(storeId)}`, request).pipe(
      map((response) => response.data)
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

  getCustomers(params: CustomerSearchParams): Observable<PaginatedResult<CustomerPreview>> {
    return this.http.get<PaginatedApiResponse<CustomerPreview>>(
      `${this.apiUrl}/${ApiUrls.ecomUsers.customers}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
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

    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      const normalizedValue = Array.isArray(value) ? value.join(',') : String(value);
      httpParams = httpParams.set(key, normalizedValue);
    }

    return httpParams;
  }
}
