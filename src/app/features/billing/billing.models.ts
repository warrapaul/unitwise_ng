import { formatMoney } from '../../shared/utils/format.util';
import { MONEY_LOCALE, formatCurrency } from '../../shared/utils/format.util';
/** Mirrors the backend's BillingDtos and BillingInvoiceDtos. Money arrives as numbers or strings (BigDecimal). */

export type Money = number | string;

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';
export type PriceSource = 'PLAN' | 'CUSTOM';
export type PricingMode = 'FREE' | 'BASE_ONLY' | 'PER_ROOM' | 'BASE_PLUS_PER_ROOM' | 'BASE_INCLUDED_EXTRA';
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';
export type EtimsStatus = 'NOT_REQUIRED' | 'PENDING' | 'SUBMITTED' | 'FAILED';
export type PaymentMethod = 'MPESA_STK' | 'MPESA_PAYBILL' | 'BANK_TRANSFER' | 'CASH' | 'MANUAL';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'UNMATCHED';
export type OverrideKind = 'FEATURE' | 'LIMIT';
export type OverrideSource = 'CUSTOM' | 'PILOT' | 'ADDON';

// ── Plans ────────────────────────────────────────────────────────────────────

export interface BillingPlan {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  baseFee: Money;
  includedRooms: number;
  extraRoomPrice: Money;
  currency?: string | null;
  pricingMode?: PricingMode | null;
  trialDays?: number | null;
  publicPlan?: boolean | null;
  active?: boolean | null;
  sortOrder?: number | null;
  features?: string[] | null;
  /** Caps by limit key; a missing key is unlimited. */
  limits?: Record<string, number> | null;
}

export interface BillingPlanRequest {
  code: string;
  name: string;
  description?: string | null;
  baseFee: number;
  includedRooms: number;
  extraRoomPrice: number;
  trialDays?: number | null;
  publicPlan?: boolean;
  active?: boolean;
  sortOrder?: number | null;
  features: string[];
  limits: Record<string, number>;
}

export interface BillingCatalog {
  features: string[];
  limits: string[];
}

// ── Subscription and summary ─────────────────────────────────────────────────

export interface Subscription {
  agencyId: number;
  planId: number;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  /** What access the agency has right now, worked out from the dates. */
  effectiveStatus: SubscriptionStatus;
  baseFee: Money;
  includedRooms: number;
  extraRoomPrice: Money;
  currency?: string | null;
  priceSource: PriceSource;
  pricingMode: PricingMode;
  trialEndsAt?: string | null;
  billingStartsOn?: string | null;
  billedThrough?: string | null;
  paymentOverdueSince?: string | null;
  graceDays?: number | null;
  canceledAt?: string | null;
  notes?: string | null;
  /** The plan before a change made this month; days before priceChangedOn are charged at its price. */
  priorPlanName?: string | null;
  priceChangedOn?: string | null;
  /** A downgrade waiting for scheduledFrom. */
  scheduledPlanId?: number | null;
  scheduledPlanName?: string | null;
  scheduledFrom?: string | null;
}

export interface LimitUsage {
  key: string;
  /** Null means unlimited. */
  limit: number | null;
  used: number;
}

export interface PriceLine {
  type: 'PLAN_BASE' | 'ROOMS';
  description: string;
  quantity: number;
  unitPrice: Money;
  amount: Money;
}

export interface Estimate {
  periodStart: string;
  periodEnd: string;
  billableRooms: number;
  lines: PriceLine[];
  total: Money;
  currency?: string | null;
}

export interface BillingSummary {
  subscription: Subscription;
  features: string[];
  limits: LimitUsage[];
  currentMonthEstimate?: Estimate | null;
  outstandingBalance: Money;
  creditBalance: Money;
  /** Paybill account for paying ahead without naming an invoice. */
  paybillAccount?: string | null;
  /** The platform's paybill (or till, when buyGoods) number. */
  paybillNumber?: string | null;
  buyGoods?: boolean;
  /** VAT as a fraction: 0 while the platform is not VAT registered. */
  vatRate?: Money | null;
}

// ── Changing plan ────────────────────────────────────────────────────────────

export type SwitchTiming = 'NOW' | 'NEXT_MONTH' | 'AFTER_TRIAL';

export interface LimitProblem { key: string; used: number; limit: number; }

