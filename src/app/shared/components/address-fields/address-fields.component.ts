import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subscription, debounceTime, firstValueFrom } from 'rxjs';
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
import { AddressDefaultsService } from '../../../features/addresses/address-defaults.service';
import { AddressesService } from '../../../features/addresses/addresses.service';
@Component({
  selector: 'app-address-fields',
  standalone: true,
  imports: [ReactiveFormsModule, EntityPickerComponent],
  template: `
    <ng-container [formGroup]="group()">
      <!-- One capped grid for the whole address: every field the same width, packed from the left. -->
      <div class="form-grid">
        <label class="field">
          <span>County @if (isRequired('countyId')) { <span class="req" aria-label="required">*</span> } @else { <span class="muted">(optional)</span> }</span>
          <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="Select a county" />
        </label>

        <label class="field">
          <span>Sub-county @if (isRequired('subCountyId')) { <span class="req" aria-label="required">*</span> } @else { <span class="muted">(optional)</span> }</span>
          @if (countyId(); as county) {
            <app-entity-picker [config]="pickers.subCountiesIn(county)" formControlName="subCountyId" placeholder="Select a sub-county" />
          } @else {
            <input disabled placeholder="Choose a county first">
          }
        </label>

        <label class="field">
          <span>Ward @if (isRequired('wardId')) { <span class="req" aria-label="required">*</span> } @else { <span class="muted">(optional)</span> }</span>
          @if (subCountyId(); as subCounty) {
            <app-entity-picker [config]="pickers.wardsIn(subCounty, countyId())" formControlName="wardId" placeholder="Select a ward" />
          } @else {
            <input disabled placeholder="Choose a sub-county first">
          }
        </label>

        <label class="field">
          <span>Town/locality @if (isRequired('townId')) { <span class="req" aria-label="required">*</span> } @else { <span class="muted">(optional)</span> }</span>
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
        <!-- A field the form adds just before the house, e.g. a landmark: <label before-building>. -->
        <ng-content select="[before-building]" />
        <label class="field">
          <span>Building/house <span class="muted">(optional)</span></span>
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
          <label class="field directions">
            <span>Directions</span>
            <input formControlName="description" placeholder="e.g. 3rd floor, Suite 302, near the main gate">
            <small class="hint">How someone finds it on the ground.</small>
          </label>
        }
      </div>
      <!-- How the address will read once saved: checked before saving, not discovered after. -->
      @if (showPreview() && preview()) {
        <p class="preview"><span class="preview__label">Will be saved as</span>{{ preview() }}</p>
      }
    </ng-container>
  `,
  styles: [`
    /* A row of its own when dropped into a form's grid (give it field--full there). */
    :host { display: block; }
    .req { color: var(--danger); font-weight: var(--weight-bold); }
    .preview { display: grid; gap: var(--space-0-5); margin: var(--space-3) 0 0; padding: var(--space-2) var(--space-3);
               border-radius: var(--radius-sm); background: var(--surface-2); font-weight: var(--weight-semibold); }
    .preview__label { font-size: var(--font-label); font-weight: var(--weight-regular); color: var(--text-muted); }

    /*
     * On a phone, two to a row rather than seven stacked: each level pairs with
     * the next (county with sub-county, ward with town, estate with street), so
     * the address reads as the path it is. Directions is a sentence; it keeps
     * the full row.
     */
    @media (max-width: 600px) {
      .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4) var(--space-2-5); }
      .directions { grid-column: 1 / -1; }
      .field > span { font-size: var(--text-sm); }
    }


  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressFieldsComponent {
  /** Any form group holding the ADDRESS_FIELD_CONTROLS keys. */
  readonly group = input.required<FormGroup>();
  /** Start a blank form at the admin's default county, sub-county and ward. */
  readonly applyDefaults = input(true);
  /** The levels this form requires (marked *); every other level says "(optional)". */
  readonly required = input<readonly string[]>(['countyId']);
  /** Show how the address will read, before it is saved. */
  readonly showPreview = input(false);
  readonly preview = signal('');
  private readonly addresses = inject(AddressesService);
  /** Place names by level and id, so the preview asks for each once. */
  private readonly names = new Map<string, string>();

  isRequired(key: string): boolean {
    return this.required().includes(key);
  }
  private readonly defaults = inject(AddressDefaultsService);
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

      subscriptions.push(group.valueChanges.pipe(debounceTime(150)).subscribe(() => void this.refreshPreview(group)));
      void this.refreshPreview(group);

      /*
       * Only a form nobody has filled: no county yet and untouched. The defaults
       * arrive later than an edit form's own address, so that check is what keeps
       * them from overwriting a saved place. Each level is set after the one above
       * it, because setting a level clears the ones below.
       */
      if (this.applyDefaults()) {
        subscriptions.push(this.defaults.get().subscribe((d) => {
          if (!d.countyId || countyId.value !== null || group.dirty) {
            return;
          }
          countyId.setValue(d.countyId);
          if (d.subCountyId) subCountyId.setValue(d.subCountyId);
          if (d.subCountyId && d.wardId) wardId.setValue(d.wardId);
        }));
      }
    });
  }

  /** "Block C, Simba Rd, Discovery, Kiuu, Githurai, Kiambu" — finest first, as addresses are shown everywhere else. */
  private async refreshPreview(group: FormGroup): Promise<void> {
    if (!this.showPreview()) {
      return;
    }
    const v = group.getRawValue() as Record<string, unknown>;
    const lookups: Array<[string, number | null, (id: number) => Observable<{ name: string }>]> = [
      ['street', v['streetRoadId'] as number | null, (id) => this.addresses.getStreetRoad(id)],
      ['estate', v['estateAreaId'] as number | null, (id) => this.addresses.getEstateArea(id)],
      ['town', v['townId'] as number | null, (id) => this.addresses.getTown(id)],
      ['ward', v['wardId'] as number | null, (id) => this.addresses.getWard(id)],
      ['subCounty', v['subCountyId'] as number | null, (id) => this.addresses.getSubCounty(id)],
      ['county', v['countyId'] as number | null, (id) => this.addresses.getCounty(id)]
    ];
    const parts = await Promise.all(lookups.map(async ([level, id, fetch]) => {
      if (id === null || id === undefined) {
        return '';
      }
      const key = `${level}:${id}`;
      if (!this.names.has(key)) {
        try {
          this.names.set(key, (await firstValueFrom(fetch(id))).name);
        } catch {
          return '';
        }
      }
      return this.names.get(key) ?? '';
    }));
    const house = String(v['buildingHouse'] ?? '').trim();
    this.preview.set([house, ...parts].filter((part) => part !== '').join(', '));
  }
}
