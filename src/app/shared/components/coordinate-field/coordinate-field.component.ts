import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';

/** A point on the ground. Both halves or neither — a lone latitude says nothing. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Optional coordinates for an address, however the person happens to have them.
 *
 * Three honest routes in, in the order people actually use them: paste the maps
 * link they were sent, ask the browser while standing at the place, or type the
 * pair. Nowhere in this app are coordinates required — a landmark gets a rider
 * to a gate in most of Kenya, and a pin nobody checked is worse than none — so
 * this stays a fieldset that can be ignored, never a validation gate.
 *
 * The two values move together, so this is not a ControlValueAccessor: it
 * reports a whole point, or null, and each form writes that into whatever shape
 * its own request takes (strings here, numbers there).
 */
@Component({
  selector: 'app-coordinate-field',
  standalone: true,
  template: `
    <fieldset class="coords">
      <legend>{{ legend() }}</legend>

      @if (hint(); as text) {
        <p class="muted coords__hint">{{ text }}</p>
      }

      <label class="field field--wide">
        <span>Paste a map link or pin</span>
        <textarea
          rows="2"
          placeholder="https://maps.google.com/... or -1.2921, 36.8219"
          [value]="pinText()"
          (input)="onPinInput($event)"
        ></textarea>
        <small class="hint">Coordinates are read out of a pasted Google Maps link automatically.</small>
      </label>

      <div class="grid-auto">
        <label class="field">
          <span>Latitude</span>
          <input type="number" step="0.000001" [value]="latitudeText()" (input)="onLatitudeInput($event)">
        </label>
        <label class="field">
          <span>Longitude</span>
          <input type="number" step="0.000001" [value]="longitudeText()" (input)="onLongitudeInput($event)">
        </label>
      </div>

      @if (outOfRange()) {
        <small class="error-text">That is not a point on Earth. Latitude runs -90 to 90, longitude -180 to 180.</small>
      }

      @if (locationError(); as message) {
        <small class="error-text">{{ message }}</small>
      }

      <div class="button-row button-row--start">
        @if (hasValue()) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="clear()">Clear coordinates</button>
        }
        <button type="button" class="btn btn-secondary btn-sm" [disabled]="locating()" (click)="useMyLocation()">
          {{ locating() ? 'Locating...' : 'Use my current location' }}
        </button>
      </div>
    </fieldset>
  `,
  styles: [`
    .coords {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0.9rem 1rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    legend {
      padding: 0 0.4rem;
      font-weight: 700;
    }

    .coords__hint { margin: 0; }

    /* These are secondary to whatever the form is really for, so they sit left
       rather than taking the primary slot on the right. */
    .button-row--start { justify-content: flex-start; flex-direction: row; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoordinateFieldComponent {
  readonly latitude = input<number | string | null>(null);
  readonly longitude = input<number | string | null>(null);
  readonly legend = input('Location (optional)');
  readonly hint = input<string | null>(null);
  /** The pasted link itself, where the record keeps one. */
  readonly pin = input<string | null>(null);

  /** The whole point, or null once either half is cleared. */
  readonly changed = output<Coordinates | null>();
  /** The link as typed — worth storing: it often names the place too. */
  readonly pinChanged = output<string>();

  readonly latitudeText = signal('');
  readonly longitudeText = signal('');
  readonly pinText = signal('');
  readonly locating = signal(false);
  readonly locationError = signal<string | null>(null);

  readonly hasValue = computed(() => this.latitudeText() !== '' || this.longitudeText() !== '');

  readonly outOfRange = computed(() => {
    const point = this.parsed();
    if (!point) {
      return false;
    }

    return Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180;
  });

  /**
   * The parent owns the value, so its writes flow back down here. Anything this
   * component itself emitted is skipped, or typing would fight the echo.
   */
  private emitted: string | null = null;
  private emittedPin: string | null = null;

  constructor() {
    effect(() => {
      const incomingPin = this.pin() ?? '';
      if (incomingPin !== this.emittedPin) {
        this.emittedPin = incomingPin;
        this.pinText.set(incomingPin);
      }
    });

    effect(() => {
      const incoming = `${this.text(this.latitude())}|${this.text(this.longitude())}`;
      if (incoming === this.emitted) {
        return;
      }

      this.emitted = incoming;
      const [lat, lng] = incoming.split('|');
      this.latitudeText.set(lat);
      this.longitudeText.set(lng);
    });
  }

  onLatitudeInput(event: Event): void {
    this.latitudeText.set((event.target as HTMLInputElement).value);
    this.emit();
  }

  onLongitudeInput(event: Event): void {
    this.longitudeText.set((event.target as HTMLInputElement).value);
    this.emit();
  }

  /**
   * What people have is a shared maps link, not a decimal pair. Every Google
   * Maps URL carries the point inside it, so the link is read rather than
   * asking someone to dig the numbers out and copy them across.
   */
  onPinInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.pinText.set(value);
    this.emittedPin = value;
    this.pinChanged.emit(value);

    if (!value.trim()) {
      return;
    }

    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,             // /maps/@-1.2921,36.8219,15z
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,          // place links
      /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,      // ?q=lat,lng
      /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/  // typed straight in
    ];

    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) {
        this.latitudeText.set(match[1]);
        this.longitudeText.set(match[2]);
        this.locationError.set(null);
        this.emit();
        return;
      }
    }
  }

  /**
   * Only ever right if the person is standing at the place. Someone filling
   * this in from an office gets their office, so the button says "my current
   * location" rather than "locate" — nobody should expect it to find the
   * address they are typing.
   */
  async useMyLocation(): Promise<void> {
    if (!navigator.geolocation) {
      this.locationError.set('This browser cannot report a location.');
      return;
    }

    this.locating.set(true);
    this.locationError.set(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      this.latitudeText.set(String(position.coords.latitude));
      this.longitudeText.set(String(position.coords.longitude));
      this.emit();
    } catch (error) {
      const code = (error as GeolocationPositionError)?.code;
      this.locationError.set(
        code === 1 ? 'Location permission was refused.'
          : code === 3 ? 'Locating timed out. Try again, or paste a map link.'
            : 'Could not read a location. Paste a map link instead.'
      );
    } finally {
      this.locating.set(false);
    }
  }

  clear(): void {
    this.latitudeText.set('');
    this.longitudeText.set('');
    this.pinText.set('');
    this.emittedPin = '';
    this.pinChanged.emit('');
    this.locationError.set(null);
    this.emit();
  }

  private parsed(): Coordinates | null {
    const latitude = Number(this.latitudeText());
    const longitude = Number(this.longitudeText());

    if (this.latitudeText() === '' || this.longitudeText() === ''
      || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    return { latitude, longitude };
  }

  private emit(): void {
    this.emitted = `${this.latitudeText()}|${this.longitudeText()}`;
    // Half a pair is not a location: the parent gets null until both are in.
    this.changed.emit(this.outOfRange() ? null : this.parsed());
  }

  private text(value: number | string | null | undefined): string {
    return value === null || value === undefined || value === '' ? '' : String(value);
  }
}
