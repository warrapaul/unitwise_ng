import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { distanceLabel } from '../../../shared/utils/maps.util';
import { GeoService } from '../geo.service';
import { ROUGH_METERS, accuracyNote, bestDevicePosition } from '../../../shared/utils/geolocation.util';
import { BUILDING_TYPES, GeoBuildingPreview, kindLabel } from '../models/geo.models';

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
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, PermissionGateComponent],
  template: `
    <app-dialog title="Link to a building" subtitle="Where this customer lives, for every order after this one."
                width="40rem" (closed)="closed.emit()">
      <div class="stack">
        @if (!creating()) {
          <div class="row">
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="locating()" (click)="useMyLocation()">
              {{ locating() ? 'Locating...' : 'Buildings around me' }}
            </button>
            <input class="search" type="search" placeholder="Or search by name or code" [value]="query()"
                   (input)="query.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); searchByText()">
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="!query().trim()" (click)="searchByText()">Search</button>
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
            <p class="muted">No mapped building {{ lastSearch() === 'near' ? 'within 300 m' : 'matches that' }}.</p>
          }

          <app-permission-gate [permissions]="['GEO_BUILDING_CREATE']">
            <button type="button" class="btn btn-link" (click)="startCreate()">Not listed? Add the building</button>
          </app-permission-gate>
        } @else {
          <!-- New building at the rider's position: they are at the gate. -->
          <form id="new-building" class="stack" [formGroup]="newForm" (ngSubmit)="create()">
            <p class="hint">
              @if (here(); as point) { Saved at your current position ({{ point.lat.toFixed(5) }}, {{ point.lng.toFixed(5) }}). }
              @else { Your position is needed: stand at the gate and allow location. }
            </p>
            <div class="form-grid">
              <label class="field"><span>Name</span><input formControlName="name" placeholder="e.g. Sunrise Apartments, Block B"></label>
              <label class="field">
                <span>Type</span>
                <select formControlName="buildingType">
                  @for (type of types; track type) { <option [value]="type">{{ label(type) }}</option> }
                </select>
              </label>
              <label class="field"><span>Caretaker phone <span class="muted">(optional)</span></span><input formControlName="contactPhone" inputmode="tel"></label>
            </div>
            <label class="field"><span>How to get in <span class="muted">(optional)</span></span>
              <input formControlName="description" placeholder="e.g. Black gate, second entrance"></label>
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
          <button type="submit" form="new-building" class="btn btn-primary" [disabled]="saving() || !here()">
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
    .search { flex: 1 1 12rem; }
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
  readonly query = signal('');
  readonly unit = signal('');
  readonly here = signal<Point | null>(null);
  readonly locating = signal(false);
  readonly locateError = signal<string | null>(null);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly lastSearch = signal<'near' | 'text'>('near');
  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly newForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    buildingType: 'APARTMENT',
    contactPhone: '',
    description: ''
  });

  ngOnInit(): void {
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
    this.lastSearch.set('near');
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

  async searchByText(): Promise<void> {
    const q = this.query().trim();
    if (!q) {
      return;
    }
    this.searching.set(true);
    this.lastSearch.set('text');
    try {
      const page = await firstValueFrom(this.geo.searchBuildings({ q, isActive: true, page: 0, size: 15 }));
      this.results.set(page.items);
      this.selected.set(page.items.length === 1 ? page.items[0] : null);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  startCreate(): void {
    this.creating.set(true);
    this.error.set(null);
    if (!this.here()) {
      this.useMyLocation();
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
        buildingType: v.buildingType,
        contactPhone: v.contactPhone.trim() || null,
        description: v.description.trim() || null,
        latitude: round(point.lat),
        longitude: round(point.lng)
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
