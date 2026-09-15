export type RentPaymentStatus =
  | 'PENDING' | 'COMPLETED' | 'OVERPAID' | 'PARTIAL' | 'OVERDUE' | 'FAILED' | 'REFUNDED';
export type RentPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MPESA' | 'CHEQUE' | 'CARD' | 'OTHER';
export type RentTransactionStatus =
  | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'REVERSED';
export type ArrearsMonthStatus =
  | 'GENERATING' | 'PROVISIONAL' | 'AWAITING_INPUT' | 'CONFIRMED' | 'REGENERATING';
export type UtilityBillingTiming = 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE';
export type UtilityBillingType = 'FIXED' | 'METERED' | 'PER_UNIT';

export interface RentPaymentTransaction {
  id: number;
  rentPaymentId?: number | null;
  receiptNumber?: string | null;
  amount?: number | string | null;
  transactionDate?: string | null;
  referenceNumber?: string | null;
  paymentMethod?: RentPaymentMethod | null;
  status?: RentTransactionStatus | null;
  notes?: string | null;
  createdAt?: string | null;
}

export interface RentPaymentPreview {
  id: number;
  receiptNumber?: string | null;
  tenantId?: number | null;
  tenantName?: string | null;
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  amountPaid?: number | string | null;
  paymentDate?: string | null;
  paymentForMonth?: string | null;
  paymentMethod?: RentPaymentMethod | null;
  status?: string | null;
  createdAt?: string | null;
}

export interface RentPaymentDetail extends RentPaymentPreview {
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  expectedAmount?: number | string | null;
  carryForwardAmount?: number | string | null;
  dueDate?: string | null;
  lateFee?: number | string | null;
  notes?: string | null;
  transactionCount?: number | null;
  transactions?: RentPaymentTransaction[] | null;
  updatedAt?: string | null;
}

export interface CreateRentPaymentRequest {
  tenantId: number;
  amountPaid: number;
  paymentDate: string;
  paymentForMonth: string;
  paymentMethod: RentPaymentMethod;
  lateFee?: number | null;
  receiptNumber?: string | null;
  notes?: string | null;
}

export interface UpdateRentPaymentRequest {
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentMethod?: RentPaymentMethod | null;
  status?: RentPaymentStatus | null;
  lateFee?: number | null;
  receiptNumber?: string | null;
  notes?: string | null;
}

export interface RentPaymentSearchParams {
  receiptNumber?: string;
  tenantName?: string;
  roomNumber?: number;
  roomName?: string;
  status?: string;
  tenantId?: number;
  roomId?: number;
  buildingId?: number;
  paymentForMonth?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  startDate?: string;
  endDate?: string;
  transactionReferenceNumber?: string;
  paymentMethod?: string;
  transactionDateFrom?: string;
  transactionDateTo?: string;
  transactionStatus?: string;
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}

/** Expected-vs-paid preview for a month, before payments are recorded. */
export interface MonthlyPaymentRecord {
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  tenantId?: number | null;
  tenantName?: string | null;
  paymentForMonth?: string | null;
  expectedAmount?: number | string | null;
  amountPaid?: number | string | null;
  balance?: number | string | null;
  status?: string | null;
  dueDate?: string | null;
  receiptNumber?: string | null;
}

export interface RentPaymentSummary {
  buildingId?: number | null;
  month?: number | null;
  year?: number | null;
  totalExpected?: number | string | null;
  totalPaid?: number | string | null;
  totalPending?: number | string | null;
  totalOverdue?: number | string | null;
  totalLateFees?: number | string | null;
  totalPayments?: number | null;
  paidPayments?: number | null;
  pendingPayments?: number | null;
  overduePayments?: number | null;
  collectionRate?: number | string | null;
  summaryGeneratedAt?: string | null;
}

export interface ArrearsGenerationStatus {
  buildingId?: number | null;
  month?: string | null;
  activeTenants?: number | null;
  recordsGenerated?: number | null;
  isComplete?: boolean | null;
  pendingCount?: number | null;
}

