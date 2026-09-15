import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Anything address-shaped — the detail, a preview, or a form's own values. */
export interface AddressLike {
  ward?: string | null;
  subCounty?: string | null;
  town?: string | null;
  city?: string | null;
  county?: string | null;
  postalCode?: string | null;
  description?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  mapPin?: string | null;
}

/**
 * An address, written the way one is written.
 *
 * Smallest unit first, county last, blanks dropped — so a record with only a
 * city and county reads as "Nairobi, Nairobi County" rather than as a line of
 * dashes with the shape of a complete address. Every screen that shows an
 * address was assembling this itself with a different `join`, which is how the
 * same record came out three ways on three pages.
 */
@Component({
  selector: 'app-address-preview',
  standalone: true,
  template: `
    @if (line()) {
      <span class="address" [class.address--block]="block()">
        <span class="address__line">{{ line() }}</span>

        @if (block() && description()) {
          <span class="address__note">{{ description() }}</span>
        }

        @if (block() && coordinates(); as coords) {
          <span class="address__coords">
            <span class="mono">{{ coords }}</span>
            <a
              [href]="mapsUrl()"
              target="_blank"
              rel="noopener"
              title="Open in Google Maps"
            >Map</a>
          </span>
        }
      </span>
    } @else {
      <span class="muted">{{ empty() }}</span>
    }
  `,
  styles: [`
    .address { display: inline; }
    .address--block { display: grid; gap: 0.15rem; }
    .address__note { font-size: 0.82rem; color: var(--text-muted); }

    .address__coords {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.76rem;
      color: var(--text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressPreviewComponent {
  readonly address = input<AddressLike | null>(null);
  /** Stacked, with the note and coordinates. Inline is one line and nothing else. */
  readonly block = input(false);
  readonly empty = input('No address');

  readonly description = computed(() => this.address()?.description ?? null);

  readonly line = computed(() => {
    const address = this.address();
    if (!address) {
      return '';
    }

    // Smallest first: a reader scanning a column wants what distinguishes this
    // row, and every row in an agency shares the county.
    return [
      address.ward,
      address.subCounty,
      address.town,
      address.city,
      address.county,
      address.postalCode
    ].map((part) => part?.trim()).filter(Boolean).join(', ');
  });

  readonly coordinates = computed(() => {
    const point = this.point();
    return point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : null;
  });

  readonly mapsUrl = computed(() => {
    const point = this.point();
    return point ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` : null;
  });

  /** Both halves or neither — a lone latitude points at the Gulf of Guinea. */
  private point(): { lat: number; lng: number } | null {
    const address = this.address();
    const lat = Number(address?.latitude);
    const lng = Number(address?.longitude);

    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
      ? { lat, lng }
      : null;
  }
}
