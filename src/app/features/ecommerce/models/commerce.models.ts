export type VoucherStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'EXHAUSTED';

export interface Voucher {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  discountType: string;
  discountValue: number | string;
  minOrderAmount?: number | string | null;
  maxDiscountAmount?: number | string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  usageCount?: number | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  status?: string | null;
  isUserSpecific?: boolean | null;
  hasProductRestrictions?: boolean | null;
}

export interface CreateVoucherRequest {
  code: string;
  name: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  assignedUserId?: number | null;
}

export interface UpdateVoucherRequest {
  name?: string | null;
  description?: string | null;
  status?: string | null;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
}

export interface VoucherValidation {
  isValid: boolean;
  voucher?: Voucher | null;
  discountAmount?: number | string | null;
  error?: string | null;
}

export interface CartVoucherValidation extends VoucherValidation {
  code: string;
  cartSubtotal?: number | string | null;
  freeDelivery?: boolean | null;
}

export interface VoucherSearchParams {
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface PaymentSearchResult {
  id: number;
  orderId?: number | null;
  orderNumber?: string | null;
  mpesaReceiptNumber?: string | null;
  mpesaTransactionId?: string | null;
  amount?: number | string | null;
  phoneNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  initiatedAt?: string | null;
  completedAt?: string | null;
  isAssociatedWithOrder?: boolean | null;
}

export interface PaymentStatus {
  id: number;
  orderId?: number | null;
  orderNumber?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  transactionMerchantId?: string | null;
  mpesaReceiptNumber?: string | null;
  amount?: number | string | null;
  retryCount?: number | null;
  failureReason?: string | null;
  initiatedAt?: string | null;
  completedAt?: string | null;
}

export interface PaymentSearchParams {
  id?: number;
  mpesaReceiptNumber?: string;
  phoneNumber?: string;
  minAmount?: number | string;
  maxAmount?: number | string;
  paymentStatus?: string;
  paymentMethod?: string;
  createdFrom?: string;
  createdTo?: string;
  completedFrom?: string;
  completedTo?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

export interface MarkCashCollectedRequest {
  amountCollected: number;
  changeGiven?: number | null;
  notes?: string | null;
}

export interface MarkMpesaCollectedRequest {
  paymentId?: number | null;
  mpesaReceiptNumber?: string | null;
  mpesaTransactionId?: string | null;
  phoneNumberUsed?: string | null;
}

export interface PartialPaymentPolicy {
  id: number;
  name: string;
  description?: string | null;
  customerGroupId?: number | null;
  customerGroupName?: string | null;
  productGroupId?: number | null;
  productGroupName?: string | null;
  minDownPaymentPercent?: number | string | null;
  balanceDueDays?: number | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreatePartialPaymentPolicyRequest {
  name: string;
  description?: string | null;
  customerGroupId?: number | null;
  productGroupId?: number | null;
  minDownPaymentPercent: number;
  balanceDueDays: number;
}

export interface UpdatePartialPaymentPolicyRequest {
  name?: string | null;
  description?: string | null;
  minDownPaymentPercent?: number | null;
  balanceDueDays?: number | null;
  isActive?: boolean | null;
}

export interface PartialPaymentEligibilityRequest {
  customerId: number;
  productIds: number[];
}

export interface PartialPaymentEligibility {
  eligible: boolean;
  bestPolicy?: PartialPaymentPolicy | null;
  minDownPaymentAmount?: number | string | null;
  orderTotal?: number | string | null;
  eligibleProductIds?: number[] | null;
  ineligibleProductIds?: number[] | null;
}

export interface RecordPartialPaymentRequest {
  method: string;
  amount: number;
  amountCollected?: number | null;
  changeGiven?: number | null;
  mpesaPaymentId?: number | null;
  mpesaReceiptNumber?: string | null;
  phoneNumberUsed?: string | null;
  notes?: string | null;
}

export interface DeliveryAddressPreview {
  id: number;
  addressNickname?: string | null;
  fullAddress?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  isDefault?: boolean | null;
  isVerified?: boolean | null;
  isTenantResidence?: boolean | null;
  buildingId?: number | null;
  buildingName?: string | null;
  unitNumber?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lastVerifiedAt?: string | null;
  createdAt?: string | null;
}

export interface DeliveryAddressDetail extends DeliveryAddressPreview {
  userId?: number | null;
  addressLine1?: string | null;
  town?: string | null;
  county?: string | null;
  landmark?: string | null;
  placeId?: string | null;
  deliveryNote?: string | null;
  verifiedByUserId?: number | null;
  verifiedByName?: string | null;
  updatedAt?: string | null;
}

export interface DeliveryAddressUpsertRequest {
  buildingId?: number | null;
  unitNumber?: string | null;
  isTenantResidence?: boolean | null;
  addressLine1: string;
  town?: string | null;
  city?: string | null;
  county?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  addressNickname?: string | null;
  contactPhone?: string | null;
  deliveryNote?: string | null;
  isDefault?: boolean | null;
}

/** M-Pesa requires 254XXXXXXXXX — normalise before submitting. */
export function normalizeMpesaPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) {
    return digits;
  }

  if (digits.startsWith('0')) {
    return `254${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `254${digits}`;
  }

  return digits;
}