/** A plan the agency could move to, priced at its own room count. */
export interface PlanOption {
  plan: BillingPlan;
  current: boolean;
  monthlyAtCurrentRooms: Money;
  /** monthlyAtCurrentRooms minus what the agency pays now. */
  difference: Money;
  billableRooms: number;
  timing: SwitchTiming;
  effectiveOn: string;
  billingStartsOn?: string | null;
  /** This month's total with the change, for one that applies now. */
  thisMonthEstimate?: Money | null;
  featuresGained: string[];
  featuresLost: string[];
  limitProblems: LimitProblem[];
  /** The agency's price was agreed: it asks instead. */
  requiresRequest: boolean;
  blockedReason?: string | null;
}

// ── Platform overview ────────────────────────────────────────────────────────

export interface OverviewAgency {
  agencyId: number;
  agencyName: string;
  planName: string;
  effectiveStatus: SubscriptionStatus;
  outstanding: Money;
  overdueSince?: string | null;
  trialEndsAt?: string | null;
}

export interface BillingOverview {
  mrr: Money;
  receivedThisMonth: Money;
  outstanding: Money;
  currency?: string | null;
  agenciesByStatus: Partial<Record<SubscriptionStatus, number>>;
  overdue: OverviewAgency[];
  trials: OverviewAgency[];
  paymentReportsWaiting: number;
  planRequestsWaiting: number;
  unmatchedPayments: number;
}

export interface PendingCounts { paymentReports: number; planRequests: number; unmatchedPayments: number; total: number; }

/** One entry of a plan's audit trail. `changes` is JSON: { field: { from, to } }. */
export interface PlanHistoryEntry {
  id: number;
  occurredAt: string;
  action: string;
  actorLabel?: string | null;
  summary?: string | null;
  changes?: string | null;
}

export interface SubscriptionUpdateRequest {
  planId: number;
  /** All three given: a custom price for this agency. All three empty: the plan's price. */
  baseFee?: number | null;
  includedRooms?: number | null;
  extraRoomPrice?: number | null;
  graceDays?: number | null;
  notes?: string | null;
}

// ── Overrides ────────────────────────────────────────────────────────────────

export interface EntitlementOverride {
  id: number;
  entitlementKey: string;
  kind: OverrideKind;
  featureEnabled?: boolean | null;
  limitValue?: number | null;
  source: OverrideSource;
  startsAt?: string | null;
  expiresAt?: string | null;
  active: boolean;
  reason: string;
  createdBy?: string | null;
  createdAt?: string | null;
}

export interface OverrideRequest {
  entitlementKey: string;
  kind: OverrideKind;
  featureEnabled?: boolean | null;
  limitValue?: number | null;
  source: OverrideSource;
  startsAt?: string | null;
  expiresAt?: string | null;
  reason: string;
}

// ── Invoices and payments ────────────────────────────────────────────────────

export interface InvoiceLine {
  lineNo: number;
  lineType: 'PLAN_BASE' | 'ROOMS';
  description: string;
  quantity: number;
  unitPrice: Money;
  amount: Money;
  taxCode?: string | null;
  taxRate?: Money | null;
  taxAmount?: Money | null;
}

export interface BillingPayment {
  id: number;
  agencyId?: number | null;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Negative on a reversal. */
  amount: Money;
  currency?: string | null;
  providerReference?: string | null;
  accountReference?: string | null;
  payerPhone?: string | null;
  payerName?: string | null;
  paidAt?: string | null;
  reversalOfId?: number | null;
  failureReason?: string | null;
  notes?: string | null;
  /** On a single invoice: how much of this payment went to it. */
  appliedAmount?: Money | null;
  createdBy?: string | null;
  createdAt?: string | null;
}

export interface BillingInvoice {
  id: number;
  agencyId: number;
  /** Also the paybill account number. */
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  overdue: boolean;
  currency?: string | null;
  subtotal: Money;
  taxTotal: Money;
  total: Money;
  amountPaid: Money;
  balance: Money;
  planCode?: string | null;
  billableRooms?: number | null;
  issuedAt?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  etimsStatus?: EtimsStatus | null;
  lines?: InvoiceLine[] | null;
  payments?: BillingPayment[] | null;
}

export interface TillInstructions {
  method?: string | null;
  payableNumber?: string | null;
  accountReference?: string | null;
  amount?: Money | null;
  businessName?: string | null;
  steps?: string[] | null;
  reason?: string | null;
}

