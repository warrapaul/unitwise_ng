import { Pipe, PipeTransform } from '@angular/core';

/**
 * Appends a unit to a value, or renders the empty placeholder alone.
 *
 *     {{ detail.gracePeriodDays | unit: 'days' }}
 *
 * Written because the old `value ?? '-'` followed by a literal unit rendered
 * "- days" when the field was empty, which reads as a quantity of nothing
 * rather than as an unknown. The unit belongs to the number; with no number
 * there is no unit.
 */
@Pipe({ name: 'unit', standalone: true })
export class UnitPipe implements PipeTransform {
  transform(value: number | string | null | undefined, unit: string, fallback = '-'): string {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    return `${value} ${unit}`;
  }
}
