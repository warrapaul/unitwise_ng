import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { CategoryDetail, ProductDetail } from './models/ecommerce.models';
import {
  AddCustomerGroupMemberRequest,
  CategoryUpsertRequest,
  CreateProductRequest,
  CustomerGroup,
  CustomerGroupMember,
  CustomerGroupSearchParams,
  CustomerGroupUpsertRequest,
  ProductDiscount,
  ProductDiscountUpsertRequest,
  ProductImage,
  ProductImageMetadataRequest,
  ProductTag,
  ProductTagSearchParams,
  ProductTagUpsertRequest,
  ProductVariantDetail,
  ProductVariantImage,
  ProductVariantUpsertRequest,
  UpdateProductRequest
} from './models/catalog.models';

/** Write-side catalog operations: products, categories, media, tags, discounts and customer groups. */
@Injectable({ providedIn: 'root' })
export class CatalogAdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // --- Products ---

  createProduct(request: CreateProductRequest): Observable<ProductDetail> {
    return this.http.post<ApiResponse<ProductDetail>>(`${this.apiUrl}/${ApiUrls.products}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateProduct(productId: number, request: UpdateProductRequest): Observable<ProductDetail> {
    return this.http.patch<ApiResponse<ProductDetail>>(`${this.apiUrl}/${ApiUrls.productById(productId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteProduct(productId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.productById(productId)}`).pipe(
      map(() => void 0)
    );
  }

  checkSkuAvailable(sku: string, excludeProductId?: number): Observable<boolean> {
    return this.http.get<ApiResponse<boolean>>(`${this.apiUrl}/${ApiUrls.productCheckSku}`, {
      params: buildHttpParams({ sku, excludeProductId })
    }).pipe(map((response) => response.data));
  }

  checkSlugAvailable(slug: string, excludeProductId?: number): Observable<boolean> {
    return this.http.get<ApiResponse<boolean>>(`${this.apiUrl}/${ApiUrls.productCheckSlug}`, {
      params: buildHttpParams({ slug, excludeProductId })
    }).pipe(map((response) => response.data));
  }

  // --- Categories (multipart: JSON part "data" + optional "image" file) ---

  createCategory(request: CategoryUpsertRequest, image?: File | null): Observable<CategoryDetail> {
    return this.http.post<ApiResponse<CategoryDetail>>(
      `${this.apiUrl}/${ApiUrls.categories}`,
      this.toCategoryFormData(request, image)
    ).pipe(map((response) => response.data));
  }

  updateCategory(categoryId: number, request: CategoryUpsertRequest, image?: File | null): Observable<CategoryDetail> {
    return this.http.patch<ApiResponse<CategoryDetail>>(
      `${this.apiUrl}/${ApiUrls.categoryById(categoryId)}`,
      this.toCategoryFormData(request, image)
    ).pipe(map((response) => response.data));
  }

  deleteCategory(categoryId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.categoryById(categoryId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Product images ---

  getProductImages(productId: number): Observable<ProductImage[]> {
    return this.http.get<ApiResponse<ProductImage[]>>(`${this.apiUrl}/${ApiUrls.productImages(productId)}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  uploadProductImage(productId: number, file: File, metadata?: ProductImageMetadataRequest): Observable<ProductImage> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata?.altText) {
      formData.append('altText', metadata.altText);
    }
    if (metadata?.displayOrder !== null && metadata?.displayOrder !== undefined) {
      formData.append('displayOrder', String(metadata.displayOrder));
    }
    if (metadata?.isPrimary !== null && metadata?.isPrimary !== undefined) {
      formData.append('isPrimary', String(metadata.isPrimary));
    }

    return this.http.post<ApiResponse<ProductImage>>(`${this.apiUrl}/${ApiUrls.productImages(productId)}`, formData).pipe(
      map((response) => response.data)
    );
  }

  uploadProductImagesBulk(productId: number, files: File[]): Observable<ProductImage[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    return this.http.post<ApiResponse<ProductImage[]>>(
      `${this.apiUrl}/${ApiUrls.productImagesBulk(productId)}`,
      formData
    ).pipe(map((response) => response.data ?? []));
  }

  updateProductImage(productId: number, imageId: number, request: ProductImageMetadataRequest): Observable<ProductImage> {
    return this.http.patch<ApiResponse<ProductImage>>(
      `${this.apiUrl}/${ApiUrls.productImageById(productId, imageId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  setPrimaryProductImage(productId: number, imageId: number): Observable<ProductImage> {
    return this.http.put<ApiResponse<ProductImage>>(
      `${this.apiUrl}/${ApiUrls.productImagePrimary(productId, imageId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  deleteProductImage(productId: number, imageId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.productImageById(productId, imageId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Variants ---

  getVariants(productId: number): Observable<ProductVariantDetail[]> {
    return this.http.get<ApiResponse<ProductVariantDetail[]>>(`${this.apiUrl}/${ApiUrls.productVariants(productId)}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  getVariant(productId: number, variantId: number): Observable<ProductVariantDetail> {
    return this.http.get<ApiResponse<ProductVariantDetail>>(
      `${this.apiUrl}/${ApiUrls.productVariantById(productId, variantId)}`
    ).pipe(map((response) => response.data));
  }

  createVariant(productId: number, request: ProductVariantUpsertRequest): Observable<ProductVariantDetail> {
    return this.http.post<ApiResponse<ProductVariantDetail>>(
      `${this.apiUrl}/${ApiUrls.productVariants(productId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  updateVariant(productId: number, variantId: number, request: ProductVariantUpsertRequest): Observable<ProductVariantDetail> {
    return this.http.patch<ApiResponse<ProductVariantDetail>>(
      `${this.apiUrl}/${ApiUrls.productVariantById(productId, variantId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteVariant(productId: number, variantId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.productVariantById(productId, variantId)}`
    ).pipe(map(() => void 0));
  }

  getVariantImages(productId: number, variantId: number): Observable<ProductVariantImage[]> {
    return this.http.get<ApiResponse<ProductVariantImage[]>>(
      `${this.apiUrl}/${ApiUrls.productVariantImages(productId, variantId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  uploadVariantImage(
    productId: number,
    variantId: number,
    file: File,
    metadata?: ProductImageMetadataRequest
  ): Observable<ProductVariantImage> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata?.altText) {
      formData.append('altText', metadata.altText);
    }
    if (metadata?.isPrimary !== null && metadata?.isPrimary !== undefined) {
      formData.append('isPrimary', String(metadata.isPrimary));
    }

    return this.http.post<ApiResponse<ProductVariantImage>>(
      `${this.apiUrl}/${ApiUrls.productVariantImages(productId, variantId)}`,
      formData
    ).pipe(map((response) => response.data));
  }

  setPrimaryVariantImage(productId: number, variantId: number, imageId: number): Observable<ProductVariantImage> {
    return this.http.put<ApiResponse<ProductVariantImage>>(
      `${this.apiUrl}/${ApiUrls.productVariantImagePrimary(productId, variantId, imageId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  updateVariantImage(
    productId: number,
    variantId: number,
    imageId: number,
    request: ProductImageMetadataRequest
  ): Observable<ProductVariantImage> {
    return this.http.patch<ApiResponse<ProductVariantImage>>(
      `${this.apiUrl}/${ApiUrls.productVariantImageById(productId, variantId, imageId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteVariantImage(productId: number, variantId: number, imageId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.productVariantImageById(productId, variantId, imageId)}`
    ).pipe(map(() => void 0));
  }

  // --- Tags ---

  getTags(params: ProductTagSearchParams = {}): Observable<PaginatedResult<ProductTag>> {
    return this.http.get<PaginatedApiResponse<ProductTag>>(`${this.apiUrl}/${ApiUrls.tags}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  searchTags(params: ProductTagSearchParams & { keyword: string }): Observable<PaginatedResult<ProductTag>> {
    return this.http.get<PaginatedApiResponse<ProductTag>>(`${this.apiUrl}/${ApiUrls.tagSearch}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getTagBySlug(slug: string): Observable<ProductTag> {
    return this.http.get<ApiResponse<ProductTag>>(`${this.apiUrl}/${ApiUrls.tagBySlug(slug)}`).pipe(
      map((response) => response.data)
    );
  }

  getTag(tagId: number): Observable<ProductTag> {
    return this.http.get<ApiResponse<ProductTag>>(`${this.apiUrl}/${ApiUrls.tagById(tagId)}`).pipe(
      map((response) => response.data)
    );
  }

  createTag(request: ProductTagUpsertRequest): Observable<ProductTag> {
    return this.http.post<ApiResponse<ProductTag>>(`${this.apiUrl}/${ApiUrls.tags}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateTag(tagId: number, request: ProductTagUpsertRequest): Observable<ProductTag> {
    return this.http.patch<ApiResponse<ProductTag>>(`${this.apiUrl}/${ApiUrls.tagById(tagId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteTag(tagId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.tagById(tagId)}`).pipe(map(() => void 0));
  }

  getProductTags(productId: number): Observable<ProductTag[]> {
    return this.http.get<ApiResponse<ProductTag[]>>(`${this.apiUrl}/${ApiUrls.productTags(productId)}`).pipe(
      map((response) => response.data ?? [])
    );
  }

  assignProductTag(productId: number, tagId: number): Observable<void> {
    return this.http.post<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.productTagById(productId, tagId)}`, {}).pipe(
      map(() => void 0)
    );
  }

  removeProductTag(productId: number, tagId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.productTagById(productId, tagId)}`).pipe(
      map(() => void 0)
    );
  }

  replaceProductTags(productId: number, tagIds: number[]): Observable<ProductTag[]> {
    return this.http.put<ApiResponse<ProductTag[]>>(`${this.apiUrl}/${ApiUrls.productTags(productId)}`, tagIds).pipe(
      map((response) => response.data ?? [])
    );
  }

  // --- Product discounts ---

  getProductDiscounts(productId: number, params: { page?: number; size?: number } = {}): Observable<PaginatedResult<ProductDiscount>> {
    return this.http.get<PaginatedApiResponse<ProductDiscount>>(`${this.apiUrl}/${ApiUrls.productDiscounts(productId)}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getActiveProductDiscounts(productId: number): Observable<ProductDiscount[]> {
    return this.http.get<ApiResponse<ProductDiscount[]>>(`${this.apiUrl}/${ApiUrls.productDiscountsActive(productId)}`).pipe(
      map((response) => response.data ?? [])
    );
  }

  createProductDiscount(productId: number, request: ProductDiscountUpsertRequest): Observable<ProductDiscount> {
    return this.http.post<ApiResponse<ProductDiscount>>(
      `${this.apiUrl}/${ApiUrls.productDiscounts(productId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  updateProductDiscount(
    productId: number,
    discountId: number,
    request: Partial<ProductDiscountUpsertRequest>
  ): Observable<ProductDiscount> {
    return this.http.patch<ApiResponse<ProductDiscount>>(
      `${this.apiUrl}/${ApiUrls.productDiscountById(productId, discountId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  toggleProductDiscount(productId: number, discountId: number): Observable<ProductDiscount> {
    return this.http.patch<ApiResponse<ProductDiscount>>(
      `${this.apiUrl}/${ApiUrls.productDiscountToggle(productId, discountId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  deleteProductDiscount(productId: number, discountId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.productDiscountById(productId, discountId)}`
    ).pipe(map(() => void 0));
  }

  // --- Customer groups ---

  getCustomerGroups(params: CustomerGroupSearchParams = {}): Observable<PaginatedResult<CustomerGroup>> {
    return this.http.get<PaginatedApiResponse<CustomerGroup>>(`${this.apiUrl}/${ApiUrls.customerGroups}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getCustomerGroup(groupId: number): Observable<CustomerGroup> {
    return this.http.get<ApiResponse<CustomerGroup>>(`${this.apiUrl}/${ApiUrls.customerGroupById(groupId)}`).pipe(
      map((response) => response.data)
    );
  }

  createCustomerGroup(request: CustomerGroupUpsertRequest): Observable<CustomerGroup> {
    return this.http.post<ApiResponse<CustomerGroup>>(`${this.apiUrl}/${ApiUrls.customerGroups}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateCustomerGroup(groupId: number, request: CustomerGroupUpsertRequest): Observable<CustomerGroup> {
    return this.http.patch<ApiResponse<CustomerGroup>>(
      `${this.apiUrl}/${ApiUrls.customerGroupById(groupId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  getCustomerGroupMembers(groupId: number, params: { page?: number; size?: number } = {}): Observable<PaginatedResult<CustomerGroupMember>> {
    return this.http.get<PaginatedApiResponse<CustomerGroupMember>>(
      `${this.apiUrl}/${ApiUrls.customerGroupMembers(groupId)}`,
      { params: buildHttpParams(params) }
    ).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  addCustomerGroupMember(groupId: number, request: AddCustomerGroupMemberRequest): Observable<CustomerGroupMember> {
    return this.http.post<ApiResponse<CustomerGroupMember>>(
      `${this.apiUrl}/${ApiUrls.customerGroupMembers(groupId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  removeCustomerGroupMember(groupId: number, userId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.customerGroupMemberById(groupId, userId)}`
    ).pipe(map(() => void 0));
  }

  private toCategoryFormData(request: CategoryUpsertRequest, image?: File | null): FormData {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    if (image) {
      formData.append('image', image);
    }

    return formData;
  }
}
