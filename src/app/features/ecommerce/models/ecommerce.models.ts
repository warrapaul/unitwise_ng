import { UserPreview, UserSearchParams } from '../../../features/users/models/user.models';

export interface ProductPreview {
  id: number;
  name: string;
  sku: string;
  shortDescription?: string | null;
  status: string;
  isFeatured?: boolean;
  slug?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  displayOrder?: number | null;
  primaryImageUrl?: string | null;
  hasVariants?: boolean;
  stockStatus?: string | null;
  minVariantPrice?: number | string | null;
  maxVariantPrice?: number | string | null;
  availableQuantity?: number | null;
  discountBadge?: string | null;
  price?: number | string | null;
  compareAtPrice?: number | string | null;
  sellingPrice?: number | string | null;
  highlightTags?: string[] | null;
}

export interface ProductDetail extends ProductPreview {
  upc?: string | null;
  description?: string | null;
  minOrderQuantity?: number | null;
  maxOrderQuantity?: number | null;
  isTaxable?: boolean | null;
  taxRate?: number | string | null;
  categoryId?: number | null;
  subCategoryId?: number | null;
  allowBackorder?: boolean | null;
  attributes?: Array<{ id?: number; name?: string; value?: string }>;
  images?: Array<{ id?: number; url?: string; altText?: string; isPrimary?: boolean }>;
  variants?: Array<{
    id?: number;
    sku?: string;
    price?: number | string | null;
    stockStatus?: string | null;
    availableQuantity?: number | null;
    displayName?: string | null;
  }>;
  discounts?: Array<{ id?: number; name?: string; type?: string; value?: number | string | null; isActive?: boolean }>;
  tags?: Array<{ id?: number; name?: string; slug?: string }>;
  inventory?: { quantity?: number; reservedQuantity?: number; availableQuantity?: number; stockStatus?: string; allowBackorder?: boolean };
  variantGrouping?: {
    availableOptions?: Record<string, string[]>;
    optionCounts?: Record<string, Record<string, number>>;
    variantImages?: Record<string, string>;
  };
  userPricing?: {
    originalPrice?: number | string;
    finalPrice?: number | string;
    discountAmount?: number | string;
    discountType?: string;
    discountName?: string;
  };
}

export interface ProductSearchParams {
  name?: string;
  sku?: string;
  upc?: string;
  slug?: string;
  status?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  categoryId?: number;
  subCategoryId?: number;
  isFeatured?: boolean | string;
  isTaxable?: boolean | string;
  stockStatus?: string;
  expiryStatus?: string;
  expiryBeforeDate?: string;
  includeExpired?: boolean;
  tagSlugs?: string[] | string;
  tagMatchMode?: 'any' | 'all' | string;
  hasVariants?: boolean | string;
  searchInDescription?: boolean | string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface CategoryPreview {
  id: number;
  name: string;
  slug?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  displayOrder?: number | null;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  parentId?: number | null;
  parentName?: string | null;
}

export interface CategoryDetail extends CategoryPreview {
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  parent?: CategoryPreview | null;
  subCategories?: CategoryPreview[] | null;
}

export interface CategoryTreeNode {
  id: number;
  name: string;
  slug?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  subCategories?: CategoryTreeNode[] | null;
}

export interface CategorySearchParams {
  keyword?: string;
  includeInactive?: boolean;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface StorePreview {
  id: number;
  name: string;
  code: string;
  town?: string | null;
  city?: string | null;
  county?: string | null;
  landmark?: string | null;
  contactPhone?: string | null;
  operatingHours?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
}

export interface StoreDetail extends StorePreview {
  addressLine1?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  pickupInstructions?: string | null;
  updatedAt?: string | null;
}

export interface StoreSearchParams {
  id?: number;
  code?: string;
  name?: string;
  city?: string;
  county?: string;
  isActive?: boolean | string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface OrderItem {
  id?: number;
  productIdSnapshot?: number;
  productVariantIdSnapshot?: number;
  productSkuSnapshot?: string | null;
  productNameSnapshot?: string | null;
  productDescriptionSnapshot?: string | null;
  productImageUrlSnapshot?: string | null;
  variantSkuSnapshot?: string | null;
  variantColorSnapshot?: string | null;
  variantSizeSnapshot?: string | null;
  variantMaterialSnapshot?: string | null;
  unitPrice?: number | string | null;
  originalPrice?: number | string | null;
  quantity?: number | null;
  subtotal?: number | string | null;
  discountApplied?: number | string | null;
  taxAmount?: number | string | null;
  taxRate?: number | string | null;
  displayName?: string | null;
}

export interface OrderPayment {
  id?: number;
  amount?: number | string | null;
  phoneNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  initiatedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  retryCount?: number | null;
  totalPaid?: number | string | null;
  remainingBalance?: number | string | null;
}

export interface OrderDetail {
  id: number;
  orderNumber: string;
  customerId?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deliveryMethod?: string | null;
  deliveryAddressId?: number | null;
  deliveryFullAddress?: string | null;
  deliveryContactPhone?: string | null;
  deliveryContactName?: string | null;
  deliveryInstructions?: string | null;
  subtotal?: number | string | null;
  discountAmount?: number | string | null;
  taxAmount?: number | string | null;
  deliveryFee?: number | string | null;
  totalAmount?: number | string | null;
  status?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  items?: OrderItem[] | null;
  payment?: OrderPayment | null;
  vouchers?: Array<{ id?: number; code?: string; name?: string }>;
  statusHistory?: Array<{ id?: number; status?: string; reason?: string; createdAt?: string | null }>;
  createdAt?: string | null;
  updatedAt?: string | null;
  deliverAddress?: {
    id?: number;
    label?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    county?: string | null;
    landmark?: string | null;
    phoneNumber?: string | null;
  } | null;
  minDownPayment?: number | string | null;
  balanceDueDate?: string | null;
}

export interface OrderPreview {
  id: number;
  orderNumber: string;
  customerId?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  status?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  deliveryMethod?: string | null;
  totalAmount?: number | string | null;
  itemCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deliverAddress?: OrderDetail['deliverAddress'];
}

export interface OrderSearchParams {
  id?: number;
  orderNumber?: string;
  customerId?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryMethod?: string;
  minTotalAmount?: number | string;
  maxTotalAmount?: number | string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface OrderUpdateRequest {
  status?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  deliveryInstructions?: string;
  notes?: string;
}

export interface OrderCancelRequest {
  reason: string;
}

export interface CustomerSearchParams extends UserSearchParams {}
export type CustomerPreview = UserPreview;
