export type RentPaymentStatus =
  | 'PENDING' | 'COMPLETED' | 'OVERPAID' | 'PARTIAL' | 'OVERDUE' | 'FAILED' | 'REFUNDED';
export type RentPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MPESA' | 'CHEQUE' | 'CARD' | 'OTHER';
export type RentTransactionStatus =
  | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'REVERSED';
export type ArrearsMonthStatus =
  | 'GENERATING' | 'PROVISIONAL' | 'AWAITING_INPUT' | 'CONFIRMED' | 'REGENERATING';
export type UtilityBillingTiming = 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE';
export type UtilityBillingType = 'FIXED' | 'METERED' | 'PER_UNIT' | 'PERCENTAGE_OF_RENT';

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

/** One payment dynamically overdue in the caller's server-authorised portfolio. */
export interface PortfolioOverduePayment {
  paymentId: number;
  agencyId: number;
  agencyName: string;
  buildingId: number;
  buildingName: string;
  tenantId: number;
  tenantName: string;
  tenantPhone: string;
  roomId: number;
  roomNumber: number;
  roomName: string;
  paymentForMonth: string;
  dueDate: string;
  amountPaid: number | string;
  totalOutstanding: number | string;
  daysOverdue: number;
  /** The persisted workflow status; lateness itself is determined from `dueDate`. */
  paymentStatus: RentPaymentStatus;
  lastRemindedAt?: string | null;
  reminderCount?: number | null;
}

export type ReminderKind = 'REMINDER' | 'WARNING';

export interface ReminderResult {
  paymentId: number;
  sent: boolean;
  /** Why it was not sent: reminded in the last 24 hours, nothing owed, no way to reach them. */
  skippedReason?: string | null;
  lastRemindedAt?: string | null;
  reminderCount?: number | null;
}

export interface PortfolioOverdueSearchParams {
  asOf?: string;
  agencyId?: number;
  buildingId?: number;
  tenantId?: number;
  roomId?: number;
  search?: string;
  page?: number;
  size?: number;
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
  /** `id` is used by the tenant self-service statement; `chargeId` by landlord reporting. */
  id?: number | null;
  chargeId?: number | null;
  name?: string | null;
  description?: string | null;
  amount?: number | string | null;
  amountPaid?: number | string | null;
  balance?: number | string | null;
  outstanding?: number | string | null;
  billingTiming?: UtilityBillingTiming | null;
  billingTimingLabel?: string | null;
  coversMonth?: string | null;
  coversMonthDisplay?: string | null;
  billedMonth?: string | null;
  billingType?: UtilityBillingType | null;
  previousReading?: number | string | null;
  currentReading?: number | string | null;
  consumption?: number | string | null;
  unitRate?: number | string | null;
  unit?: string | null;
  consumptionInfo?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  isPendingInput?: boolean | null;
  requiresPayment?: boolean | null;
  notes?: string | null;
}

export interface ArrearsOtherCharge {
  chargeId?: number | null;
  name?: string | null;
  description?: string | null;
  amount?: number | string | null;
  amountPaid?: number | string | null;
  outstanding?: number | string | null;
  reason?: string | null;
  status?: string | null;
  requiresPayment?: boolean | null;
  chargeDate?: string | null;
  coversMonth?: string | null;
  billedMonth?: string | null;
  notes?: string | null;
}

/** A single tenant's full bill for one month. */
export interface TenantArrearsDetail {
  tenantId?: number | null;
  tenantName?: string | null;
  roomName?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  month?: string | null;
  monthDisplay?: string | null;
  isProvisional?: boolean | null;
  isConfirmed?: boolean | null;
  dueDate?: string | null;
  baseRent?: number | string | null;
  amountPaid?: number | string | null;
  carryForward?: number | string | null;
  rentBalance?: number | string | null;
  lateFee?: number | string | null;
  creditApplied?: number | string | null;
  charges?: ArrearsUtilityCharge[] | null;
  totalCharges?: number | string | null;
  totalWaived?: number | string | null;
  totalOutstanding?: number | string | null;
  adjustments?: AdjustmentDetail[] | null;
  paymentStatus?: string | null;
}

/** Landlord reporting breakdown. This is deliberately separate from the newer
 * tenant self-service statement, whose totals and charge shape differ. */
