import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';

/**
 * A room, named and linked, with an honest label for the case where it is only
 * a room the tenant is *going* to have.
 *
 * A landlord-assisted tenant is created against `intendedRoomId` and does not
 * get a `roomId` until the tenancy is actually activated — so the list rendered
 * "-" in the Room column for a tenant who very much had a room picked out. The
 * intended room is real information and is now shown, but never as though it
 * were an assignment: it carries an "Intended" chip, and the chip's glyph plus
 * its word carry that meaning without relying on the hue (the darkened accents
 * sit too close together to separate on colour alone — styles.scss).
 *
 * `roomNumber`/`roomName` describe the *assigned* room and
 * `intendedRoomNumber`/`intendedRoomName` the intended one, so the caller passes
 * whichever pair matches the id it passed — never a mix. The bare `Room #148`
 * fallback survives only for records saved before the backend named the
 * intended room; nothing renders an id when a name is available.
 */
@Component({
  selector: 'app-room-link',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (label(); as text) {
      <span class="room-link">
        @if (link(); as href) {
          <a [routerLink]="href">{{ text }}</a>
        } @else {
          <span>{{ text }}</span>
        }
        @if (intended()) {
          <span class="status-chip status-chip--warning">Intended</span>
        }
      </span>
    } @else {
      <span class="muted">{{ empty() }}</span>
    }
  `,
  styles: [`
    .room-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .status-chip {
      /* Smaller than a status column's chip: this one qualifies a value rather
         than being the value. */
      font-size: 0.72rem;
      padding: 0.15rem 0.5rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomLinkComponent {
  readonly agencyId = input<number | string | null | undefined>(null);
  readonly buildingId = input<number | string | null | undefined>(null);
  readonly roomId = input<number | string | null | undefined>(null);
  readonly roomNumber = input<number | string | null | undefined>(null);
  readonly roomName = input<string | null | undefined>(null);
  /** Picked out but not yet assigned — shown, but visibly not an assignment. */
  readonly intended = input(false);
  readonly empty = input('-');

  readonly label = computed(() => {
    const name = this.roomName();
    if (name) {
      return name;
    }

    const number = this.roomNumber();
    if (number !== null && number !== undefined && number !== '') {
      return `Room ${number}`;
    }

    // Last resort: a room that has an id and nothing else. Identifiable enough
    // to click through to, which is the point of the link.
    const id = this.roomId();
    return id !== null && id !== undefined && id !== '' ? `Room #${id}` : null;
  });

  readonly link = computed(() => {
    const agencyId = this.agencyId();
    const buildingId = this.buildingId();
    const roomId = this.roomId();
    return agencyId !== null && agencyId !== undefined
      && buildingId !== null && buildingId !== undefined
      && roomId !== null && roomId !== undefined
      ? RoutePaths.roomDetail(agencyId, buildingId, roomId)
      : null;
  });
}
