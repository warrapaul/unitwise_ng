import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { distanceLabel, metersBetween } from '../../../shared/utils/maps.util';
import { GeoService } from '../geo.service';
import { ROUGH_METERS, accuracyNote, bestDevicePosition } from '../../../shared/utils/geolocation.util';
import { BUILDING_TYPES, GeoBuildingPreview, GeoLandmarkPreview, kindLabel } from '../models/geo.models';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';

type Point = { lat: number; lng: number };

/** What the caller does with the chosen building; a rejection is shown in the dialog. */
export type BuildingLinkFn = (geoBuildingId: string, unitNumber: string | null) => Promise<void>;

/**
 * Staff only: the rider, at (or back from) the customer's gate, says which
 * building it was. Customers never see this.
 *
 * Buildings around the rider come first — standing at the gate is the usual
 * case, and picking beats typing. Search covers a block known by name or code.
 * A building nobody has mapped is created here, at the rider's position, and
 * linked in the same step. What linking means (an order, an address in the
 * customer's book) is the caller's `link`.
 */
@Component({
  selector: 'app-building-link-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, PermissionGateComponent, CoordinateFieldComponent,
    EntityPickerComponent],
  template: `
    <app-dialog title="Link to a building" subtitle="Where this customer lives, for every order after this one."
                width="40rem" (closed)="closed.emit()">
      <div class="stack">
        @if (!creating()) {
          <!-- Around the gate first; otherwise the same building picker as everywhere else. -->
          <div class="row">
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="locating()" (click)="useMyLocation()">
              {{ locating() ? 'Locating...' : 'Buildings around me' }}
            </button>
            <label class="field search">
              <span class="visually-hidden">Find a building</span>
              <app-entity-picker [config]="pickers.geoBuilding" [formControl]="buildingPick" placeholder="Or find one by name or code" />
            </label>
          </div>
          @if (locateError(); as message) { <small class="error-text">{{ message }}</small> }
          @if (searching()) { <p class="muted">Looking...</p> }

          @if (results().length > 0) {
            <ul class="choices">
              @for (b of results(); track b.id) {
                <li>
                  <label class="choice" [class.choice--on]="selected()?.id === b.id">
                    <input type="radio" name="building" [checked]="selected()?.id === b.id" (change)="selected.set(b)">
                    <span>
                      <strong>{{ b.name }}</strong> <span class="muted">{{ b.code }}</span>
                      <span class="muted block">
                        {{ label(b.buildingType) }}@if (b.landmarkName) { · near {{ b.landmarkName }} }@if (b.distanceMeters != null) { · {{ distance(b.distanceMeters) }} away }
                      </span>
                    </span>
                  </label>
                </li>
              }
            </ul>
          } @else if (searched() && !searching()) {
            <p class="muted">No mapped building within 300 m. Find one by name or code, or add it.</p>
          }

          <app-permission-gate [permissions]="['GEO_BUILDING_CREATE']">
            <button type="button" class="btn btn-link" (click)="startCreate()">Not listed? Add the building</button>
          </app-permission-gate>
        } @else {
          <!-- The same building as Geo buildings → New building: the same fields, the same location tools. -->
          <form id="new-building" class="stack" [formGroup]="newForm" (ngSubmit)="create()">
            <div class="form-grid">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="e.g. Sunrise Apartments, Block B">
                @if (newForm.controls.name.invalid && newForm.controls.name.touched) { <small class="error-text">Name is required.</small> }
              </label>
              <label class="field">
                <span>Code <span class="muted">(optional)</span></span>
                <input formControlName="code" class="slug" placeholder="e.g. KAS-B007" autocomplete="off">
                <small class="hint">Leave empty to generate one from the region.</small>
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="buildingType">
                  @for (type of types; track type) { <option [value]="type">{{ label(type) }}</option> }
                </select>
              </label>
              <label class="field">
                <span>Floors <span class="muted">(optional)</span></span>
                <input type="number" min="0" formControlName="floors">
              </label>
            </div>
            <label class="field">
              <span>How to get in <span class="muted">(optional)</span></span>
              <textarea formControlName="description" rows="2" placeholder="e.g. Black gate on the left, park by the kiosk"></textarea>
            </label>
            <div class="form-grid">
              <label class="field"><span>Caretaker or guard <span class="muted">(optional)</span></span><input formControlName="contactName"></label>
              <label class="field"><span>Their phone <span class="muted">(optional)</span></span><input formControlName="contactPhone" inputmode="tel"></label>
            </div>

            <app-coordinate-field
              [latitude]="here()?.lat ?? null"
              [longitude]="here()?.lng ?? null"
              legend="The gate"
              hint="Stand at the gate and use your location, or paste a Google Maps link."
              (changed)="onPoint($event)"
            />
            @if (coverage() === 'uncovered') {
              <p class="error-text" role="alert">This area is not covered yet. Buildings can only be added inside a mapped region.</p>
            } @else if (regionName(); as name) {
              <p class="ok">In <strong>{{ name }}</strong></p>
            }
            @if (duplicates().length > 0) {
              <div class="alert alert-warning">
                <strong>Already mapped here?</strong>
                <ul class="plain">
                  @for (b of duplicates(); track b.id) {
                    <li>
                      {{ b.name }} <span class="muted">· {{ b.code }} · {{ distance(b.distanceMeters) }} away</span>
                      <button type="button" class="btn btn-link" (click)="useExisting(b)">Link this one</button>
                    </li>
                  }
                </ul>
              </div>
            }
            <label class="field">
              <span>Near landmark</span>
              <select formControlName="landmarkId">
                <option value="">{{ here() ? (landmarks().length ? 'None' : 'No landmark within 1.5 km') : 'Set the location first' }}</option>
                @for (l of landmarks(); track l.id) {
                  <option [value]="l.id">{{ l.name }}{{ l.code ? ' (' + l.code + ')' : '' }} — {{ distance(l.distanceMeters) }}</option>
                }
              </select>
              <small class="hint">The closest is chosen; any within 1.5 km can be picked.</small>
            </label>
            <button type="button" class="btn btn-link" (click)="creating.set(false)">Back to the list</button>
          </form>
        }

        <label class="field unit">
          <span>House or unit <span class="muted">(optional)</span></span>
          <input [value]="unit()" (input)="unit.set($any($event.target).value)" placeholder="e.g. B12">
        </label>

        @if (error(); as apiError) {
          <app-error-card title="Not linked" [message]="apiError.message" [details]="apiError.details" />
        }
      </div>
      <div dialog-actions>
        @if (creating()) {
          <button type="submit" form="new-building" class="btn btn-primary" [disabled]="saving() || !here() || coverage() === 'uncovered'">
            {{ saving() ? 'Saving...' : 'Add building and link' }}
          </button>
        } @else {
          <button type="button" class="btn btn-primary" [disabled]="saving() || !selected()" (click)="confirm(selected()!.id)">
            {{ saving() ? 'Linking...' : 'Link building' }}
          </button>
        }
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .search { flex: 1 1 14rem; margin: 0; }
    .choices { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; max-height: 18rem; overflow-y: auto; }
    .choice { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.6rem 0.75rem; border: 1px solid var(--border);
              border-radius: 10px; cursor: pointer; }
    .choice--on { border-color: var(--primary); background: var(--primary-tint); }
    .choice input { width: auto; margin-top: 0.2rem; }
    .block { display: block; font-size: 0.84rem; }
    .unit { max-width: 14rem; }
    .btn-link { justify-self: start; padding: 0; border: 0; background: none; color: var(--primary-strong); font-weight: 600;
                text-decoration: underline; cursor: pointer; }
    p { margin: 0; }
    .ok strong { color: var(--success); }
    .plain { margin: 0.35rem 0 0; padding-left: 1.1rem; }
    .plain .btn-link { margin-left: 0.4rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingLinkDialogComponent implements OnInit {
  /** The customer's pin, when there is one: the search starts around it. */
  readonly start = input<Point | null>(null);
  readonly initialUnit = input<string | null>(null);
  /** A building to have chosen already, e.g. the nearest one suggested on the address. */
  readonly suggested = input<GeoBuildingPreview | null>(null);
  readonly link = input.required<BuildingLinkFn>();
  readonly linked = output<void>();
  readonly closed = output<void>();

  private readonly geo = inject(GeoService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly types = BUILDING_TYPES;
  readonly results = signal<GeoBuildingPreview[]>([]);
  readonly selected = signal<GeoBuildingPreview | null>(null);
  readonly unit = signal('');
  readonly here = signal<Point | null>(null);
  readonly locating = signal(false);
  readonly locateError = signal<string | null>(null);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly newForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    code: ['', [Validators.maxLength(50)]],
    buildingType: 'APARTMENT',
    floors: [null as number | null, [Validators.min(0)]],
    description: '',
    contactName: '',
    contactPhone: '',
    landmarkId: ''
  });

  readonly coverage = signal<'unknown' | 'covered' | 'uncovered'>('unknown');
  readonly regionName = signal<string | null>(null);
  readonly landmarks = signal<Array<GeoLandmarkPreview & { distanceMeters: number }>>([]);
  readonly duplicates = signal<GeoBuildingPreview[]>([]);

  /** A point set by location, a pasted link or typed numbers: what is around it. */
  onPoint(point: Coordinates | null): void {
    if (!point) {
      this.here.set(null);
      this.coverage.set('unknown');
      this.regionName.set(null);
      this.landmarks.set([]);
      this.duplicates.set([]);
      return;
    }
    const at = { lat: point.latitude, lng: point.longitude };
    this.here.set(at);
    void this.lookAround(at);
  }

  private async lookAround(at: Point): Promise<void> {
    const [region, landmarks, nearby] = await Promise.all([
      firstValueFrom(this.geo.findRegionForPoint(at.lat, at.lng)).catch(() => undefined),
      firstValueFrom(this.geo.findNearbyLandmarks(at.lat, at.lng, 1.5)).catch(() => []),
      firstValueFrom(this.geo.nearbyBuildings(at.lat, at.lng, 100)).catch(() => [])
    ]);
    if (this.here() !== at) {
      return; // Moved again meanwhile.
    }
    this.coverage.set(region === undefined ? 'unknown' : region ? 'covered' : 'uncovered');
    this.regionName.set(region ? region.name : null);
    const ranked = landmarks
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => ({ ...l, distanceMeters: metersBetween(at.lat, at.lng, Number(l.latitude), Number(l.longitude)) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    this.landmarks.set(ranked);
    if (!ranked.some((l) => l.id === this.newForm.controls.landmarkId.value)) {
      this.newForm.controls.landmarkId.setValue(ranked[0]?.id ?? '');
    }
    this.duplicates.set(nearby);
  }

  /** It was mapped after all: link that one instead of adding a second. */
  useExisting(building: GeoBuildingPreview): void {
    this.creating.set(false);
    this.results.set([building, ...this.results().filter((b) => b.id !== building.id)]);
    this.selected.set(building);
  }

  ngOnInit(): void {
    this.buildingPick.valueChanges.subscribe((id) => {
      if (id) {
        void this.choose(id);
      }
    });
    this.unit.set(this.initialUnit() ?? '');
    const suggested = this.suggested();
    if (suggested) {
      this.results.set([suggested]);
      this.selected.set(suggested);
    }
    // A customer pin: start from the buildings around it.
    const start = this.start();
    if (start) {
      void this.searchNear(start, suggested?.id);
    }
  }

  useMyLocation(): void {
    if (!('geolocation' in navigator)) {
      this.locateError.set('This device cannot share its location. Search by name instead.');
      return;
    }
    this.locating.set(true);
    this.locateError.set(null);
    // The best fix within a few seconds: a new building is saved at this point.
    bestDevicePosition().then(
      (position) => {
        this.locating.set(false);
        const point = { lat: position.latitude, lng: position.longitude };
        this.here.set(point);
        if (this.creating()) {
          void this.lookAround(point);
        }
        if (position.accuracy > ROUGH_METERS) {
          this.locateError.set(accuracyNote(position.accuracy));
        }
        void this.searchNear(point);
      },
      (failure: GeolocationPositionError) => {
        this.locating.set(false);
        this.locateError.set(failure?.code === 1
          ? 'Location is blocked for this site. Allow it, or search by name.'
          : 'Could not get your location. Try again, or search by name.');
      }
    );
  }

  private async searchNear(point: Point, keepSelected?: string): Promise<void> {
    this.searching.set(true);
    try {
      this.results.set(await firstValueFrom(this.geo.nearbyBuildings(point.lat, point.lng, 300)));
      this.selected.set(this.results().find((b) => b.id === keepSelected) ?? this.results()[0] ?? null);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  readonly pickers = inject(EntityPickerRegistry);
  /** A building chosen in the picker: shown as the one to link. */
  readonly buildingPick = new FormControl<string | null>(null);

  private async choose(id: string): Promise<void> {
    this.searching.set(true);
    try {
      const b = await firstValueFrom(this.geo.getBuilding(id));
      const building: GeoBuildingPreview = { ...b };
      this.results.set([building, ...this.results().filter((item) => item.id !== id)]);
      this.selected.set(building);
      this.searched.set(true);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.searching.set(false);
    }
  }

  startCreate(): void {
    this.creating.set(true);
    this.error.set(null);
    // Start from where we already are: the rider's position, else the customer's pin.
    const at = this.here() ?? this.start();
    if (at) {
      this.here.set(at);
      void this.lookAround(at);
    }
  }

  async create(): Promise<void> {
    const point = this.here();
    if (this.newForm.invalid || !point) {
      this.newForm.markAllAsTouched();
      return;
    }
    const v = this.newForm.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      const building = await firstValueFrom(this.geo.createBuilding({
        name: v.name.trim(),
        code: v.code.trim() ? v.code.trim().toUpperCase() : undefined,
        buildingType: v.buildingType,
        floors: v.floors,
        description: v.description.trim() || null,
        contactName: v.contactName.trim() || null,
        contactPhone: v.contactPhone.trim() || null,
        latitude: round(point.lat),
        longitude: round(point.lng),
        landmarkId: v.landmarkId || null
      }));
      await this.confirm(building.id, true);
    } catch (error) {
      this.error.set(toApiError(error));
      this.saving.set(false);
    }
  }

  async confirm(buildingId: string, alreadySaving = false): Promise<void> {
    if (!alreadySaving) {
      this.saving.set(true);
      this.error.set(null);
    }
    try {
      await this.link()(buildingId, this.unit().trim() || null);
      this.linked.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  label(type: string | null | undefined): string {
    return kindLabel(type);
  }

  distance(meters: number | null | undefined): string {
    return distanceLabel(meters);
  }
}

function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