export interface PayResponse {
  promptSent: boolean;
  message?: string | null;
  paymentId?: number | null;
  checkoutRequestId?: string | null;
  amount?: Money | null;
  instructions?: TillInstructions | null;
}

export interface RecordPaymentRequest {
  invoiceId?: number | null;
  method: PaymentMethod;
  amount: number;
  reference: string;
  /** ISO local date-time, not in the future. */
  paidAt: string;
  notes: string;
}

export interface GenerateResult {
  issued: BillingInvoice[];
  freeMonths: number;
}

// ── Labels ───────────────────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: 'Free trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment overdue',
  SUSPENDED: 'Suspended',
  CANCELED: 'Canceled'
};

export const SUBSCRIPTION_STATUS_TONES: Record<SubscriptionStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  TRIALING: 'info',
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  SUSPENDED: 'danger',
  CANCELED: 'neutral'
};

/** The five ways a price can be set; all are the same three numbers underneath. */
export const PRICING_MODES: { mode: PricingMode; label: string; hint: string }[] = [
  { mode: 'FREE', label: 'Free', hint: 'Nothing to pay.' },
  { mode: 'BASE_ONLY', label: 'Base fee only', hint: 'A flat monthly fee, whatever the room count.' },
  { mode: 'PER_ROOM', label: 'Per room', hint: 'Every room at the same monthly price.' },
  { mode: 'BASE_PLUS_PER_ROOM', label: 'Base fee + per room', hint: 'A monthly fee plus every room.' },
  { mode: 'BASE_INCLUDED_EXTRA', label: 'Base fee, included rooms + extra', hint: 'A fee covering some rooms, and a price for each room beyond them.' }
];

export const PRICING_MODE_LABELS = Object.fromEntries(PRICING_MODES.map((m) => [m.mode, m.label])) as Record<PricingMode, string>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MPESA_STK: 'M-Pesa prompt',
  MPESA_PAYBILL: 'M-Pesa paybill',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
  MANUAL: 'Manual'
};

/** Feature codes and limit keys as people read them; an unknown code shows as itself. */
export const FEATURE_LABELS: Record<string, string> = {
  MPESA_COLLECTION: 'M-Pesa rent collection',
  TENANT_VERIFICATION: 'Tenant verification',
  MAINTENANCE: 'Maintenance requests',
  CHAT: 'Chat with tenants',
  DASHBOARD_REPORTS: 'Dashboard and reports'
};

/** What each feature does, in a line: shown where a plan is chosen or edited. */
export const FEATURE_DESCRIPTIONS: Record<string, string> = {
  MPESA_COLLECTION: 'Tenants pay rent by M-Pesa prompt and payments match themselves.',
  TENANT_VERIFICATION: 'Check tenants\' identity and documents before they move in.',
  MAINTENANCE: 'Tenants report repairs; staff track them to done.',
  CHAT: 'Message tenants in the app.',
  DASHBOARD_REPORTS: 'Rent, arrears and occupancy reports.'
};

export const LIMIT_LABELS: Record<string, string> = {
  BUILDINGS: 'Buildings',
  ROOMS: 'Rooms',
  ADMINS: 'Admins'
};

