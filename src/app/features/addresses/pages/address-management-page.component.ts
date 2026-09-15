import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { AddressesService } from '../addresses.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import {
  CityOption,
  CityUpsertRequest,
  CountyOption,
  CountyUpsertRequest,
  SubCountyOption,
  SubCountyUpsertRequest,
  TownOption,
  TownUpsertRequest,
  WardOption,
  WardUpsertRequest
} from '../models/address.models';

type EditorLevel = 'county' | 'city' | 'town' | 'subCounty' | 'ward';
type EditorMode = 'create' | 'edit';

/**
 * Kenya numbers places twice. Counties split into sub-counties and then wards
 * for administration and elections; they also hold cities that hold towns,
 * which is how people say where they live. Neither branch nests inside the
 * other, so the page hangs both off the county rather than pretending to a
 * single five-level ladder.
 */
type Branch = 'settlement' | 'administrative';

@Component({
  selector: 'app-address-management-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PermissionGateComponent,
    SectionCardComponent,
    SearchableSelectComponent,
    FieldErrorComponent,
    ErrorCardComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack address-management">
      <header class="panel page-head">
        <div class="page-head__copy">
          <p class="eyebrow">Address management</p>
          <h1 class="heading-lg">Places</h1>
          <p class="muted">{{ branchHint() }}</p>
        </div>

        <div class="page-head__meta">
          <span class="pill">{{ counties().length }} counties</span>
          @if (branch() === 'settlement') {
            <span class="pill">{{ cities().length }} cities</span>
            <span class="pill">{{ towns().length }} towns</span>
          } @else {
            <span class="pill">{{ subCounties().length }} sub-counties</span>
            <span class="pill">{{ wards().length }} wards</span>
          }
        </div>
      </header>

      @if (loadingCounties()) {
        <app-loading-state label="Loading counties..." />
      } @else if (countiesError()) {
        <app-error-state [message]="countiesError() || 'Unable to load counties'" (retry)="reloadAll()" />
      } @else {
        @if (actionError(); as apiError) {
          <app-error-card
            title="Unable to complete that"
            [message]="apiError.message"
            [details]="apiError.details"
          />
        }

        <nav class="tabs" role="tablist" aria-label="Place hierarchy">
          <button
            type="button"
            role="tab"
            class="tabs__tab"
            [class.tabs__tab--active]="branch() === 'settlement'"
            [attr.aria-selected]="branch() === 'settlement'"
            (click)="showBranch('settlement')"
          >Cities and towns</button>
          <button
            type="button"
            role="tab"
            class="tabs__tab"
            [class.tabs__tab--active]="branch() === 'administrative'"
            [attr.aria-selected]="branch() === 'administrative'"
            (click)="showBranch('administrative')"
          >Sub-counties and wards</button>
        </nav>

        <section class="hierarchy-grid">
          <app-section-card title="Counties" [subtitle]="countiesSubtitle()">
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
                        title="Edit county"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>

                    </app-permission-gate>

                    <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                      <button
                        type="button"
                        class="row-action row-action--danger"
                        (click)="deleteCounty(county)"
                        aria-label="Delete county"
                        title="Delete county"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>

          @if (branch() === 'settlement') {
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
                        title="Edit city"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>

                    </app-permission-gate>

                    <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                      <button
                        type="button"
                        class="row-action row-action--danger"
                        (click)="deleteCity(city)"
                        aria-label="Delete city"
                        title="Delete city"
                      >
                        <span aria-hidden="true">🗑</span>
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
                        title="Edit town"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>

                    </app-permission-gate>

                    <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                      <button
                        type="button"
                        class="row-action row-action--danger"
                        (click)="deleteTown(town)"
                        aria-label="Delete town"
                        title="Delete town"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>
          } @else {
          <app-section-card
            title="Sub-counties"
            [subtitle]="selectedCounty() ? 'Sub-counties of ' + selectedCounty()!.name : 'Select a county to continue.'"
          >
            <ng-container actions>
              <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                <button
                  type="button"
                  class="btn section-action"
                  [disabled]="!selectedCounty()"
                  (click)="openSubCountyCreate()"
                >
                  + Add sub-county
                </button>
              </app-permission-gate>
            </ng-container>

            @if (!selectedCounty()) {
              <app-empty-state
                title="No county selected"
                description="Select a county from the left column to view its sub-counties."
              />
            } @else if (loadingSubCounties()) {
              <app-loading-state label="Loading sub-counties..." />
            } @else if (subCountiesError()) {
              <app-error-state
                [message]="subCountiesError() || 'Unable to load sub-counties'"
                (retry)="selectCounty(selectedCountyId() || 0)"
              />
            } @else if (subCounties().length === 0) {
              <app-empty-state
                title="No sub-counties found"
                description="Add the first sub-county for the selected county."
              />
            } @else {
              <div class="entry-list">
                @for (subCounty of subCounties(); track subCounty.id) {
                  <div class="entry-row" [class.entry-row--selected]="subCounty.id === selectedSubCountyId()">
                    <button type="button" class="entry-row__select" (click)="selectSubCounty(subCounty.id)">
                      <span class="entry-row__main">
                        <strong>{{ subCounty.name }}</strong>
                        <span class="muted">{{ subCounty.countyName || selectedCounty()?.name || 'County unavailable' }}</span>
                      </span>
                    </button>

                    <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                      <button
                        type="button"
                        class="row-action"
                        (click)="openSubCountyEdit(subCounty)"
                        aria-label="Edit sub-county"
                        title="Edit sub-county"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>

                    </app-permission-gate>

                    <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                      <button
                        type="button"
                        class="row-action row-action--danger"
                        (click)="deleteSubCounty(subCounty)"
                        aria-label="Delete sub-county"
                        title="Delete sub-county"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>

          <app-section-card
            title="Wards"
            [subtitle]="selectedSubCounty() ? 'Wards of ' + selectedSubCounty()!.name : 'Select a sub-county to continue.'"
          >
            <ng-container actions>
              <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                <button
                  type="button"
                  class="btn section-action"
                  [disabled]="!selectedSubCounty()"
                  (click)="openWardCreate()"
                >
                  + Add ward
                </button>
              </app-permission-gate>
            </ng-container>

            @if (!selectedSubCounty()) {
              <app-empty-state
                title="No sub-county selected"
                description="Select a sub-county from the middle column to view its wards."
              />
            } @else if (loadingWards()) {
              <app-loading-state label="Loading wards..." />
            } @else if (wardsError()) {
              <app-error-state
                [message]="wardsError() || 'Unable to load wards'"
                (retry)="selectSubCounty(selectedSubCountyId() || 0)"
              />
            } @else if (wards().length === 0) {
              <app-empty-state
                title="No wards found"
                description="Add the first ward for the selected sub-county."
              />
            } @else {
              <div class="entry-list">
                @for (ward of wards(); track ward.id) {
                  <div class="entry-row entry-row--static">
                    <div class="entry-row__select entry-row__select--static">
                      <span class="entry-row__main">
                        <strong>{{ ward.name }}</strong>
                        <span class="muted">{{ ward.subCountyName || selectedSubCounty()?.name || 'Sub-county unavailable' }}</span>
                      </span>
                    </div>

                    <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                      <button
                        type="button"
                        class="row-action"
                        (click)="openWardEdit(ward)"
                        aria-label="Edit ward"
                        title="Edit ward"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>

                    </app-permission-gate>

                    <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                      <button
                        type="button"
                        class="row-action row-action--danger"
                        (click)="deleteWard(ward)"
                        aria-label="Delete ward"
                        title="Delete ward"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>
                    </app-permission-gate>
                  </div>
                }
              </div>
            }
          </app-section-card>
          }
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

            @if (modalError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'Already exists' : 'Unable to save'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            @if (editorLevel() === 'county') {
              <form class="stack modal-form" [formGroup]="countyForm" appFormFeedback (ngSubmit)="saveCounty()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="County name">
                    <app-field-error [control]="countyForm.controls.name" label="Name" />
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
              <form class="stack modal-form" [formGroup]="cityForm" appFormFeedback (ngSubmit)="saveCity()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>County</span>
                    <app-searchable-select
                      formControlName="countyId"
                      [options]="countyOptions()"
                      [required]="true"
                      placeholder="Select county"
                      searchPlaceholder="Search counties…"
                    />
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="City name">
                    <app-field-error [control]="cityForm.controls.name" label="Name" />
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
              <form class="stack modal-form" [formGroup]="townForm" appFormFeedback (ngSubmit)="saveTown()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>County</span>
                    <app-searchable-select
                      formControlName="countyId"
                      [options]="countyOptions()"
                      [required]="true"
                      placeholder="Select county"
                      searchPlaceholder="Search counties…"
                      (selectionChange)="onTownCountyChanged()"
                    />
                  </label>
                  <label class="field">
                    <span>City</span>
                    <app-searchable-select
                      formControlName="cityId"
                      [options]="townCitySelectOptions()"
                      [required]="true"
                      placeholder="Select city"
                      searchPlaceholder="Search cities…"
                    />
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="Town name">
                    <app-field-error [control]="townForm.controls.name" label="Name" />
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

            @if (editorLevel() === 'subCounty') {
              <form class="stack modal-form" [formGroup]="subCountyForm" appFormFeedback (ngSubmit)="saveSubCounty()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>County</span>
                    <app-searchable-select
                      formControlName="countyId"
                      [options]="countyOptions()"
                      [required]="true"
                      placeholder="Select county"
                      searchPlaceholder="Search counties…"
                    />
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="Sub-county name">
                    <app-field-error [control]="subCountyForm.controls.name" label="Name" />
                  </label>
                </div>

                <div class="button-row">
                  <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancel</button>
                  <button type="submit" class="btn btn-primary" [disabled]="subCountySaving()">
                    {{ subCountyEditorMode() === 'edit' ? 'Save sub-county' : 'Create sub-county' }}
                  </button>
                </div>
              </form>
            }

            @if (editorLevel() === 'ward') {
              <form class="stack modal-form" [formGroup]="wardForm" appFormFeedback (ngSubmit)="saveWard()">
                <div class="grid-auto modal-grid">
                  <label class="field">
                    <span>County</span>
                    <app-searchable-select
                      formControlName="countyId"
                      [options]="countyOptions()"
                      [required]="true"
                      placeholder="Select county"
                      searchPlaceholder="Search counties…"
                      (selectionChange)="onWardCountyChanged()"
                    />
                  </label>
                  <label class="field">
                    <span>Sub-county</span>
                    <app-searchable-select
                      formControlName="subCountyId"
                      [options]="wardSubCountySelectOptions()"
                      [required]="true"
                      placeholder="Select sub-county"
                      searchPlaceholder="Search sub-counties…"
                    />
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="name" placeholder="Ward name">
                    <app-field-error [control]="wardForm.controls.name" label="Name" />
                  </label>
                </div>

                <div class="button-row">
                  <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancel</button>
                  <button type="submit" class="btn btn-primary" [disabled]="wardSaving()">
                    {{ wardEditorMode() === 'edit' ? 'Save ward' : 'Create ward' }}
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
      gap: 0.4rem;
      min-width: 0;
    }

    .page-head__copy h1,
    .page-head__copy p {
      margin: 0;
    }

    .page-head__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
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
      border: 1px solid var(--warning-border);
      background: var(--warning-tint);
      color: var(--accent);
      box-shadow: none;
      font-weight: 700;
    }

    .section-action:hover {
      background: var(--warning-tint);
    }

    .entry-list {
      display: grid;
      gap: 0.6rem;
    }

    .entry-row {
      display: flex;
      align-items: stretch;
      gap: 0.6rem;
      border-radius: 16px;
      transition: background 0.18s ease, transform 0.18s ease;
    }

    .entry-row:hover,
    .entry-row--selected {
      background: var(--primary-tint);
      transform: translateY(-1px);
    }

    .entry-row__select {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.88rem 0.95rem;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--surface);
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
      border: 1px solid var(--primary-ring);
      border-radius: 999px;
      background: var(--primary-tint);
      color: var(--primary-strong);
      opacity: 0;
      transform: translateX(-0.25rem);
      transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease;
      cursor: pointer;
    }

    .row-action:hover {
      background: var(--primary-ring);
    }

    .row-action--danger {
      border-color: var(--danger-border);
      background: var(--danger-tint);
      color: var(--danger);
    }

    .row-action--danger:hover {
      background: var(--danger-border);
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
      gap: 0.4rem;
      padding: 0.32rem 0.65rem;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .status-chip--danger {
      color: var(--danger);
      background: var(--danger-tint);
      border: 1px solid var(--danger-border);
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 1.25rem;
      background: rgba(33, 43, 38, 0.45);
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
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: pointer;
    }

    .modal-form {
      gap: 1rem;
    }

    .modal-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
    }

    .field--inline {
      align-self: end;
      display: flex;
      align-items: center;
      gap: 0.6rem;
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
  private readonly confirmDialog = inject(ConfirmService);

  /** Which of the two ladders under a county is on screen. */
  readonly branch = signal<Branch>('settlement');

  readonly loadingCounties = signal(false);
  readonly loadingCities = signal(false);
  readonly loadingTowns = signal(false);
  readonly loadingSubCounties = signal(false);
  readonly loadingWards = signal(false);

  readonly countiesError = signal<string | null>(null);
  readonly citiesError = signal<string | null>(null);
  readonly townsError = signal<string | null>(null);
  readonly subCountiesError = signal<string | null>(null);
  readonly wardsError = signal<string | null>(null);
  /** A refused delete belongs next to the lists, not in place of one. */
  readonly actionError = signal<ApiError | null>(null);
  /** The whole rejection, so a 400's per-field details survive (§31.2). */
  readonly modalError = signal<ApiError | null>(null);

  readonly counties = signal<CountyOption[]>([]);
  readonly cities = signal<CityOption[]>([]);
  readonly towns = signal<TownOption[]>([]);
  readonly townCityOptions = signal<CityOption[]>([]);
  readonly subCounties = signal<SubCountyOption[]>([]);
  readonly wards = signal<WardOption[]>([]);
  readonly wardSubCountyOptions = signal<SubCountyOption[]>([]);

  readonly countyOptions = computed<SelectOption<string>[]>(() =>
    this.counties().map((county) => ({
      value: String(county.id),
      label: county.name
    }))
  );

  readonly townCitySelectOptions = computed<SelectOption<string>[]>(() =>
    this.townCityOptions().map((city) => ({
      value: String(city.id),
      label: city.name
    }))
  );

  readonly wardSubCountySelectOptions = computed<SelectOption<string>[]>(() =>
    this.wardSubCountyOptions().map((subCounty) => ({
      value: String(subCounty.id),
      label: subCounty.name
    }))
  );

  readonly selectedCountyId = signal<number | null>(null);
  readonly selectedCityId = signal<number | null>(null);
  readonly selectedSubCountyId = signal<number | null>(null);

  readonly countyEditorMode = signal<EditorMode>('create');
  readonly cityEditorMode = signal<EditorMode>('create');
  readonly townEditorMode = signal<EditorMode>('create');
  readonly subCountyEditorMode = signal<EditorMode>('create');
  readonly wardEditorMode = signal<EditorMode>('create');

  readonly editorLevel = signal<EditorLevel | null>(null);

  readonly countySaving = signal(false);
  readonly citySaving = signal(false);
  readonly townSaving = signal(false);
  readonly subCountySaving = signal(false);
  readonly wardSaving = signal(false);

  readonly countyEditingId = signal<number | null>(null);
  readonly cityEditingId = signal<number | null>(null);
  readonly townEditingId = signal<number | null>(null);
  readonly subCountyEditingId = signal<number | null>(null);
  readonly wardEditingId = signal<number | null>(null);

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

  // Sub-counties and wards carry no code or active flag: the boundaries are set
  // by law, not by us, so there is nothing here to switch off.
  readonly subCountyForm = this.fb.group({
    countyId: ['', Validators.required],
    name: ['', Validators.required]
  });

  readonly wardForm = this.fb.group({
    countyId: ['', Validators.required],
    subCountyId: ['', Validators.required],
    name: ['', Validators.required]
  });

  async ngOnInit(): Promise<void> {
    await this.reloadAll();
  }

  async reloadAll(): Promise<void> {
    await this.loadCounties();

    if (this.counties().length === 0) {
      this.selectedCountyId.set(null);
      this.selectedCityId.set(null);
      this.selectedSubCountyId.set(null);
      this.cities.set([]);
      this.towns.set([]);
      this.townCityOptions.set([]);
      this.subCounties.set([]);
      this.wards.set([]);
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

  async selectCounty(countyId: number, preserveChildSelection = true): Promise<void> {
    this.selectedCountyId.set(countyId);
    this.citiesError.set(null);
    this.townsError.set(null);
    this.subCountiesError.set(null);
    this.wardsError.set(null);

    // Only the visible branch is fetched. The other one loads when its tab is
    // opened, so switching counties is one request rather than four.
    if (this.branch() === 'administrative') {
      await this.loadAdministrativeBranch(countyId, preserveChildSelection);
      return;
    }

    await this.loadSettlementBranch(countyId, preserveChildSelection);
  }

  private async loadSettlementBranch(countyId: number, preserveCitySelection: boolean): Promise<void> {
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
      this.modalError.set(toApiError(error));
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
      this.modalError.set(toApiError(error));
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
      this.modalError.set(toApiError(error));
    } finally {
      this.townSaving.set(false);
    }
  }

  editorLabel(): string {
    switch (this.editorLevel()) {
      case 'county':
        return 'County';
      case 'city':
        return 'City';
      case 'town':
        return 'Town';
      case 'subCounty':
        return 'Sub-county';
      case 'ward':
        return 'Ward';
      default:
        return '';
    }
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
      case 'subCounty':
        return this.subCountyEditorMode() === 'edit'
          ? 'Update the sub-county name or move it to another county.'
          : `Create a sub-county under ${this.selectedCounty()?.name || 'the selected county'}.`;
      case 'ward':
        return this.wardEditorMode() === 'edit'
          ? 'Update the ward name or move it to another sub-county.'
          : 'Create a ward under the selected sub-county.';
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
      case 'subCounty':
        return this.subCountyEditorMode();
      case 'ward':
        return this.wardEditorMode();
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
      this.countiesError.set(extractErrorMessage(error));
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
      this.citiesError.set(extractErrorMessage(error));
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
      this.townsError.set(extractErrorMessage(error));
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
      this.modalError.set(toApiError(error));
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

  // ---- the administrative branch: county > sub-county > ward ----

  branchHint(): string {
    return this.branch() === 'settlement'
      ? 'Select a county to load its cities, then a city to load its towns.'
      : 'Select a county to load its sub-counties, then a sub-county to load its wards.';
  }

  countiesSubtitle(): string {
    return this.branch() === 'settlement'
      ? 'Select one to work on its cities.'
      : 'Select one to work on its sub-counties.';
  }

  async showBranch(branch: Branch): Promise<void> {
    if (this.branch() === branch) {
      return;
    }

    this.branch.set(branch);
    this.actionError.set(null);

    const countyId = this.selectedCountyId();
    if (!countyId) {
      return;
    }

    // The other branch has never been fetched for this county, or was fetched
    // for a different one. Either way the tab opens onto real rows.
    if (branch === 'administrative') {
      await this.loadAdministrativeBranch(countyId, true);
    } else if (this.cities().length === 0) {
      await this.loadSettlementBranch(countyId, true);
    }
  }

  selectedSubCounty(): SubCountyOption | null {
    const subCountyId = this.selectedSubCountyId();
    return subCountyId ? this.subCounties().find((entry) => entry.id === subCountyId) || null : null;
  }

  async selectSubCounty(subCountyId: number): Promise<void> {
    this.selectedSubCountyId.set(subCountyId);
    this.wardsError.set(null);
    this.wardSubCountyOptions.set(this.subCounties());
    await this.loadWards(subCountyId);
  }

  private async loadAdministrativeBranch(countyId: number, preserveSelection: boolean): Promise<void> {
    await this.loadSubCounties(countyId);
    this.wardSubCountyOptions.set(this.subCounties());

    const current = preserveSelection ? this.selectedSubCountyId() : null;
    const retained = current && this.subCounties().some((entry) => entry.id === current) ? current : null;
    const nextId = retained ?? this.subCounties()[0]?.id ?? null;

    this.selectedSubCountyId.set(nextId);

    if (nextId) {
      await this.loadWards(nextId);
    } else {
      this.wards.set([]);
      this.wardsError.set(null);
    }
  }

  private async loadSubCounties(countyId: number): Promise<void> {
    this.loadingSubCounties.set(true);
    this.subCountiesError.set(null);

    try {
      this.subCounties.set(await firstValueFrom(this.addressesService.getSubCountiesByCounty(countyId)));
    } catch (error) {
      this.subCounties.set([]);
      this.subCountiesError.set(extractErrorMessage(error));
    } finally {
      this.loadingSubCounties.set(false);
    }
  }

  private async loadWards(subCountyId: number): Promise<void> {
    this.loadingWards.set(true);
    this.wardsError.set(null);

    try {
      this.wards.set(await firstValueFrom(this.addressesService.getWardsBySubCounty(subCountyId)));
    } catch (error) {
      this.wards.set([]);
      this.wardsError.set(extractErrorMessage(error));
    } finally {
      this.loadingWards.set(false);
    }
  }

  private async loadWardSubCountyOptions(countyId: number | null): Promise<void> {
    if (!countyId) {
      this.wardSubCountyOptions.set([]);
      return;
    }

    try {
      this.wardSubCountyOptions.set(await firstValueFrom(this.addressesService.getSubCountiesByCounty(countyId)));
    } catch (error) {
      this.wardSubCountyOptions.set([]);
      this.modalError.set(toApiError(error));
    }
  }

  openSubCountyCreate(): void {
    const countyId = this.selectedCountyId();
    if (!countyId) {
      return;
    }

    this.editorLevel.set('subCounty');
    this.subCountyEditorMode.set('create');
    this.subCountyEditingId.set(null);
    this.modalError.set(null);
    this.subCountyForm.reset({ countyId: String(countyId), name: '' });
  }

  openSubCountyEdit(subCounty: SubCountyOption): void {
    this.editorLevel.set('subCounty');
    this.subCountyEditorMode.set('edit');
    this.subCountyEditingId.set(subCounty.id);
    this.modalError.set(null);
    this.subCountyForm.reset({
      countyId: String(subCounty.countyId || this.selectedCountyId() || ''),
      name: subCounty.name
    });
  }

  openWardCreate(): void {
    const countyId = this.selectedCountyId();
    const subCountyId = this.selectedSubCountyId();
    if (!countyId || !subCountyId) {
      return;
    }

    this.editorLevel.set('ward');
    this.wardEditorMode.set('create');
    this.wardEditingId.set(null);
    this.modalError.set(null);
    this.wardSubCountyOptions.set(this.subCounties());
    this.wardForm.reset({
      countyId: String(countyId),
      subCountyId: String(subCountyId),
      name: ''
    });
  }

  openWardEdit(ward: WardOption): void {
    const countyId = ward.countyId || this.findCountyIdForSubCounty(ward.subCountyId);

    this.editorLevel.set('ward');
    this.wardEditorMode.set('edit');
    this.wardEditingId.set(ward.id);
    this.modalError.set(null);
    this.wardForm.reset({
      countyId: String(countyId || ''),
      subCountyId: String(ward.subCountyId || ''),
      name: ward.name
    });

    void this.loadWardSubCountyOptions(countyId || null);
  }

  async onWardCountyChanged(): Promise<void> {
    const countyId = this.parseId(this.wardForm.controls.countyId.value);
    if (!countyId) {
      this.wardSubCountyOptions.set([]);
      this.wardForm.controls.subCountyId.setValue('');
      return;
    }

    await this.loadWardSubCountyOptions(countyId);

    const current = this.parseId(this.wardForm.controls.subCountyId.value);
    if (!current || !this.wardSubCountyOptions().some((entry) => entry.id === current)) {
      const first = this.wardSubCountyOptions()[0];
      this.wardForm.controls.subCountyId.setValue(first ? String(first.id) : '');
    }
  }

  async saveSubCounty(): Promise<void> {
    if (this.subCountyForm.invalid) {
      this.subCountyForm.markAllAsTouched();
      return;
    }

    this.subCountySaving.set(true);
    this.modalError.set(null);

    try {
      const payload: SubCountyUpsertRequest = {
        countyId: this.parseId(this.subCountyForm.controls.countyId.value),
        name: this.subCountyForm.controls.name.value.trim()
      };

      const saved = this.subCountyEditorMode() === 'edit'
        ? await firstValueFrom(this.addressesService.updateSubCounty(this.subCountyEditingId() || 0, payload))
        : await firstValueFrom(this.addressesService.createSubCounty(payload));

      this.closeEditor();
      const countyId = saved.countyId || payload.countyId || this.selectedCountyId() || 0;
      await this.loadAdministrativeBranchAfterSave(countyId, saved.id);
    } catch (error) {
      this.modalError.set(toApiError(error));
    } finally {
      this.subCountySaving.set(false);
    }
  }

  async saveWard(): Promise<void> {
    if (this.wardForm.invalid) {
      this.wardForm.markAllAsTouched();
      return;
    }

    this.wardSaving.set(true);
    this.modalError.set(null);

    try {
      const payload: WardUpsertRequest = {
        subCountyId: this.parseId(this.wardForm.controls.subCountyId.value),
        name: this.wardForm.controls.name.value.trim()
      };

      const saved = this.wardEditorMode() === 'edit'
        ? await firstValueFrom(this.addressesService.updateWard(this.wardEditingId() || 0, payload))
        : await firstValueFrom(this.addressesService.createWard(payload));

      this.closeEditor();
      const subCountyId = saved.subCountyId || payload.subCountyId || this.selectedSubCountyId() || 0;
      const countyId = saved.countyId
        || this.findCountyIdForSubCounty(subCountyId)
        || this.parseId(this.wardForm.controls.countyId.value)
        || 0;

      await this.loadAdministrativeBranchAfterSave(countyId, subCountyId);
    } catch (error) {
      this.modalError.set(toApiError(error));
    } finally {
      this.wardSaving.set(false);
    }
  }

  /** Land back on whatever was just saved, even if it moved county (§28.6). */
  private async loadAdministrativeBranchAfterSave(countyId: number, subCountyId: number | null): Promise<void> {
    if (countyId && countyId !== this.selectedCountyId()) {
      this.selectedCountyId.set(countyId);
    }

    await this.loadSubCounties(this.selectedCountyId() || countyId);
    this.wardSubCountyOptions.set(this.subCounties());

    const target = subCountyId && this.subCounties().some((entry) => entry.id === subCountyId)
      ? subCountyId
      : this.subCounties()[0]?.id ?? null;

    this.selectedSubCountyId.set(target);

    if (target) {
      await this.loadWards(target);
    } else {
      this.wards.set([]);
    }
  }

  private findCountyIdForSubCounty(subCountyId: number | null | undefined): number {
    if (!subCountyId) {
      return this.selectedCountyId() || 0;
    }

    const known = this.subCounties().find((entry) => entry.id === subCountyId)
      || this.wardSubCountyOptions().find((entry) => entry.id === subCountyId);

    return known?.countyId || this.selectedCountyId() || 0;
  }

  // ---- removal ----

  async deleteCounty(county: CountyOption): Promise<void> {
    await this.removePlace(
      `Delete ${county.name}?`,
      'Its cities, towns, sub-counties and wards go with it. Addresses already pointing at them will lose the reference.',
      () => this.addressesService.deleteCounty(county.id),
      async () => {
        if (this.selectedCountyId() === county.id) {
          this.selectedCountyId.set(null);
          this.selectedCityId.set(null);
          this.selectedSubCountyId.set(null);
        }

        await this.reloadAll();
      }
    );
  }

  async deleteCity(city: CityOption): Promise<void> {
    await this.removePlace(
      `Delete ${city.name}?`,
      'Its towns go with it.',
      () => this.addressesService.deleteCity(city.id),
      async () => {
        if (this.selectedCityId() === city.id) {
          this.selectedCityId.set(null);
        }

        await this.selectCounty(this.selectedCountyId() || 0, true);
      }
    );
  }

  async deleteTown(town: TownOption): Promise<void> {
    await this.removePlace(
      `Delete ${town.name}?`,
      null,
      () => this.addressesService.deleteTown(town.id),
      async () => {
        const cityId = this.selectedCityId();
        if (cityId) {
          await this.loadTowns(cityId);
        }
      }
    );
  }

  async deleteSubCounty(subCounty: SubCountyOption): Promise<void> {
    await this.removePlace(
      `Delete ${subCounty.name}?`,
      'Its wards go with it.',
      () => this.addressesService.deleteSubCounty(subCounty.id),
      async () => {
        if (this.selectedSubCountyId() === subCounty.id) {
          this.selectedSubCountyId.set(null);
        }

        await this.loadAdministrativeBranch(this.selectedCountyId() || 0, true);
      }
    );
  }

  async deleteWard(ward: WardOption): Promise<void> {
    await this.removePlace(
      `Delete ${ward.name}?`,
      null,
      () => this.addressesService.deleteWard(ward.id),
      async () => {
        const subCountyId = this.selectedSubCountyId();
        if (subCountyId) {
          await this.loadWards(subCountyId);
        }
      }
    );
  }

  /**
   * Ask, delete, then reload the affected column. A backend that refuses
   * because something still references the place says so in the rejection, so
   * the message is shown rather than replaced with a generic one.
   */
  private async removePlace(
    title: string,
    message: string | null,
    remove: () => Observable<void>,
    afterward: () => Promise<void>
  ): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      title,
      message,
      confirmLabel: 'Delete',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    this.actionError.set(null);

    try {
      await firstValueFrom(remove());
      await afterward();
    } catch (error) {
      this.actionError.set(toApiError(error));
    }
  }

}
