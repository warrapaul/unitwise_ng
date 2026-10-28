/** Mirrors the backend's MpesaCollectionDtos: an agency's own Daraja app. Secrets go in, never come out. */

export type MpesaAccountType = 'PAYBILL' | 'TILL';
export type MpesaEnvironment = 'SANDBOX' | 'PRODUCTION';
export type MpesaAccountStatus = 'NOT_CONNECTED' | 'CONNECTED' | 'FAILED';

export interface MpesaCollectionAccount {
  id: number;
  agencyId: number;
  /** Null: the agency's own; set: an override for that building. */
  buildingId?: number | null;
  buildingName?: string | null;
  accountType: MpesaAccountType;
  shortCode: string;
  tillNumber?: string | null;
  payableNumber: string;
  environment: MpesaEnvironment;
  consumerKeyHint?: string | null;
  hasPasskey: boolean;
  status: MpesaAccountStatus;
  lastError?: string | null;
  connectedAt?: string | null;
  updatedAt?: string | null;
}

export interface MpesaCollectionUpsert {
  buildingId?: number | null;
  accountType: MpesaAccountType;
  shortCode: string;
  tillNumber?: string | null;
  environment: MpesaEnvironment;
  /** Blank on an edit keeps the stored value. */
  consumerKey?: string | null;
  consumerSecret?: string | null;
  passkey?: string | null;
}