export function featureLabel(code: string): string {
  return FEATURE_LABELS[code] ?? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function limitLabel(key: string): string {
  return LIMIT_LABELS[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** The three price numbers a mode implies, keeping what still applies from the current values. */
export function priceForMode(mode: PricingMode, current: { baseFee: number; includedRooms: number; extraRoomPrice: number }) {
  switch (mode) {
    case 'FREE': return { baseFee: 0, includedRooms: 0, extraRoomPrice: 0 };
    case 'BASE_ONLY': return { baseFee: current.baseFee, includedRooms: 0, extraRoomPrice: 0 };
    case 'PER_ROOM': return { baseFee: 0, includedRooms: 0, extraRoomPrice: current.extraRoomPrice };
    case 'BASE_PLUS_PER_ROOM': return { baseFee: current.baseFee, includedRooms: 0, extraRoomPrice: current.extraRoomPrice };
    case 'BASE_INCLUDED_EXTRA': return { baseFee: current.baseFee, includedRooms: Math.max(current.includedRooms, 1), extraRoomPrice: current.extraRoomPrice };
  }
}

/** Which fields a mode asks for. */
export function modeFields(mode: PricingMode): { base: boolean; included: boolean; extra: boolean } {
  return {
    base: mode === 'BASE_ONLY' || mode === 'BASE_PLUS_PER_ROOM' || mode === 'BASE_INCLUDED_EXTRA',
    included: mode === 'BASE_INCLUDED_EXTRA',
    extra: mode === 'PER_ROOM' || mode === 'BASE_PLUS_PER_ROOM' || mode === 'BASE_INCLUDED_EXTRA'
  };
}

/** "KES 15,000 a month", "KES 100 per room a month", … — the price in words. */
export function describePrice(p: { baseFee: Money; includedRooms: number; extraRoomPrice: Money; currency?: string | null }): string {
  const cur = p.currency || 'KES';
  const base = Number(p.baseFee) || 0;
  const extra = Number(p.extraRoomPrice) || 0;
  const money = (v: number) => formatMoney(v, cur);
  if (!base && !extra) return 'Free';
  if (!extra) return `${money(base)} a month`;
  if (!base) return `${money(extra)} per room a month`;
  if (p.includedRooms > 0) return `${money(base)} a month for ${p.includedRooms} rooms, then ${money(extra)} per extra room`;
  return `${money(base)} a month + ${money(extra)} per room`;
}

/** Money on billing pages: shillings with cents when there are any (VAT can leave some). */
export function kes(value: Money | null | undefined): string {
  return formatCurrency(value);
}

// ── Requests: payment reports and plan changes ──────────────────────────────

export type ReportStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type PlanRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';

/** An agency saying it paid the platform, waiting for (or past) the super admin's review. */
export interface PaymentReport {
  id: number;
  agencyId: number;
  agencyName?: string | null;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  method: PaymentMethod;
  amount: Money;
  reference: string;
  paidAt: string;
  message?: string | null;
  note?: string | null;
  status: ReportStatus;
  /** A payment with this reference already reached the platform. */
  alreadyReceived: boolean;
  paymentId?: number | null;
  reportedByName?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string | null;
}

export interface ReportPaymentRequest {
  invoiceId?: number | null;
  method?: PaymentMethod | null;
  amount?: number | null;
  reference?: string | null;
  paidAt?: string | null;
  message?: string | null;
  note?: string | null;
}

export interface PlanRequest {
  id: number;
  agencyId: number;
  agencyName?: string | null;
  planId: number;
  planName: string;
  planCode: string;
  fromPlanName?: string | null;
  note?: string | null;
  status: PlanRequestStatus;
  requestedByName?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string | null;
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  SUBMITTED: 'Waiting for review', APPROVED: 'Confirmed', REJECTED: 'Not accepted', WITHDRAWN: 'Withdrawn'
};
export const REPORT_STATUS_TONES: Record<ReportStatus, string> = {
  SUBMITTED: 'warning', APPROVED: 'success', REJECTED: 'danger', WITHDRAWN: 'neutral'
};
export const PLAN_REQUEST_STATUS_LABELS: Record<PlanRequestStatus, string> = {
  PENDING: 'Waiting for approval', APPROVED: 'Approved', DECLINED: 'Declined', WITHDRAWN: 'Withdrawn'
};
export const PLAN_REQUEST_STATUS_TONES: Record<PlanRequestStatus, string> = {
  PENDING: 'warning', APPROVED: 'success', DECLINED: 'danger', WITHDRAWN: 'neutral'
};

/** "1–30 Nov 2026" inside one month, "28 Oct – 3 Nov 2026" across two: the one way billing writes a period. */
export function periodLabel(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) {
    return '-';
  }
  const a = new Date(`${start.slice(0, 10)}T00:00:00`);
  const b = new Date(`${end.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return `${start} – ${end}`;
  }
  const month = (d: Date) => d.toLocaleString('en-GB', { month: 'short' }).replace('Sept', 'Sep');
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  }
  return a.getFullYear() === b.getFullYear()
    ? `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`
    : `${a.getDate()} ${month(a)} ${a.getFullYear()} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
}

/** The plan's caps in the same words the usage card uses: "Up to 100 rooms". */
export function limitLine(key: string, value: number | null | undefined): string {
  const noun = limitLabel(key).toLowerCase();
  return value == null ? `Unlimited ${noun}` : `Up to ${value} ${value === 1 ? noun.replace(/s$/, '') : noun}`;
}
