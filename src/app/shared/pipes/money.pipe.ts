import { Pipe, PipeTransform } from '@angular/core';
import { formatCurrency } from '../utils/format.util';

/** `{{ amount | money }}` → "KES 13,400". The template form of formatCurrency. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined, currency?: string | null): string {
    return formatCurrency(value, currency === undefined ? undefined : currency);
  }
}
