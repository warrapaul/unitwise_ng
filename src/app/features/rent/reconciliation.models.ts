import { RentPaymentMethod } from './models/rent.models';

/** Mirrors the backend's RentReconciliationDtos. */

export type ReceivedPaymentStatus = 'UNMATCHED' | 'MATCHED' | 'CONFIRMED' | 'DISCARDED';

export interface RecordReceivedRequest {
  message?: string | null;
  referenceNumber?: string | null;
  amount?: number | null;
  paidOn?: string | null;
  paymentMethod?: RentPaymentMethod | null;
  buildingId?: number | null;
  note?: string | null;
}

export interface ClaimSummary {
  submissionId: number;
  tenantId: number;
  tenantName?: string | null;
  roomName?: string | null;
  buildingId: number;
  buildingName?: string | null;
  amount: number | string;
  paymentForMonth: string;
  paidOn?: string | null;
  referenceNumber?: string | null;
  /** False: the reference matches but the amount does not — never matched automatically. */
  amountMatches: boolean;
}

export interface ReceivedPayment {
  id: number;
  agencyId: number;
  buildingId?: number | null;
  source: 'PASTED_MESSAGE' | 'MANUAL_ENTRY' | 'MPESA_C2B';
  paymentMethod: RentPaymentMethod;
  referenceNumber: string;
  amount: number | string;
  paidOn?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  accountReference?: string | null;
  rawMessage?: string | null;
  note?: string | null;
  status: ReceivedPaymentStatus;
  match?: ClaimSummary | null;
  discrepancies?: ClaimSummary[] | null;
  /** The tenant of the room the payer's account number names, when it names one in this agency. */
  suggestion?: TenantSuggestion | null;
  rentPaymentId?: number | null;
  recordedByName?: string | null;
  recordedAt?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
  discardReason?: string | null;
}

export interface TenantSuggestion {
  tenantId: number;
  tenantName?: string | null;
  buildingId: number;
  buildingName?: string | null;
  roomName?: string | null;
  accountReference?: string | null;
}

export interface ReceivedCounts {
  matched: number;
  unmatched: number;
}
