import { Pipe, PipeTransform } from '@angular/core';

/**
 * Whole values whose sentence-cased form would be wrong or ugly. Keyed by the
 * raw backend value so the mapping is exact rather than guessed.
 */
const OVERRIDES: Record<string, string> = {
  MPESA: 'M-Pesa',
  M_PESA: 'M-Pesa',
  WHATSAPP: 'WhatsApp',
  IN_APP: 'In-app',
  IOS: 'iOS',
  SMS: 'SMS',
  OK: 'OK',
  OTHER: 'Other'
};

/**
 * Tokens that are initialisms and must not be lowercased on their way through.
 */
const INITIALISMS = new Set(['ID', 'SMS', 'OTP', 'VAT', 'PDF', 'URL', 'API', 'UID', 'KYC', 'PIN']);

/**
 * Turns a backend enum into something a landlord can read.
 *
 *     LANDLORD_ASSISTED  ->  Landlord assisted
 *     PENDING_CLAIM      ->  Pending claim
 *     NATIONAL_ID_FRONT  ->  National ID front
 *     MPESA              ->  M-Pesa
 *
 * `SCREAMING_SNAKE_CASE` is the database's vocabulary, and it was reaching the
 * screen in about eighty places — a status column, a claim status, a payment
 * method. One pipe rather than eighty hand-written labels, because the values
 * are backend data: a new enum member appears without a frontend change, and a
 * lookup table would render it blank.
 *
 * Anything that is not screaming snake case is passed through untouched, so a
 * value that is already prose stays as it is.
 */
/**
 * The same conversion, callable from TypeScript.
 *
 * Exported because several places build their labels in code rather than in a
 * template — a select's options, the context switcher's role name — and each
 * had grown its own near-copy of this. Two implementations of "how do we spell
 * an enum" drift, and the one in the harder-to-see place is the one that stays
 * wrong.
 */
export function humanizeLabel(value: string | null | undefined, fallback = '-'): string {
  return new HumanLabelPipe().transform(value, fallback);
}

@Pipe({ name: 'humanLabel', standalone: true })
export class HumanLabelPipe implements PipeTransform {
  transform(value: string | null | undefined, fallback = '-'): string {
    if (typeof value !== 'string' || value.trim() === '') {
      return fallback;
    }

    const raw = value.trim();
    const override = OVERRIDES[raw.toUpperCase()];
    if (override) {
      return override;
    }

    // Already prose — a name, a sentence, a mixed-case label. Leave it alone.
    if (raw !== raw.toUpperCase()) {
      return raw;
    }

    const words = raw
      .split(/[_\s]+/)
      .filter((token) => token.length > 0)
      .map((token) => (INITIALISMS.has(token) ? token : token.toLowerCase()));

    if (words.length === 0) {
      return fallback;
    }

    const [first, ...rest] = words;
    const lead = INITIALISMS.has(first.toUpperCase())
      ? first
      : first.charAt(0).toUpperCase() + first.slice(1);

    return [lead, ...rest].join(' ');
  }
}
