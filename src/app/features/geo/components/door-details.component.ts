import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { DoorDetails } from '../models/geo.models';

/**
 * What the last rider learned at the door — floor, room, notes — for the next
 * one. Staff only: the server never sends it to the customer.
 */
@Component({
  selector: 'app-door-details',
  standalone: true,
  template: `
    @if (door(); as d) {
      <div class="door">
        @if (d.floorNumber || d.roomNumber) {
          <p class="door__line">
            @if (d.floorNumber) { <span>Floor <strong>{{ d.floorNumber }}</strong></span> }
            @if (d.floorNumber && d.roomNumber) { <span class="muted"> · </span> }
            @if (d.roomNumber) { <span>Room <strong>{{ d.roomNumber }}</strong></span> }
          </p>
        }
        @if (d.riderNotes) { <p class="door__notes">{{ d.riderNotes }}</p> }
        @if (d.updatedByName || d.updatedAt) {
          <p class="door__by muted">Rider notes{{ d.updatedByName ? ' by ' + d.updatedByName : '' }}{{ d.updatedAt ? ', ' + when(d.updatedAt) : '' }}</p>
        }
      </div>
    }
  `,
  styles: [`
    .door { display: grid; gap: 0.25rem; padding: 0.5rem 0.7rem; border-left: 3px solid var(--primary); border-radius: 6px;
            background: var(--surface-2); }
    .door p { margin: 0; font-size: 0.9rem; }
    .door__notes { white-space: pre-line; }
    .door__by { font-size: 0.78rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DoorDetailsComponent {
  readonly door = input<DoorDetails | null | undefined>(null);

  when(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDateTime(date);
  }
}
