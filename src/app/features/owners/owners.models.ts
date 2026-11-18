import { formatCurrency } from '../../shared/utils/format.util';
/** Mirrors the backend's OwnerDtos. Money arrives as a number or a string (BigDecimal). */

export type CommissionType = 'PERCENT_OF_COLLECTED' | 'FIXED_MONTHLY';
export type PayoutMethod = 'MPESA' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';
export type PayoutKind = 'PAYOUT' | 'ADVANCE';
export type StatementStatus = 'DRAFT' | 'APPROVED' | 'SENT';
export type ManagementMode = 'OWN_BUILDINGS' | 'FOR_OWNERS';

export interface OwnedBuilding {
  id: number;
  name: string;
  /** The building's own commission; null when it follows the owner's. */
  commissionType?: CommissionType | null;
  commissionValue?: number | string | null;
  /** "8% of rent collected" — whichever applies. */
  commissionLabel: string;
}

export interface PropertyOwner {
  id: number;
  agencyId: number;
  name: string;
  phoneNumber?: string | null;
  email?: string | null;
  idNumber?: string | null;
  commissionType: CommissionType;
  commissionValue: number | string;
  payoutMethod?: PayoutMethod | null;
  payoutAccount?: string | null;
  notes?: string | null;
  buildings: OwnedBuilding[];
  portalAccess: boolean;
  portalUserName?: string | null;
  createdAt?: string | null;
}

export interface OwnerSaveRequest {
  name: string;
  phoneNumber?: string | null;
  email?: string | null;
  idNumber?: string | null;
  commissionType: CommissionType;
  commissionValue: number;
  payoutMethod?: PayoutMethod | null;
  payoutAccount?: string | null;
  notes?: string | null;
}

export interface OwnerPayout {
  id: number;
  ownerId: number;
  kind: PayoutKind;
  amount: number | string;
  paidOn: string;
  method?: PayoutMethod | null;
  reference?: string | null;
  notes?: string | null;
  recordedByName?: string | null;
  createdAt?: string | null;
}

export interface OwnerPayoutRequest {
  kind: PayoutKind;
  amount: number;
  paidOn: string;
  method?: PayoutMethod | null;
  reference?: string | null;
  notes?: string | null;
}

export interface StatementBuilding {
  buildingId: number;
  name: string;
  collected: number | string;
  arrears: number | string;
  expensesByAgency: number | string;
  expensesByOwner: number | string;
  commission: number | string;
  commissionLabel: string;
  rooms?: number | null;
  occupied?: number | null;
}

/** Without an id it is a live preview; with one, the figures as saved. */
export interface OwnerStatement {
  id?: number | null;
  ownerId: number;
  ownerName: string;
  agencyName: string;
  month: string;
  status?: StatementStatus | null;
  openingBalance: number | string;
  rentCollected: number | string;
  arrears: number | string;
  expensesByAgency: number | string;
  expensesByOwner: number | string;
  commission: number | string;
  payouts: number | string;
  advances: number | string;
  closingBalance: number | string;
  buildings: StatementBuilding[];
  notes?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
}

export interface MyOwnerAccount {
  ownerId: number;
  agencyId: number;
  agencyName: string;
  name: string;
  buildingCount: number;
}

export const COMMISSION_TYPES: { value: CommissionType; label: string }[] = [
  { value: 'PERCENT_OF_COLLECTED', label: 'A share of rent collected (%)' },
  { value: 'FIXED_MONTHLY', label: 'A fixed fee each month (KES)' }
];

export const PAYOUT_METHODS: { value: PayoutMethod; label: string }[] = [
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' }
];

export const PAYOUT_METHOD_LABELS = Object.fromEntries(PAYOUT_METHODS.map((m) => [m.value, m.label])) as Record<PayoutMethod, string>;

export const STATEMENT_STATUS_LABELS: Record<StatementStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  SENT: 'Sent to owner'
};

export function commissionLabel(type: CommissionType, value: number | string): string {
  return type === 'PERCENT_OF_COLLECTED'
    ? `${Number(value)}% of rent collected`
    : `${formatCurrency(value)} a month`;
}