export interface ArrearsMonthRecord {
  id?: number | null;
  buildingId?: number | null;
  buildingName?: string | null;
  arrearsMonth?: string | null;
  monthDisplay?: string | null;
  status?: ArrearsMonthStatus | null;
  statusLabel?: string | null;
  isProvisional?: boolean | null;
  isConfirmed?: boolean | null;
  isEditable?: boolean | null;
  totalActiveTenants?: number | null;
  recordsGenerated?: number | null;
  pendingInputCount?: number | null;
  progressMessage?: string | null;
  confirmedAt?: string | null;
  confirmedByName?: string | null;
  confirmationNotes?: string | null;
  generationStartedAt?: string | null;
  generationCompletedAt?: string | null;
}

export interface TriggerArrearsRequest {
  month: string;
  reason?: string | null;
}

export interface TriggerAcknowledgement {
  buildingId?: number | null;
  month?: string | null;
  status?: string | null;
  message?: string | null;
  triggeredBy?: string | null;
}

export interface ConfirmMonthRequest {
  notes?: string | null;
}

export interface ArrearsUtilityCharge {
  name?: string | null;
  amount?: number | string | null;
  amountPaid?: number | string | null;
  billingTiming?: UtilityBillingTiming | null;
  previousReading?: number | string | null;
  currentReading?: number | string | null;
  consumption?: number | string | null;
  unitRate?: number | string | null;
  unit?: string | null;
  status?: string | null;
}

export interface ArrearsOtherCharge {
  name?: string | null;
  amount?: number | string | null;
  amountPaid?: number | string | null;
  reason?: string | null;
}

/** A single tenant's full bill for one month. */
export interface TenantArrearsDetail {
  month?: string | null;
  monthDisplay?: string | null;
  dueDate?: string | null;
  baseRent?: number | string | null;
  rentPaid?: number | string | null;
  lateFee?: number | string | null;
  creditApplied?: number | string | null;
  utilities?: ArrearsUtilityCharge[] | null;
  totalUtilities?: number | string | null;
  utilitiesPaid?: number | string | null;
  otherCharges?: ArrearsOtherCharge[] | null;
  totalOtherCharges?: number | string | null;
  otherChargesPaid?: number | string | null;
  totalDue?: number | string | null;
  totalPaid?: number | string | null;
  paymentStatus?: string | null;
  isOverdue?: boolean | null;
}

export interface RoomPaymentStatus {
  roomId?: number | null;
  roomNumber?: number | null;
  roomName?: string | null;
  floorName?: string | null;
  isOccupied?: boolean | null;
  tenantId?: number | null;
  tenantName?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  moveInDate?: string | null;
  monthlyRent?: number | string | null;
  totalDue?: number | string | null;
  totalPaid?: number | string | null;
  outstanding?: number | string | null;
  paymentStatus?: string | null;
  dueDate?: string | null;
  isOverdue?: boolean | null;
}

export interface TenantPaymentStatus {
  tenantId?: number | null;
  tenantName?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  room?: RoomPaymentStatus | null;
  totalDueAllRooms?: number | string | null;
  totalPaidAllRooms?: number | string | null;
  totalOutstandingAllRooms?: number | string | null;
  overallPaymentStatus?: string | null;
  hasAnyOverdue?: boolean | null;
}

export interface BuildingArrearsSummary {
  totalTenants?: number | null;
  paidTenants?: number | null;
  partiallyPaidTenants?: number | null;
  overdueTenants?: number | null;
  pendingTenants?: number | null;
  totalExpected?: number | string | null;
  totalPaid?: number | string | null;
  totalOutstanding?: number | string | null;
  totalOverdue?: number | string | null;
  collectionRate?: number | string | null;
}

export interface BuildingMonthlyReport {
  buildingId?: number | null;
  buildingName?: string | null;
  month?: string | null;
  monthDisplay?: string | null;
  tenants?: TenantPaymentStatus[] | null;
  buildingSummary?: BuildingArrearsSummary | null;
}

