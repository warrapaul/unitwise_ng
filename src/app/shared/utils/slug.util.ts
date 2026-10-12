import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';

/** "Men's T-Shirts & Vests" → "men-s-t-shirts-vests": lowercase, every run of anything else one hyphen. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A readable SKU from a product name: prefix, the words' initials, a number.
 * "Blue Cotton T-Shirt Large" → "PRD-BCTSL-4821". A one-word name keeps its
 * first three letters ("Sugar" → "PRD-SUG-4821"). The number keeps two products
 * with the same initials apart; the server still refuses a duplicate.
 */
export function skuFrom(name: string, suffix: string, prefix = 'PRD'): string {
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const code = words.length === 1 ? words[0].slice(0, 3) : words.slice(0, 5).map((word) => word[0]).join('');
  return `${prefix}-${code}-${suffix}`;
}

/** Four digits, drawn once per form so the SKU does not change on every keystroke. */
export function skuSuffix(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Keeps `target` filled from `source` while the user has not typed their own:
 * the value follows the name as long as it is empty or still what was last
 * derived. Once edited by hand it is left alone.
 */
export function followControl(
  source: AbstractControl<string>,
  target: AbstractControl<string>,
  derive: (value: string) => string,
  destroyRef: DestroyRef
): void {
  let derived = target.value ?? '';
  source.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((value) => {
    const current = target.value ?? '';
    if (current !== '' && current !== derived) {
      return;
    }
    derived = derive(value ?? '');
    target.setValue(derived);
  });
}
