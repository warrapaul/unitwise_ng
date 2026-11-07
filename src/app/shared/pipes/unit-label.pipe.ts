import { Pipe, PipeTransform } from '@angular/core';
import { unitLabel } from '../utils/format.util';

/** "m3" as it should read: m³. */
@Pipe({ name: 'unitLabel', standalone: true })
export class UnitLabelPipe implements PipeTransform {
  transform(unit: string | null | undefined): string {
    return unitLabel(unit);
  }
}
