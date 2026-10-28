import { RentPaymentMethod } from './models/rent.models';

/** What could be read out of a pasted confirmation SMS. Every field is a suggestion, never final. */
export interface ParsedPaymentMessage {
  method: RentPaymentMethod | null;
  reference: string | null;
  amount: number | null;
  /** `YYYY-MM-DD`. */
  paidOn: string | null;
}

/**
 * Reads an M-Pesa or bank confirmation message as pasted:
 *
 *   QGR4T6Y7U8 Confirmed. Ksh7,600.00 sent to ACME LTD for account B1R102 on 26/10/26 at 10:15 AM.
 *
 * Only prefills the form — the tenant checks and corrects it, and the landlord confirms against
 * their own statement. A message this cannot read leaves the fields as they were.
 */
export function parsePaymentMessage(text: string): ParsedPaymentMessage {
  const message = text.replace(/\s+/g, ' ').trim();
  const mpesa = /^([A-Z0-9]{10})\s+confirmed/i.exec(message) ?? /\b([A-Z0-9]{10})\s+confirmed/i.exec(message);
  const bankRef = /\b(?:ref(?:erence)?|trx|transaction(?: id)?)[:.\s#]+([A-Z0-9-]{6,})/i.exec(message);
  return {
    method: mpesa ? 'MPESA' : bankRef ? 'BANK_TRANSFER' : null,
    reference: (mpesa?.[1] ?? bankRef?.[1] ?? null)?.toUpperCase() ?? null,
    amount: amountOf(message),
    paidOn: dateOf(message)
  };
}

/** The first shilling amount: "Ksh7,600.00", "KES 7,600", "Kshs. 7600". The balance comes later in an M-Pesa SMS. */
function amountOf(message: string): number | null {
  const match = /\b(?:ksh?s?|kes)\.?\s?([\d,]+(?:\.\d{1,2})?)/i.exec(message);
  if (!match) {
    return null;
  }
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** "on 26/10/26" or "26/10/2026" — day first, as Kenyan SMS write it. */
function dateOf(message: string): string | null {
  const match = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(message);
  if (!match) {
    return null;
  }
  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  const date = new Date(year, Number(month) - 1, Number(day));
  if (date.getMonth() !== Number(month) - 1 || date > new Date()) {
    return null;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
