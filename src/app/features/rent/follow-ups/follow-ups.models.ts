/** Mirrors the backend's FollowUpDtos. Money arrives as a number or a string (BigDecimal). */

export type FollowUpChannel = 'CALL' | 'SMS' | 'WHATSAPP' | 'EMAIL' | 'VISIT' | 'NOTE';
export type FollowUpOutcome = 'REACHED' | 'NO_ANSWER' | 'REFUSED' | 'DISPUTED' | 'PROMISED';
export type PromiseStatus = 'OPEN' | 'KEPT' | 'PARTLY_KEPT' | 'BROKEN' | 'CANCELLED';

export interface FollowUp {
  id: number;
  agencyId: number;
  buildingId: number;
  buildingName?: string | null;
  tenantId: number;
  tenantName?: string | null;
  tenantPhone?: string | null;
  roomName?: string | null;
  channel: FollowUpChannel;
  outcome: FollowUpOutcome;
  notes?: string | null;
  contactedAt: string;
  promisedAmount?: number | string | null;
  promisedDate?: string | null;
  promiseStatus?: PromiseStatus | null;
  amountPaidByDate?: number | string | null;
  settledAt?: string | null;
  /** Owed now across every unsettled month: rent, late fees and charges. */
  owedNow?: number | string | null;
  recordedByName?: string | null;
}

export interface FollowUpCreateRequest {
  tenantId: number;
  channel: FollowUpChannel;
  outcome: FollowUpOutcome;
  notes?: string | null;
  contactedAt?: string | null;
  promisedAmount?: number | null;
  promisedDate?: string | null;
}

export interface FollowUpSearchParams {
  buildingId?: number | null;
  tenantId?: number | null;
  promiseStatus?: PromiseStatus | null;
  promisesOnly?: boolean | null;
  dueFrom?: string | null;
  dueTo?: string | null;
  page?: number;
  size?: number;
  sort?: string[];
}

export interface FollowUpSummary {
  open: number;
  openAmount: number | string;
  dueNow: number;
  dueNowAmount: number | string;
  kept: number;
  partlyKept: number;
  broken: number;
  keptRate?: number | null;
}

/** A tenant's latest contact and open promise, for the arrears list. */
export interface TenantFollowUpState {
  tenantId: number;
  lastContactedAt?: string | null;
  lastChannel?: FollowUpChannel | null;
  lastOutcome?: FollowUpOutcome | null;
  promisedAmount?: number | string | null;
  promisedDate?: string | null;
  promiseStatus?: PromiseStatus | null;
}

export const FOLLOW_UP_CHANNELS: { value: FollowUpChannel; label: string; verb: string }[] = [
  { value: 'CALL', label: 'Phone call', verb: 'Called' },
  { value: 'SMS', label: 'SMS', verb: 'Texted' },
  { value: 'WHATSAPP', label: 'WhatsApp', verb: 'WhatsApp' },
  { value: 'VISIT', label: 'Visit', verb: 'Visited' },
  { value: 'EMAIL', label: 'Email', verb: 'Emailed' },
  { value: 'NOTE', label: 'Note only', verb: 'Note' }
];

export const FOLLOW_UP_OUTCOMES: { value: FollowUpOutcome; label: string }[] = [
  { value: 'PROMISED', label: 'Promised to pay' },
  { value: 'REACHED', label: 'Spoke, no promise' },
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'REFUSED', label: 'Refused to pay' },
  { value: 'DISPUTED', label: 'Disputes the amount' }
];

export const CHANNEL_LABELS = Object.fromEntries(FOLLOW_UP_CHANNELS.map((c) => [c.value, c.label])) as Record<FollowUpChannel, string>;
export const CHANNEL_VERBS = Object.fromEntries(FOLLOW_UP_CHANNELS.map((c) => [c.value, c.verb])) as Record<FollowUpChannel, string>;
export const OUTCOME_LABELS = Object.fromEntries(FOLLOW_UP_OUTCOMES.map((o) => [o.value, o.label])) as Record<FollowUpOutcome, string>;

export const PROMISE_STATUS: Record<PromiseStatus, { label: string; tone: string }> = {
  OPEN: { label: 'Promised', tone: 'info' },
  KEPT: { label: 'Kept', tone: 'success' },
  PARTLY_KEPT: { label: 'Partly kept', tone: 'warning' },
  BROKEN: { label: 'Broken', tone: 'danger' },
  CANCELLED: { label: 'Called off', tone: 'neutral' }
};