export interface OneOffChargeRequest {
  tenantId: number;
  name: string;
  amount: number;
  reason?: string | null;
  notes?: string | null;
  billedMonth: string;
}

export interface WaiveChargeRequest {
  chargeId: number;
  reason?: string | null;
  notes?: string | null;
}

export interface AdjustChargeRequest {
  chargeId: number;
  newAmount: number;
  reason?: string | null;
  notes?: string | null;
}

export interface BulkChargeRequest {
  tenantIds: number[];
  name: string;
  amount: number;
  reason?: string | null;
  notes?: string | null;
  billedMonth: string;
}

export interface BulkWaiveRequest {
  tenantIds: number[];
  billedMonth: string;
  chargeName: string;
  reason?: string | null;
  notes?: string | null;
}

export interface BulkAdjustmentResult {
  totalRequested?: number | null;
  succeeded?: number | null;
  failed?: number | null;
  bulkReference?: string | null;
  errors?: string[] | null;
}

export interface AdjustmentDetail {
  id: number;
  adjustmentType?: string | null;
  adjustmentTypeLabel?: string | null;
  originalAmount?: number | string | null;
  adjustedAmount?: number | string | null;
  delta?: number | string | null;
  reason?: string | null;
  notes?: string | null;
  performedByName?: string | null;
  performedAt?: string | null;
  isBulk?: boolean | null;
}

export interface ChargeTemplate {
  id: number;
  buildingId?: number | null;
  roomId?: number | null;
  roomName?: string | null;
  name: string;
  description?: string | null;
  billingType?: UtilityBillingType | null;
  billingTiming?: UtilityBillingTiming | null;
  fixedAmount?: number | string | null;
  unitRate?: number | string | null;
  percentage?: number | string | null;
  unit?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
}

export interface CreateChargeTemplateRequest {
  name: string;
  description?: string | null;
  billingType: UtilityBillingType;
  billingTiming?: UtilityBillingTiming | null;
  fixedAmount?: number | null;
  unitRate?: number | null;
  percentage?: number | null;
  unit?: string | null;
  roomId?: number | null;
}

export interface UpdateChargeTemplateRequest extends Partial<Omit<CreateChargeTemplateRequest, 'roomId'>> {
  isActive?: boolean | null;
}

export interface MeterReadingRequest {
  tenantId?: number | null;
  coversMonth?: string | null;
  chargeName?: string | null;
  billingTiming?: UtilityBillingTiming | null;
  previousReading?: number | null;
  currentReading?: number | null;
  unitRate?: number | null;
  unit?: string | null;
  amount?: number | null;
}

export interface UniformReadingRequest {
  coversMonth?: string | null;
  billingTiming?: UtilityBillingTiming | null;
  consumption?: number | null;
  amount?: number | null;
  chargeName: string;
}

export interface SubsetUniformReadingRequest extends UniformReadingRequest {
  tenantIds: number[];
}

export interface BulkMeterReadingResult {
  buildingId?: number | null;
  month?: string | null;
  totalSubmitted?: number | null;
  created?: number | null;
  updated?: number | null;
  failed?: number | null;
  errors?: string[] | null;
  remainingPendingCount?: number | null;
}

export interface PendingReadingTask {
  chargeId: number;
  tenantId?: number | null;
  tenantName?: string | null;
  roomName?: string | null;
  chargeName?: string | null;
  coversMonth?: string | null;
  previousReading?: number | string | null;
  unitRate?: number | string | null;
  billingTiming?: UtilityBillingTiming | null;
  unit?: string | null;
}

export const RENT_PAYMENT_SORTABLE_FIELDS = ['paymentDate', 'paymentForMonth', 'amountPaid', 'createdAt'] as const;

/** The backend addresses arrears months as an ISO date pinned to the first of the month. */
export function toMonthPath(value: string): string {
  if (!value) {
    return value;
  }

  // Accepts "2026-08" from <input type="month"> as well as a full ISO date.
  return value.length === 7 ? `${value}-01` : value;
}

export function toMonthInput(value?: string | null): string {
  return value ? value.slice(0, 7) : '';
}
