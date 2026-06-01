import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { AddressesService } from '../addresses.service';
import {
  CityOption,
  CityUpsertRequest,
  CountyOption,
  CountyUpsertRequest,
  TownOption,
  TownUpsertRequest
} from '../models/address.models';

type EditorLevel = 'county' | 'city' | 'town';
type EditorMode = 'create' | 'edit';

@Component({
  selector: 'app-address-management-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PermissionGateComponent,
    SectionCardComponent
  ],
  template: `
    <section class="stack address-management">
      <header class="panel page-head">
        <div class="page-head__copy">
          <p class="eyebrow">Address management</p>
          <h1 class="heading-lg">Counties, cities, and towns</h1>
          <p class="muted">Select a county to load its cities, then select a city to load its towns.</p>
        </div>

        <div class="page-head__meta">
          <span class="pill">{{ counties().length }} counties</span>
          <span class="pill">{{ cities().length }} cities</span>
          <span class="pill">{{ towns().length }} towns</span>
        </div>
      </header>

      @if (loadingCounties()) {
        <app-loading-state label="Loading counties..." />
      } @else if (countiesError()) {
        <app-error-state [message]="countiesError() || 'Unable to load counties'" (retry)="reloadAll()" />
      } @else {
        <section class="hierarchy-grid">
          <app-section-card title="Counties" subtitle="Level 1 loads first. Select one to work on its cities.">
            <ng-container actions>
              <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                <button type="button" class="btn section-action" (click)="openCountyCreate()">+ Add county</button>
              </app-permission-gate>
            </ng-container>

            @if (counties().length === 0) {
              <app-empty-state
                title="No counties found"
                description="Create the first county to unlock the hierarchy."
              />
            } @else {
              <div class="entry-list">
                @for (county of counties(); track county.id) {
                  <div class="entry-row" [class.entry-row--selected]="county.id === selectedCountyId()">
                    <button type="button" class="entry-row__select" (click)="selectCounty(county.id)">
                      <span class="entry-row__main">
                        <strong>{{ county.name }}</strong>
                        <span class="muted">{{ county.code || 'No code' }}</span>
                      </span>
                      @if (county.isActive === false) {
                        <span class="status-chip status-chip--danger">Inactive</span>
                      }
                    </button>

                    <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                      <button
                        type="button"
                        class="row-action"
                        (click)="openCountyEdit(county)"
                        aria-label="Edit county"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>

          <app-section-card
            title="Cities"
            [subtitle]="selectedCounty() ? 'Cities under ' + selectedCounty()!.name : 'Select a county to continue.'"
          >
            <ng-container actions>
              <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                <button
                  type="button"
                  class="btn section-action"
                  [disabled]="!selectedCounty()"
                  (click)="openCityCreate()"
                >
                  + Add city
                </button>
              </app-permission-gate>
            </ng-container>

            @if (!selectedCounty()) {
              <app-empty-state
                title="No county selected"
                description="Select a county from the left column to view its cities."
              />
            } @else if (loadingCities()) {
              <app-loading-state label="Loading cities..." />
            } @else if (citiesError()) {
              <app-error-state
                [message]="citiesError() || 'Unable to load cities'"
                (retry)="selectCounty(selectedCountyId() || 0)"
              />
            } @else if (cities().length === 0) {
              <app-empty-state
                title="No cities found"
                description="Add the first city for the selected county."
              />
            } @else {
              <div class="entry-list">
                @for (city of cities(); track city.id) {
                  <div class="entry-row" [class.entry-row--selected]="city.id === selectedCityId()">
                    <button type="button" class="entry-row__select" (click)="selectCity(city.id)">
                      <span class="entry-row__main">
                        <strong>{{ city.name }}</strong>
                        <span class="muted">{{ city.countyName || selectedCounty()?.name || 'County unavailable' }}</span>
                      </span>
                      @if (city.isActive === false) {
                        <span class="status-chip status-chip--danger">Inactive</span>
                      }
                    </button>

                    <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                      <button
                        type="button"
                        class="row-action"
                        (click)="openCityEdit(city)"
                        aria-label="Edit city"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>

          <app-section-card
            title="Towns"
            [subtitle]="selectedCity() ? 'Towns under ' + selectedCity()!.name : 'Select a city to continue.'"
          >
            <ng-container actions>
              <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                <button
                  type="button"
                  class="btn section-action"
                  [disabled]="!selectedCity()"
                  (click)="openTownCreate()"
                >
                  + Add town
                </button>
              </app-permission-gate>
            </ng-container>

            @if (!selectedCity()) {
              <app-empty-state
                title="No city selected"
                description="Select a city from the middle column to view its towns."
              />
            } @else if (loadingTowns()) {
              <app-loading-state label="Loading towns..." />
            } @else if (townsError()) {
              <app-error-state
                [message]="townsError() || 'Unable to load towns'"
                (retry)="selectCity(selectedCityId() || 0)"
              />
            } @else if (towns().length === 0) {
              <app-empty-state
                title="No towns found"
                description="Add the first town for the selected city."
              />
            } @else {
              <div class="entry-list">
                @for (town of towns(); track town.id) {
                  <div class="entry-row entry-row--static">
                    <div class="entry-row__select entry-row__select--static">
                      <span class="entry-row__main">
                        <strong>{{ town.name }}</strong>
                        <span class="muted">{{ town.cityName || selectedCity()?.name || 'City unavailable' }}</span>
                      </span>
                      @if (town.isActive === false) {
                        <span class="status-chip status-chip--danger">Inactive</span>
                      }
                    </div>

                    <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                      <button
                        type="button"
                        class="row-action"
                        (click)="openTownEdit(town)"
                        aria-label="Edit town"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>
        </section>
      }

      @if (editorLevel()) {
        <div class="modal-backdrop" (click)="closeEditor()">
          <section class="modal-card panel" (click)="$event.stopPropagation()">
            <header class="modal-head">
              <div class="stack">
                <p class="eyebrow">{{ editorLabel() }}</p>
                <h2 class="heading-lg">{{ editorTitle() }}</h2>
                <p class="muted">{{ editorSubtitle() }}</p>
              </div>

              <button type="button" class="modal-close" (click)="closeEditor()" aria-label="Close dialog">×</button>
            </header>

            @if (modalError()) {
              <div class="alert alert-error">{{ modalError() }}</div>
            }

            @if (editorLevel() === 'county') {
              <form class="stack modal-form" [formGroup]="countyForm" (ngSubmit)="saveCounty()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="County name">
                  </label>
                  <label class="field">
                    <span>Code</span>
                    <input formControlName="code" placeholder="County code">
                  </label>
                  <label class="field field--inline">
                    <input type="checkbox" formControlName="isActive">
                    <span>Active</span>
                  </label>
                </div>

                <div class="button-row">
                  <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancel</button>
                  <button type="submit" class="btn btn-primary" [disabled]="countySaving()">
                    {{ countyEditorMode() === 'edit' ? 'Save county' : 'Create county' }}
                  </button>
                </div>
              </form>
            }

            @if (editorLevel() === 'city') {
              <form class="stack modal-form" [formGroup]="cityForm" (ngSubmit)="saveCity()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>County</span>
                    <select formControlName="countyId">
                      <option value="">Select county</option>
                      @for (county of counties(); track county.id) {
                        <option [value]="county.id">{{ county.name }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="City name">
                  </label>
                  <label class="field field--inline">
                    <input type="checkbox" formControlName="isActive">
                    <span>Active</span>
                  </label>
                </div>

                <div class="button-row">
                  <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancel</button>
                  <button type="submit" class="btn btn-primary" [disabled]="citySaving()">
                    {{ cityEditorMode() === 'edit' ? 'Save city' : 'Create city' }}
                  </button>
                </div>
              </form>
            }

            @if (editorLevel() === 'town') {
              <form class="stack modal-form" [formGroup]="townForm" (ngSubmit)="saveTown()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>County</span>
                    <select formControlName="countyId" (change)="onTownCountyChanged()">
                      <option value="">Select county</option>
                      @for (county of counties(); track county.id) {
                        <option [value]="county.id">{{ county.name }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>City</span>
                    <select formControlName="cityId">
                      <option value="">Select city</option>
                      @for (city of townCityOptions(); track city.id) {
                        <option [value]="city.id">{{ city.name }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="Town name">
                  </label>
                  <label class="field field--inline">
                    <input type="checkbox" formControlName="isActive">
                    <span>Active</span>
                  </label>
                </div>

                <div class="button-row">
                  <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancel</button>
                  <button type="submit" class="btn btn-primary" [disabled]="townSaving()">
                    {{ townEditorMode() === 'edit' ? 'Save town' : 'Create town' }}
                  </button>
                </div>
              </form>
            }
          </section>
        </div>
      }
    </section>
  `,
  styles: [`
    .address-management {
      position: relative;
    }

    .page-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 1.15rem 1.25rem;
    }

    .page-head__copy {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
    }

    .page-head__copy h1,
    .page-head__copy p {
      margin: 0;
    }

    .page-head__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      align-items: flex-start;
    }

    .hierarchy-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: start;
    }

    .section-action {
      padding: 0.55rem 0.95rem;
      border: 1px solid rgba(217, 130, 43, 0.26);
      background: rgba(217, 130, 43, 0.08);
      color: var(--accent);
      box-shadow: none;
      font-weight: 700;
    }

    .section-action:hover {
      background: rgba(217, 130, 43, 0.14);
    }

    .entry-list {
      display: grid;
      gap: 0.55rem;
    }

    .entry-row {
      display: flex;
      align-items: stretch;
      gap: 0.55rem;
      border-radius: 16px;
      transition: background 0.18s ease, transform 0.18s ease;
    }

    .entry-row:hover,
    .entry-row--selected {
      background: rgba(79, 132, 217, 0.06);
      transform: translateY(-1px);
    }

    .entry-row__select {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.88rem 0.95rem;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.88);
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }

    .entry-row__select--static {
      cursor: default;
    }

    .entry-row__main {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }

    .entry-row__main strong,
    .entry-row__main .muted {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-action {
      width: 2.5rem;
      flex: none;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(79, 132, 217, 0.14);
      border-radius: 999px;
      background: rgba(79, 132, 217, 0.07);
      color: var(--primary-strong);
      opacity: 0;
      transform: translateX(-0.25rem);
      transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease;
      cursor: pointer;
    }

    .row-action:hover {
      background: rgba(79, 132, 217, 0.14);
    }

    .entry-row:hover .row-action,
    .entry-row:focus-within .row-action,
    .entry-row--selected .row-action {
      opacity: 1;
      transform: translateX(0);
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.32rem 0.65rem;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .status-chip--danger {
      color: var(--danger);
      background: rgba(201, 79, 79, 0.1);
      border: 1px solid rgba(201, 79, 79, 0.18);
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 1.25rem;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(6px);
    }

    .modal-card {
      width: min(100%, 560px);
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
      max-height: calc(100vh - 2.5rem);
      overflow: auto;
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
    }

    .modal-head h2,
    .modal-head p {
      margin: 0;
    }

    .modal-close {
      width: 2.3rem;
      height: 2.3rem;
      flex: none;
      border: 1px solid rgba(15, 23, 42, 0.1);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.04);
      color: var(--text-muted);
      cursor: pointer;
    }

    .modal-form {
      gap: 1rem;
    }

    .modal-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.8rem;
    }

    .field--inline {
      align-self: end;
      display: flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 2.9rem;
      padding-top: 1.5rem;
    }

    .field--inline input[type='checkbox'] {
      width: 1rem;
      height: 1rem;
      margin: 0;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    @media (max-width: 1080px) {
      .hierarchy-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .page-head {
        padding: 1rem;
      }

      .modal-backdrop {
        padding: 0.75rem;
      }

      .entry-row:hover .row-action,
      .entry-row:focus-within .row-action,
      .entry-row--selected .row-action {
        opacity: 1;
        transform: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressManagementPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly addressesService = inject(AddressesService);

  readonly loadingCounties = signal(false);
  readonly loadingCities = signal(false);
  readonly loadingTowns = signal(false);

  readonly countiesError = signal<string | null>(null);
  readonly citiesError = signal<string | null>(null);
  readonly townsError = signal<string | null>(null);
  readonly modalError = signal<string | null>(null);

  readonly counties = signal<CountyOption[]>([]);
  readonly cities = signal<CityOption[]>([]);
  readonly towns = signal<TownOption[]>([]);
  readonly townCityOptions = signal<CityOption[]>([]);

  readonly selectedCountyId = signal<number | null>(null);
  readonly selectedCityId = signal<number | null>(null);

  readonly countyEditorMode = signal<EditorMode>('create');
  readonly cityEditorMode = signal<EditorMode>('create');
  readonly townEditorMode = signal<EditorMode>('create');

  readonly editorLevel = signal<EditorLevel | null>(null);

  readonly countySaving = signal(false);
  readonly citySaving = signal(false);
  readonly townSaving = signal(false);

  readonly countyEditingId = signal<number | null>(null);
  readonly cityEditingId = signal<number | null>(null);
  readonly townEditingId = signal<number | null>(null);

  readonly countyForm = this.fb.group({
    name: ['', Validators.required],
    code: [''],
    isActive: [true]
  });

  readonly cityForm = this.fb.group({
    countyId: ['', Validators.required],
    name: ['', Validators.required],
    isActive: [true]
  });

  readonly townForm = this.fb.group({
    countyId: ['', Validators.required],
    cityId: ['', Validators.required],
    name: ['', Validators.required],
    isActive: [true]
  });

  async ngOnInit(): Promise<void> {
    await this.reloadAll();
  }

  async reloadAll(): Promise<void> {
    await this.loadCounties();

    if (this.counties().length === 0) {
      this.selectedCountyId.set(null);
      this.selectedCityId.set(null);
      this.cities.set([]);
      this.towns.set([]);
      this.townCityOptions.set([]);
      return;
    }

    const retainedCounty = this.selectedCountyId();
    const countyId = retainedCounty && this.counties().some((county) => county.id === retainedCounty)
      ? retainedCounty
      : this.counties()[0].id;

    await this.selectCounty(countyId, true);
  }

  selectedCounty(): CountyOption | null {
    const countyId = this.selectedCountyId();
    return countyId ? this.counties().find((county) => county.id === countyId) || null : null;
  }

  selectedCity(): CityOption | null {
    const cityId = this.selectedCityId();
    return cityId ? this.cities().find((city) => city.id === cityId) || null : null;
  }

  async selectCounty(countyId: number, preserveCitySelection = true): Promise<void> {
    this.selectedCountyId.set(countyId);
    this.citiesError.set(null);
    this.townsError.set(null);

    await this.loadCities(countyId);
    this.townCityOptions.set(this.cities());

    const currentCityId = preserveCitySelection ? this.selectedCityId() : null;
    const retainedCityId = currentCityId && this.cities().some((city) => city.id === currentCityId) ? currentCityId : null;
    const nextCityId = retainedCityId ?? this.cities()[0]?.id ?? null;

    this.selectedCityId.set(nextCityId);

    if (nextCityId) {
      await this.loadTowns(nextCityId);
    } else {
      this.towns.set([]);
      this.townsError.set(null);
    }
  }

  async selectCity(cityId: number): Promise<void> {
    this.selectedCityId.set(cityId);
    this.townsError.set(null);
    this.townCityOptions.set(this.cities());
    await this.loadTowns(cityId);
  }

  openCountyCreate(): void {
    this.editorLevel.set('county');
    this.countyEditorMode.set('create');
    this.countyEditingId.set(null);
    this.modalError.set(null);
    this.countyForm.reset({
      name: '',
      code: '',
      isActive: true
    });
  }

  openCountyEdit(county: CountyOption): void {
    this.editorLevel.set('county');
    this.countyEditorMode.set('edit');
    this.countyEditingId.set(county.id);
    this.modalError.set(null);
    this.countyForm.reset({
      name: county.name,
      code: county.code || '',
      isActive: county.isActive !== false
    });
  }

  openCityCreate(): void {
    const countyId = this.selectedCountyId();
    if (!countyId) {
      return;
    }

    this.editorLevel.set('city');
    this.cityEditorMode.set('create');
    this.cityEditingId.set(null);
    this.modalError.set(null);
    this.cityForm.reset({
      countyId: String(countyId),
      name: '',
      isActive: true
    });
  }

  openCityEdit(city: CityOption): void {
    this.editorLevel.set('city');
    this.cityEditorMode.set('edit');
    this.cityEditingId.set(city.id);
    this.modalError.set(null);
    this.cityForm.reset({
      countyId: String(city.countyId),
      name: city.name,
      isActive: city.isActive !== false
    });
  }

  openTownCreate(): void {
    const countyId = this.selectedCountyId();
    const cityId = this.selectedCityId();
    if (!countyId || !cityId) {
      return;
    }

    this.editorLevel.set('town');
    this.townEditorMode.set('create');
    this.townEditingId.set(null);
    this.modalError.set(null);
    this.townCityOptions.set(this.cities());
    this.townForm.reset({
      countyId: String(countyId),
      cityId: String(cityId),
      name: '',
      isActive: true
    });
  }

  openTownEdit(town: TownOption): void {
    const countyId = town.countyId || this.findCountyIdForCity(town.cityId);

    this.editorLevel.set('town');
    this.townEditorMode.set('edit');
    this.townEditingId.set(town.id);
    this.modalError.set(null);
    this.townForm.reset({
      countyId: String(countyId || ''),
      cityId: String(town.cityId),
      name: town.name,
      isActive: town.isActive !== false
    });

    void this.loadTownCityOptions(countyId || null);
  }

  closeEditor(): void {
    this.editorLevel.set(null);
    this.modalError.set(null);
  }

  async onTownCountyChanged(): Promise<void> {
    const countyId = this.parseId(this.townForm.controls.countyId.value);
    if (!countyId) {
      this.townCityOptions.set([]);
      this.townForm.controls.cityId.setValue('');
      return;
    }

    await this.loadTownCityOptions(countyId);

    const currentCityId = this.parseId(this.townForm.controls.cityId.value);
    if (!currentCityId || !this.townCityOptions().some((city) => city.id === currentCityId)) {
      this.townForm.controls.cityId.setValue(this.townCityOptions()[0]?.id ? String(this.townCityOptions()[0].id) : '');
    }
  }

  async saveCounty(): Promise<void> {
    if (this.countyForm.invalid) {
      this.countyForm.markAllAsTouched();
      return;
    }

    this.countySaving.set(true);
    this.modalError.set(null);

    try {
      const payload = this.toCountyPayload();
      const saved = this.countyEditorMode() === 'edit'
        ? await firstValueFrom(this.addressesService.updateCounty(this.countyEditingId() || 0, payload))
        : await firstValueFrom(this.addressesService.createCounty(payload));

      this.closeEditor();
      await this.loadCounties();
      await this.selectCounty(saved.id, false);
    } catch (error) {
      this.modalError.set(this.extractErrorMessage(error));
    } finally {
      this.countySaving.set(false);
    }
  }

  async saveCity(): Promise<void> {
    if (this.cityForm.invalid) {
      this.cityForm.markAllAsTouched();
      return;
    }

    this.citySaving.set(true);
    this.modalError.set(null);

    try {
      const payload = this.toCityPayload();
      const saved = this.cityEditorMode() === 'edit'
        ? await firstValueFrom(this.addressesService.updateCity(this.cityEditingId() || 0, payload))
        : await firstValueFrom(this.addressesService.createCity(payload));

      this.closeEditor();
      await this.selectCounty(saved.countyId, true);
      this.selectedCityId.set(saved.id);
      await this.loadTowns(saved.id);
    } catch (error) {
      this.modalError.set(this.extractErrorMessage(error));
    } finally {
      this.citySaving.set(false);
    }
  }

  async saveTown(): Promise<void> {
    if (this.townForm.invalid) {
      this.townForm.markAllAsTouched();
      return;
    }

    this.townSaving.set(true);
    this.modalError.set(null);

    try {
      const payload = this.toTownPayload();
      const saved = this.townEditorMode() === 'edit'
        ? await firstValueFrom(this.addressesService.updateTown(this.townEditingId() || 0, payload))
        : await firstValueFrom(this.addressesService.createTown(payload));

      const countyId = saved.countyId || this.findCountyIdForCity(saved.cityId) || this.selectedCountyId() || 0;
      this.closeEditor();
      await this.selectCounty(countyId, true);
      this.selectedCityId.set(saved.cityId);
      await this.loadTowns(saved.cityId);
    } catch (error) {
      this.modalError.set(this.extractErrorMessage(error));
    } finally {
      this.townSaving.set(false);
    }
  }

  editorLabel(): string {
    return this.editorLevel() === 'county' ? 'County' : this.editorLevel() === 'city' ? 'City' : 'Town';
  }

  editorTitle(): string {
    const level = this.editorLabel().toLowerCase();
    return this.editorModeForActiveLevel() === 'edit' ? `Edit ${level}` : `Add ${level}`;
  }

  editorSubtitle(): string {
    switch (this.editorLevel()) {
      case 'county':
        return this.countyEditorMode() === 'edit'
          ? 'Update the county details and status.'
          : 'Create a county to start the hierarchy.';
      case 'city':
        return this.cityEditorMode() === 'edit'
          ? `Update the city details for ${this.selectedCounty()?.name || 'the selected county'}.`
          : `Create a city under ${this.selectedCounty()?.name || 'the selected county'}.`;
      case 'town':
        return this.townEditorMode() === 'edit'
          ? 'Update the town details and parent city.'
          : 'Create a town under the selected county and city.';
      default:
        return '';
    }
  }

  private editorModeForActiveLevel(): EditorMode {
    switch (this.editorLevel()) {
      case 'county':
        return this.countyEditorMode();
      case 'city':
        return this.cityEditorMode();
      case 'town':
        return this.townEditorMode();
      default:
        return 'create';
    }
  }

  private async loadCounties(): Promise<void> {
    this.loadingCounties.set(true);
    this.countiesError.set(null);

    try {
      this.counties.set(await firstValueFrom(this.addressesService.getCounties()));
    } catch (error) {
      this.counties.set([]);
      this.countiesError.set(this.extractErrorMessage(error));
    } finally {
      this.loadingCounties.set(false);
    }
  }

  private async loadCities(countyId: number): Promise<void> {
    this.loadingCities.set(true);
    this.citiesError.set(null);

    try {
      this.cities.set(await firstValueFrom(this.addressesService.getCitiesByCounty(countyId)));
    } catch (error) {
      this.cities.set([]);
      this.citiesError.set(this.extractErrorMessage(error));
    } finally {
      this.loadingCities.set(false);
    }
  }

  private async loadTowns(cityId: number): Promise<void> {
    this.loadingTowns.set(true);
    this.townsError.set(null);

    try {
      this.towns.set(await firstValueFrom(this.addressesService.getTownsByCity(cityId)));
    } catch (error) {
      this.towns.set([]);
      this.townsError.set(this.extractErrorMessage(error));
    } finally {
      this.loadingTowns.set(false);
    }
  }

  private async loadTownCityOptions(countyId: number | null): Promise<void> {
    if (!countyId) {
      this.townCityOptions.set([]);
      return;
    }

    try {
      this.townCityOptions.set(await firstValueFrom(this.addressesService.getCitiesByCounty(countyId)));
    } catch (error) {
      this.townCityOptions.set([]);
      this.modalError.set(this.extractErrorMessage(error));
    }
  }

  private findCountyIdForCity(cityId: number): number {
    const city = this.cities().find((entry) => entry.id === cityId);
    if (city) {
      return city.countyId;
    }

    const townCity = this.townCityOptions().find((entry) => entry.id === cityId);
    return townCity?.countyId || this.selectedCountyId() || 0;
  }

  private parseId(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  private toCountyPayload(): CountyUpsertRequest {
    return {
      name: this.countyForm.controls.name.value.trim(),
      code: this.normalizeOptionalText(this.countyForm.controls.code.value),
      isActive: this.countyForm.controls.isActive.value
    };
  }

  private toCityPayload(): CityUpsertRequest {
    return {
      countyId: this.parseId(this.cityForm.controls.countyId.value) || 0,
      name: this.cityForm.controls.name.value.trim(),
      isActive: this.cityForm.controls.isActive.value
    };
  }

  private toTownPayload(): TownUpsertRequest {
    return {
      cityId: this.parseId(this.townForm.controls.cityId.value) || 0,
      name: this.townForm.controls.name.value.trim(),
      isActive: this.townForm.controls.isActive.value
    };
  }

  private normalizeOptionalText(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string; details?: string[] } }).error;
      return backendError?.message || backendError?.details?.[0] || 'Request failed';
    }

    return 'Request failed';
  }
}
