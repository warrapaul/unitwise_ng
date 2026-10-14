import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MapActionsComponent } from '../../../shared/components/map-actions/map-actions.component';
import { distanceLabel } from '../../../shared/utils/maps.util';
import { GeoContext } from '../models/geo.models';

/**
 * Where a pinned address is, for the rider: "Kasarani › Nairobi", the nearest
 * landmark with its code and distance, and the map actions. An address with
 * coordinates outside every region says so rather than staying silent.
 */
@Component({
  selector: 'app-geo-context',
  standalone: true,
  imports: [MapActionsComponent],
  template: `
    @if (point(); as at) {
      <div class="geo">
        @if (geo()?.building; as building) {
          <p class="geo__line">
            <strong>{{ building.name }}</strong>
            @if (building.code) { <span class="code">{{ building.code }}</span> }
            @if (building.floors) { <span class="muted"> · {{ building.floors }} floors</span> }
          </p>
          @if (building.description) { <p class="geo__line muted">{{ building.description }}</p> }
          @if (building.contactPhone) {
            <p class="geo__line">Gate: {{ building.contactName || 'caretaker' }} · <a [href]="'tel:' + building.contactPhone">{{ building.contactPhone }}</a></p>
          }
        }
        <p class="geo__line">
          @if (geo()?.regionName) {
            <span class="geo__region">{{ geo()!.regionName }}</span>
            @if (geo()!.parentRegionName) { <span class="muted"> · {{ geo()!.parentRegionName }}</span> }
          } @else {
            <span class="muted">Outside the mapped regions</span>
          }
        </p>
        @if (geo()?.approximate) {
          <p class="geo__line warn">Approximate: the customer gave a landmark, not a pin. Call them on the way.</p>
        }
        @if (geo()?.customerLandmark; as given) {
          <p class="geo__line">
            Customer said near <strong>{{ given.name }}</strong>
            @if (given.code) { <span class="code">{{ given.code }}</span> }
            @if (!geo()?.approximate && given.distanceMeters != null) { <span class="muted"> · {{ distance(given.distanceMeters) }} from the pin</span> }
          </p>
        }
        @if (geo()?.nearestBuilding; as candidate) {
          <p class="geo__line candidate">
            Nearest mapped building: <strong>{{ candidate.name }}</strong>
            @if (candidate.code) { <span class="code">{{ candidate.code }}</span> }
            <span class="muted"> · {{ distance(candidate.distanceMeters ?? 0) }} from the pin</span>
            @if (canLink()) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="linkCandidate.emit(candidate)">Link</button>
            }
          </p>
        }
        @if (geo()?.nearestLandmark; as near) {
          <p class="geo__line">
            Near <strong>{{ near.name }}</strong>
            @if (near.code) { <span class="code">{{ near.code }}</span> }
            @if (near.distanceMeters !== null && near.distanceMeters !== undefined) {
              <span class="muted"> · {{ distance(near.distanceMeters) }} away</span>
            }
          </p>
        }
        <app-map-actions [latitude]="at.lat" [longitude]="at.lng" />
      </div>
    }
  `,
  styles: [`
    .geo { display: grid; gap: 0.35rem; }
    .geo__line { margin: 0; font-size: 0.9rem; }
    .geo__region { font-weight: 700; }
    .warn { color: var(--warning); font-weight: 600; }
    .candidate { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
    .code { margin-left: 0.35rem; padding: 0.05rem 0.4rem; border-radius: 6px; background: var(--surface-2);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeoContextComponent {
  readonly geo = input<GeoContext | null | undefined>(null);
  readonly latitude = input<number | string | null | undefined>(null);
  readonly longitude = input<number | string | null | undefined>(null);
  /** Whether the viewer may link the address to a building (riders and the desk). */
  readonly canLink = input(false);
  /** The suggested nearest building, chosen for linking. */
  readonly linkCandidate = output<NonNullable<GeoContext['nearestBuilding']>>();

  /** The address's own pin, or its building's when the customer gave none. */
  readonly point = computed(() => {
    // Own pin, then the building; an approximate context falls back to the landmark the customer named.
    const fallback = this.geo()?.building ?? (this.geo()?.approximate ? this.geo()?.customerLandmark : null);
    const lat = this.latitude() ?? fallback?.latitude;
    const lng = this.longitude() ?? fallback?.longitude;
    return lat !== null && lat !== undefined && lng !== null && lng !== undefined ? { lat, lng } : null;
  });

  distance(meters: number): string {
    return distanceLabel(meters);
  }
}
