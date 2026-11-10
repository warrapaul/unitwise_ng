import { Pipe, PipeTransform } from '@angular/core';
import { formatPhone } from '../utils/format.util';

/** A phone number written one way everywhere: "+254 700 000 205". */
@Pipe({ name: 'phone', standalone: true })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? formatPhone(value) : '';
  }
}
