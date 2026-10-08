import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EntityPickerComponent } from '../entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../entity-picker/entity-picker.registry';

/**
 * The controls `app-address-fields` binds, by name, inside whatever form group
 * it is given — so a form keeps them flat beside its own fields. Ids pick from
 * the registry the super admin keeps; only the building/house is typed.
 *
 * Patch an existing address with events on (the default) and in this key
 * order: the component follows the values through valueChanges.
 */
export const ADDRESS_FIELD_CONTROLS = {
  countyId: [null as number | null],
  subCountyId: [null as number | null],
  wardId: [null as number | null],
  townId: [null as number | null],
  estateAreaId: [null as number | null],
  streetRoadId: [null as number | null],
  buildingHouse: ['']
};

/** The empty value of the address controls, for a form's reset. */
export const EMPTY_ADDRESS_FIELDS = {
  countyId: null, subCountyId: null, wardId: null, townId: null, estateAreaId: null, streetRoadId: null, buildingHouse: ''
};

/**
 * One place chain for every address in the app:
 * County → Sub-county → Ward → Town/locality → Estate/area → Street/road, then
 * Building/house typed.
 *
 * Each level is picked inside the one above it and waits for it — a ward
 * picker with no sub-county would search thousands of wards — and changing a
 * level clears the levels under it, which no longer belong to it.
 *
 * Written once so the building, agency, store and address forms cannot drift.
 */
@Component({
  selector: 'app-address-fields',
  standalone: true,
  imports: [ReactiveFormsModule, EntityPickerComponent],
  template: `
    <ng-container [formGroup]="group()">
      <!-- One capped grid for the whole address: every field the same width, packed from the left. -->
      <div class="form-grid">
        <label class="field">
          <span>County</span>
          <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="Select a county" />
        </label>

        <label class="field">
          <span>Sub-county</span>
          @if (countyId(); as county) {
            <app-entity-picker [config]="pickers.subCountiesIn(county)" formControlName="subCountyId" placeholder="Select a sub-county" />
          } @else {
            <input disabled placeholder="Choose a county first">
          }
        </label>

        <label class="field">
          <span>Ward</span>
          @if (subCountyId(); as subCounty) {
            <app-entity-picker [config]="pickers.wardsIn(subCounty, countyId())" formControlName="wardId" placeholder="Select a ward" />
          } @else {
            <input disabled placeholder="Choose a sub-county first">
          }
        </label>

        <label class="field">
          <span>Town/locality</span>
          @if (wardId(); as ward) {
            <app-entity-picker [config]="pickers.townsIn(ward)" formControlName="townId" placeholder="Select a town or locality" />
          } @else {
            <input disabled placeholder="Choose a ward first">
          }
        </label>

        <label class="field">
          <span>Estate/area <span class="muted">(optional)</span></span>
          @if (townId(); as town) {
            <app-entity-picker [config]="pickers.estateAreasIn(town)" formControlName="estateAreaId" placeholder="Select an estate or area" />
          } @else {
            <input disabled placeholder="Choose a town first">
          }
        </label>

        <label class="field">
          <span>Street/road <span class="muted">(optional)</span></span>
          @if (estateAreaId(); as estate) {
            <app-entity-picker [config]="pickers.streetRoadsIn(estate)" formControlName="streetRoadId" placeholder="Select a street or road" />
          } @else {
            <input disabled placeholder="Choose an estate first">
          }
        </label>
        <label class="field">
          <span>Building/house</span>
          <input formControlName="buildingHouse" placeholder="e.g. Block C, House 12">
        </label>

        <!-- Postal code and directions, when the form has them, finish the same grid. -->
        @if (group().get('postalCode')) {
          <label class="field">
            <span>Postal code</span>
            <input formControlName="postalCode" placeholder="e.g. 00100">
          </label>
        }
        @if (group().get('description')) {
          <label class="field">
            <span>Directions</span>
            <input formControlName="description" placeholder="e.g. 3rd floor, Suite 302, near the main gate">
            <small class="hint">How someone finds it on the ground.</small>
          </label>
        }
      </div>
    </ng-container>
  `,
  styles: [`
    /* A row of its own when dropped into a form's grid (give it field--full there). */
    :host { display: block; }


  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressFieldsComponent {
  /** Any form group holding the ADDRESS_FIELD_CONTROLS keys. */
  readonly group = input.required<FormGroup>();
  readonly pickers = inject(EntityPickerRegistry);

  readonly countyId = signal<number | null>(null);
  readonly subCountyId = signal<number | null>(null);
  readonly wardId = signal<number | null>(null);
  readonly townId = signal<number | null>(null);
  readonly estateAreaId = signal<number | null>(null);

  constructor() {
    let subscriptions: Subscription[] = [];
    inject(DestroyRef).onDestroy(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));

    effect(() => {
      const group = this.group();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      const control = (name: string) => group.get(name) as FormControl<number | null>;
      const [countyId, subCountyId, wardId, townId, estateAreaId, streetRoadId] =
        ['countyId', 'subCountyId', 'wardId', 'townId', 'estateAreaId', 'streetRoadId'].map(control);

      this.countyId.set(countyId.value);
      this.subCountyId.set(subCountyId.value);
      this.wardId.set(wardId.value);
      this.townId.set(townId.value);
      this.estateAreaId.set(estateAreaId.value);

      /*
       * A changed level clears everything under it. Only on a real change: a
       * form patching an existing address sets every level at once, and must not
       * have its own sub-county wiped by the county it just set.
       */
      subscriptions = [
        countyId.valueChanges.subscribe((value) => {
          if (value !== this.countyId()) {
            this.countyId.set(value);
            subCountyId.setValue(null);
          }
        }),
        subCountyId.valueChanges.subscribe((value) => {
          if (value !== this.subCountyId()) {
            this.subCountyId.set(value);
            wardId.setValue(null);
          }
        }),
        wardId.valueChanges.subscribe((value) => {
          if (value !== this.wardId()) {
            this.wardId.set(value);
            townId.setValue(null);
          }
        }),
        townId.valueChanges.subscribe((value) => {
          if (value !== this.townId()) {
            this.townId.set(value);
            estateAreaId.setValue(null);
          }
        }),
        estateAreaId.valueChanges.subscribe((value) => {
          if (value !== this.estateAreaId()) {
            this.estateAreaId.set(value);
            streetRoadId.setValue(null);
          }
        })
      ];
    });
  }
}