export interface ArrearsReportingDetail {
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
  /**
   * Whether this month's rent record exists. False on an occupied room means
   * generation has not run for it yet — its zero figures are absence, not a
   * settled balance, and must not be shown as one.
   */
  rentRecordGenerated?: boolean | null;
  /** This month's rent record, on occupied rows. */
  rentPaymentId?: number | null;
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
  tenantId?: number | null;
  name: string;
  description?: string | null;
  billingType?: UtilityBillingType | null;
  billingTiming?: UtilityBillingTiming | null;
  fixedAmount?: number | string | null;
  unitRate?: number | string | null;
  percentage?: number | string | null;
  unit?: string | null;
  meterNumber?: string | null;
  includedInRent?: boolean | null;
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
  meterNumber?: string | null;
  includedInRent?: boolean | null;
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
  tenantIds?: number[] | null;
  coversMonth?: string | null;
  billingTiming?: UtilityBillingTiming | null;
  consumption?: number | null;
  amount?: number | null;
  chargeName: string;
}

export interface MeterReadingSubmissionRequest {
  perTenantReadings?: MeterReadingRequest[] | null;
  uniformReading?: UniformReadingRequest | null;
}

export interface RentMpesaInitiateRequest {
  month?: string | null;
  amount?: number | null;
}

export interface MpesaTillInstructions {
  method?: string | null;
  payableNumber?: string | null;
  accountReference?: string | null;
  amount?: number | string | null;
  businessName?: string | null;
  steps?: string[] | null;
  reason?: string | null;
}

export interface RentMpesaCheckout {
  outcome?: 'STK_PUSH_SENT' | 'PAY_BY_HAND' | string | null;
  message?: string | null;
  rentMpesaPaymentId?: number | null;
  checkoutRequestId?: string | null;
  tillInstructions?: MpesaTillInstructions | null;
}

export interface RentMpesaPaymentStatus {
  rentMpesaPaymentId?: number | null;
  checkoutRequestId?: string | null;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string | null;
  settled?: boolean | null;
  amount?: number | string | null;
  message?: string | null;
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
  roomId?: number | null;
  roomNumber?: number | null;
  buildingId?: number | null;
  roomName?: string | null;
  chargeName?: string | null;
  coversMonth?: string | null;
  previousReading?: number | string | null;
  unitRate?: number | string | null;
  billingTiming?: UtilityBillingTiming | null;
  unit?: string | null;
}

export const RENT_PAYMENT_SORTABLE_FIELDS = ['paymentForMonth', 'dueDate', 'amountPaid', 'createdAt'] as const;

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

// --- Deposits: a ledger of their own, never part of rent, arrears or credit ---

export type DepositStatus = 'PENDING' | 'HELD' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FORFEITED';
export type DepositTransactionType = 'RECEIPT' | 'REFUND' | 'DEDUCTION';

export interface DepositTransaction {
  id: number;
  type: DepositTransactionType;
  amount: number | string;
  transactionDate?: string | null;
  paymentMethod?: RentPaymentMethod | null;
  referenceNumber?: string | null;
  /** Why an amount was kept — deductions only. */
  reason?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

export interface TenantDeposit {
  id: number;
  tenantId: number;
  tenantName?: string | null;
  roomId?: number | null;
  roomName?: string | null;
  buildingId?: number | null;
  agencyId?: number | null;
  expectedAmount?: number | string | null;
  amountReceived?: number | string | null;
  amountRefunded?: number | string | null;
  amountDeducted?: number | string | null;
  heldAmount?: number | string | null;
  balanceDue?: number | string | null;
  status: DepositStatus;
  /** Money still held for a tenant who has left the room. */
  awaitingRefund?: boolean;
  notes?: string | null;
  createdAt?: string | null;
  settledAt?: string | null;
  transactions?: DepositTransaction[] | null;
}

export interface DepositReceiptRequest {
  amount: number;
  transactionDate?: string | null;
  paymentMethod: RentPaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
}

export interface CreateDepositRequest {
  /** Blank: the lease's deposit, else the room → building → agency terms. */
  expectedAmount?: number | null;
  notes?: string | null;
  initialReceipt?: DepositReceiptRequest | null;
}

export interface DepositDeduction {
  reason: string;
  amount: number;
}

export interface DepositRefundRequest {
  refundAmount: number;
  deductions?: DepositDeduction[] | null;
  paymentMethod?: RentPaymentMethod | null;
  referenceNumber?: string | null;
  transactionDate?: string | null;
  notes?: string | null;
}

/** Rent paid while the tenant is being created — saved with them, or not at all. */
export interface InitialRentPayment {
  amountPaid: number;
  paymentForMonth?: string | null;
  paymentDate?: string | null;
  paymentMethod: RentPaymentMethod;
  receiptNumber?: string | null;
  notes?: string | null;
}
