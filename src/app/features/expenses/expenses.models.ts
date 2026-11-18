/** Mirrors the backend's ExpenseDtos. Money arrives as a number or a string (BigDecimal). */

export type ExpenseCategory = 'REPAIRS' | 'CARETAKER' | 'WATER' | 'ELECTRICITY' | 'SECURITY' | 'CLEANING' | 'GARBAGE'
  | 'INSURANCE' | 'RATES_AND_TAXES' | 'MANAGEMENT' | 'OTHER';
export type ExpensePaidBy = 'AGENCY' | 'OWNER';
export type ExpensePaymentMethod = 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

export interface Expense {
  id: number;
  agencyId: number;
  buildingId: number;
  buildingName?: string | null;
  roomId?: number | null;
  roomName?: string | null;
  maintenanceRequestId?: number | null;
  /** "MR-104 · Leaking tap" */
  maintenanceRequestLabel?: string | null;
  category: ExpenseCategory;
  description: string;
  payee?: string | null;
  amount: number | string;
  expenseDate: string;
  paidBy: ExpensePaidBy;
  paymentMethod?: ExpensePaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
  receiptMimeType?: string | null;
  recordedByName?: string | null;
  createdAt?: string | null;
}

export interface ExpenseSaveRequest {
  roomId?: number | null;
  maintenanceRequestId?: number | null;
  category: ExpenseCategory;
  description: string;
  payee?: string | null;
  amount: number;
  expenseDate: string;
  paidBy?: ExpensePaidBy | null;
  paymentMethod?: ExpensePaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
}

export interface ExpenseSearchParams {
  buildingId?: number | null;
  category?: ExpenseCategory | null;
  from?: string | null;
  to?: string | null;
  maintenanceRequestId?: number | null;
  search?: string | null;
  page?: number;
  size?: number;
  sort?: string[];
}

export interface ExpenseSummary {
  total: number | string;
  byCategory: { category: ExpenseCategory; total: number | string }[];
}

/** In the order a landlord thinks of them: the frequent ones first. */
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'REPAIRS', label: 'Repairs' },
  { value: 'CARETAKER', label: 'Caretaker and staff' },
  { value: 'WATER', label: 'Water' },
  { value: 'ELECTRICITY', label: 'Electricity' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'GARBAGE', label: 'Garbage collection' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'RATES_AND_TAXES', label: 'Land rates and taxes' },
  { value: 'MANAGEMENT', label: 'Management fees' },
  { value: 'OTHER', label: 'Other' }
];

export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<ExpenseCategory, string>;

export const EXPENSE_PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' }
];

/** Mirrors FileUploadContext.EXPENSE_RECEIPT. */
export const EXPENSE_RECEIPT_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const EXPENSE_RECEIPT_MAX_MB = 10;
