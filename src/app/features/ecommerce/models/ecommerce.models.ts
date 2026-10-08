import { UserPreview, UserSearchParams } from '../../../features/users/models/user.models';
import {
  ProductAttribute,
  ProductDiscount,
  ProductImage,
  ProductInventory,
  ProductTag,
  ProductVariantDetail
} from './catalog.models';

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
  attributes?: ProductAttribute[] | null;
  images?: ProductImage[] | null;
  variants?: ProductVariantDetail[] | null;
  discounts?: ProductDiscount[] | null;
  tags?: ProductTag[] | null;
  inventory?: ProductInventory | null;
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
  sort?: string | string[];
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
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface StorePreview {
  id: number;
  name: string;
  code: string;
  countyId?: number | null;
  subCountyId?: number | null;
  wardId?: number | null;
  townId?: number | null;
  town?: string | null;
  ward?: string | null;
  subCounty?: string | null;
  county?: string | null;
  landmark?: string | null;
  contactPhone?: string | null;
  operatingHours?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
}

export interface StoreDetail extends StorePreview {
  /** The street/road line. */
  addressLine1?: string | null;
  estateAreaId?: number | null;
  estateArea?: string | null;
  streetRoadId?: number | null;
  streetRoad?: string | null;
  buildingHouse?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  pickupInstructions?: string | null;
  updatedAt?: string | null;
}

export interface StoreUpsertRequest {
  name: string;
  code: string;
  countyId: number;
  subCountyId?: number | null;
  wardId?: number | null;
  townId: number;
  /** The street/road line. */
  addressLine1?: string | null;
  estateAreaId?: number | null;
  estateArea?: string | null;
  streetRoadId?: number | null;
  streetRoad?: string | null;
  buildingHouse?: string | null;
  landmark?: string | null;
  contactPhone?: string | null;
  operatingHours?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  pickupInstructions?: string | null;
  isActive?: boolean;
}

export interface StoreSearchParams {
  id?: number;
  code?: string;
  name?: string;
  countyId?: number | null;
  county?: string;
  isActive?: boolean | string;
  page?: number;
  size?: number;
  sort?: string | string[];
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

export interface DeliveryAddress {
  id?: number;
  /** The registry place, when one was picked. */
  address?: import('../../addresses/models/address.models').AddressDetail | null;
  origin?: 'CUSTOMER' | 'RIDER' | 'ECOM_ADMIN' | null;
  customerConfirmed?: boolean | null;
  userId?: number | null;
  buildingId?: number | null;
  buildingName?: string | null;
  unitNumber?: string | null;
  isTenantResidence?: boolean | null;
  addressLine1?: string | null;
  town?: string | null;
  county?: string | null;
  landmark?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  placeId?: string | null;
  addressNickname?: string | null;
  contactPhone?: string | null;
  deliveryNote?: string | null;
  isDefault?: boolean | null;
  isVerified?: boolean | null;
  lastVerifiedAt?: string | null;
  verifiedByUserId?: number | null;
  verifiedByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  label?: string | null;
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
  deliverAddress?: DeliveryAddress | null;
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
  deliverAddress?: DeliveryAddress | null;
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
  sort?: string | string[];
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

/** How a customer came to exist. */
export type EcomCustomerSource = 'SELF_SERVICE' | 'ADMIN_CREATED' | 'RIDER_CREATED' | 'PHONE_ORDER';
export type EcomCustomerStatus = 'ACTIVE' | 'BLOCKED';

/** A customer as staff list them — the ecommerce profile, never the person's ID numbers. */
export interface EcomCustomerPreview {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  /** Whether the person has taken the account over by verifying their phone. */
  claimed: boolean;
  status: EcomCustomerStatus;
  source: EcomCustomerSource;
  orderCount: number;
  lastOrderAt?: string | null;
  createdAt?: string | null;
}

export interface EcomCustomerDetail extends EcomCustomerPreview {
  middleName?: string | null;
  blockedReason?: string | null;
  blockedAt?: string | null;
  payOnDeliveryAllowed: boolean;
  createdByUserId?: number | null;
  staffNotes?: string | null;
  standingDeliveryInstructions?: string | null;
  marketingSmsConsent: boolean;
  marketingEmailConsent: boolean;
  firstOrderAt?: string | null;
}

export interface EcomCustomerSearchParams {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  status?: EcomCustomerStatus | '';
  source?: EcomCustomerSource | '';
  page?: number;
  size?: number;
  sort?: string | string[];
}

/** Phone is the identity; email is optional. */
export interface EcomCustomerCreateRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phoneNumber: string;
  email?: string | null;
  /** Optional first address, saved for the customer to confirm. */
  address?: import('./commerce.models').DeliveryAddressUpsertRequest | null;
}

/**
 * What a phone number turns up. ACCOUNT_ONLY: an account holds the number but is
 * not a customer yet — its details are not shown; adding the customer links it.
 */
export interface EcomCustomerLookup {
  outcome: 'CUSTOMER' | 'ACCOUNT_ONLY' | 'NOT_FOUND';
  customer?: EcomCustomerDetail | null;
  addresses: import('./commerce.models').DeliveryAddressDetail[];
}

/** Corrections for a customer who has not claimed their account yet. */
export interface EcomCustomerDetailsUpdate {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface EcomCustomerStaffUpdate {
  staffNotes?: string | null;
  payOnDeliveryAllowed?: boolean | null;
}

export interface CartItemRequest {
  productId: number;
  variantId?: number | null;
  quantity: number;
}

export interface CartItemValidationRequest extends CartItemRequest {
  expectedUnitPrice?: number | null;
}

export interface CartValidationRequest {
  items: CartItemValidationRequest[];
  voucherCodes?: string[] | null;
  customerId?: number | null;
}

export interface CartItemValidationResult {
  productId?: number | null;
  variantId?: number | null;
  productName?: string | null;
  variantDisplayName?: string | null;
  requestedQuantity?: number | null;
  availableQuantity?: number | null;
  isValid?: boolean | null;
  errors?: string[] | null;
  productStatus?: string | null;
  currentPrice?: number | string | null;
  discountPrice?: number | string | null;
}

export interface CartValidationResult {
  isValid?: boolean | null;
  totalItems?: number | null;
  validItems?: number | null;
  invalidItems?: number | null;
  items?: CartItemValidationResult[] | null;
  errors?: string[] | null;
  cartSubtotal?: number | string | null;
  voucherResults?: unknown[] | null;
  totalVoucherDiscount?: number | string | null;
  estimatedTotal?: number | string | null;
  freeDelivery?: boolean | null;
}

export type OrderDeliveryMethod = 'HOME_DELIVERY' | 'PICK_AT_STORE';
export type OrderPaymentMethod = 'MPESA' | 'PAY_ON_DELIVERY';

export interface CreateOrderRequest {
  customerId: number;
  cartItems: CartItemRequest[];
  deliveryMethod: OrderDeliveryMethod;
  deliveryAddressId?: number | null;
  /** Free-text location when there is no saved address — the rider calls for directions. */
  deliveryLocationDescription?: string | null;
  deliveryInstructions?: string | null;
  paymentMethod: OrderPaymentMethod;
  /** M-Pesa requires 254XXXXXXXXX — normalise before submitting. */
  paymentPhoneNumber?: string | null;
  voucherCodes?: string[] | null;
  notes?: string | null;
  storeId?: number | null;
  pickupContactName?: string | null;
}
