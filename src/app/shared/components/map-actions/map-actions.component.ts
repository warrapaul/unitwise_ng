import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { coordinatesText, copyText, mapsDirectionsUrl, mapsPlaceUrl } from '../../utils/maps.util';

/**
 * A point's three useful moves: see it on Google Maps, get directions there,
 * or copy the coordinates (they paste straight into Maps search or a chat).
 * Nothing renders without both coordinates.
 */
@Component({
  selector: 'app-map-actions',
  standalone: true,
  template: `
    @if (has()) {
      <span class="map-actions">
        <a class="btn btn-secondary btn-sm" [href]="placeUrl()" target="_blank" rel="noopener">Open in Google Maps</a>
        <a class="btn btn-secondary btn-sm" [href]="directionsUrl()" target="_blank" rel="noopener">Directions</a>
        <button type="button" class="btn btn-secondary btn-sm" (click)="copy()">{{ copied() ? 'Copied' : 'Copy coordinates' }}</button>
      </span>
    }
  `,
  styles: [`
    .map-actions { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapActionsComponent {
  readonly latitude = input<number | string | null | undefined>(null);
  readonly longitude = input<number | string | null | undefined>(null);

  readonly copied = signal(false);

  readonly has = computed(() => isSet(this.latitude()) && isSet(this.longitude()));
  readonly placeUrl = computed(() => this.has() ? mapsPlaceUrl(this.latitude()!, this.longitude()!) : '');
  readonly directionsUrl = computed(() => this.has() ? mapsDirectionsUrl(this.latitude()!, this.longitude()!) : '');

  async copy(): Promise<void> {
    if (await copyText(coordinatesText(this.latitude()!, this.longitude()!))) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }
}

function isSet(value: number | string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
