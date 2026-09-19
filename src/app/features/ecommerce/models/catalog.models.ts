export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK' | 'DISCONTINUED';
export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_DELIVERY';

export interface ProductTag {
  id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProductTagUpsertRequest {
  name: string;
  slug?: string | null;
  description?: string | null;
}

export interface ProductTagSearchParams {
  keyword?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface ProductImage {
  id: number;
  imageUrl: string;
  altText?: string | null;
  displayOrder?: number | null;
  isPrimary?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProductImageMetadataRequest {
  altText?: string | null;
  displayOrder?: number | null;
  isPrimary?: boolean | null;
}

export interface ProductVariantImage extends ProductImage {
  thumbnailUrl?: string | null;
}

export interface ProductVariantDetail {
  id: number;
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  material?: string | null;
  priceAdjustment?: number | string | null;
  priceOverride?: number | string | null;
  effectivePrice?: number | string | null;
  quantity?: number | null;
  availableQuantity?: number | null;
  lowStockThreshold?: number | null;
  allowBackorder?: boolean | null;
  warehouse?: string | null;
  binLocation?: string | null;
  isInStock?: boolean | null;
  isLowStock?: boolean | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  images?: ProductVariantImage[] | null;
}

export interface ProductVariantUpsertRequest {
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  material?: string | null;
  priceAdjustment?: number | null;
  priceOverride?: number | null;
  quantity?: number | null;
  lowStockThreshold?: number | null;
  allowBackorder?: boolean | null;
  warehouse?: string | null;
  binLocation?: string | null;
  isActive?: boolean | null;
}

export interface ProductAttribute {
  id: number;
  attributeName: string;
  attributeValue: string;
  displayOrder?: number | null;
  isVisible?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProductAttributeUpsertRequest {
  attributeName: string;
  attributeValue: string;
  displayOrder?: number | null;
  isVisible?: boolean | null;
}

export interface ProductInventory {
  id?: number;
  quantity?: number | null;
  availableQuantity?: number | null;
  lowStockThreshold?: number | null;
  quantityReserved?: number | null;
  allowBackorder?: boolean | null;
  isInStock?: boolean | null;
  isLowStock?: boolean | null;
  warehouse?: string | null;
  binLocation?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProductInventoryUpsertRequest {
  quantity?: number | null;
  lowStockThreshold?: number | null;
  quantityReserved?: number | null;
  allowBackorder?: boolean | null;
  warehouse?: string | null;
  binLocation?: string | null;
}

export interface ProductDiscount {
  id: number;
  name: string;
  description?: string | null;
  discountType: string;
  discountValue: number | string;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean | null;
  isValid?: boolean | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  customerGroupId?: number | null;
  usageLimit?: number | null;
  usageCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProductDiscountUpsertRequest {
  name: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  customerGroupId?: number | null;
  usageLimit?: number | null;
}

export interface CreateProductRequest {
  name: string;
  sku: string;
  upc?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  minOrderQuantity?: number | null;
  maxOrderQuantity?: number | null;
  status?: ProductStatus | null;
  isFeatured?: boolean | null;
  isTaxable?: boolean | null;
  taxRate?: number | null;
  slug?: string | null;
  categoryId: number;
  subCategoryId?: number | null;
  displayOrder?: number | null;
  attributes?: ProductAttributeUpsertRequest[];
  tagIds?: number[];
  inventory?: ProductInventoryUpsertRequest | null;
}

export type UpdateProductRequest = Partial<Omit<CreateProductRequest, 'tagIds'>>;

export interface CategoryUpsertRequest {
  name: string;
  description?: string | null;
  slug?: string | null;
  imageUrl?: string | null;
  parentId?: number | null;
  displayOrder?: number | null;
  isActive?: boolean | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
}

export interface CustomerGroup {
  id: number;
  name: string;
  description?: string | null;
  isActive?: boolean | null;
  discountPercentage?: number | string | null;
  memberCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CustomerGroupUpsertRequest {
  name: string;
  description?: string | null;
  isActive?: boolean | null;
}

export interface CustomerGroupMember {
  id: number;
  userId: number;
  userFullName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  notes?: string | null;
  expiresAt?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
}

export interface AddCustomerGroupMemberRequest {
  userId: number;
  notes?: string | null;
  expiresAt?: string | null;
}

export interface CustomerGroupSearchParams {
  type?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export const PRODUCT_SORTABLE_FIELDS = ['name', 'sku', 'price', 'createdAt', 'displayOrder'] as const;
export const TAG_SORTABLE_FIELDS = ['name', 'slug', 'createdAt'] as const;

/** Mirrors FileUploadContext's product-image limits — the backend stays the authority. */
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const PRODUCT_IMAGE_MAX_MB = 5;
