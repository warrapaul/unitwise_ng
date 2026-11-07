import { Pipe, PipeTransform } from '@angular/core';
import { roomTitle } from '../utils/format.util';

/** "2-1" on its own reads like a score or a date: "Room 2-1". */
@Pipe({ name: 'roomTitle', standalone: true })
export class RoomTitlePipe implements PipeTransform {
  transform(room: string | number | null | undefined): string {
    return roomTitle(room);
  }
}
