import { BackDirective } from '../../../shared/directives/back.directive';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { BuildingDetail, RentTermKey } from '../models/housing.models';
import { dueDayLabel, formatCurrency } from '../../../shared/utils/format.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, effect, untracked } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { HousingService } from '../housing.service';
import { AgencyPreviewWithRole, BuildingStatus, FloorNamingPattern, RoomNamingPattern } from '../models/housing.models';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { previewFloorName, previewRoomName } from './utils/naming-preview.util';

@Component({
  selector: 'app-building-form-page',
  standalone: true,
  imports: [BackDirective, FieldErrorComponent, MoneyInputDirective, 
    SearchableSelectComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    EntityPickerComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading building…" />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit building' : 'New building'">

            <div class="grid-auto">
              <!-- First: which agency it belongs to decides the rent terms it starts from. -->
              @if (!isEdit() && (canSeeAllAgencies() || !onlyAgency())) {
                <label class="field">
                  <span>Agency</span>
                  <!--
                    An agency admin holds a handful of agencies and has already
                    been sent all of them; searching a set that fits in a
                    dropdown is a modal for nothing. A super admin picks from
                    every agency on the platform, which is what the picker is
                    for (§28.1).
                  -->
                  @if (canSeeAllAgencies()) {
                    <app-entity-picker
                      [config]="pickers.agency"
                      [required]="true"
                      formControlName="agencyId"
                      placeholder="Search for the agency"
                    />
                  } @else {
                    <app-searchable-select
                      [options]="myAgencyOptions()"
                      [required]="true"
                      formControlName="agencyId"
                      placeholder="Select the agency"
                      searchPlaceholder="Type to filter agencies…"
                    />
                  }
                  @if (form.controls.agencyId.invalid && form.controls.agencyId.touched) {
                    <small class="error-text">Choose the agency this building belongs to.</small>
                  }
                </label>
              }
              <label class="field">
                <span>Name</span>
                <input formControlName="name">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field"><span>Registration number</span><input formControlName="registrationNumber"></label>

              <!--
                One agency is not a choice (§29.11), and naming it in a field of its
                own spent a row on a fact the operator already knows: with a single
                agency the field is not shown at all, and the id is set on load.
              -->
              @if (isEdit()) {
                <label class="field field--full">
                  <span>
                    Status <span class="req" aria-hidden="true"></span>
                  </span>

                  <select formControlName="status" required>
                    <option value="" disabled>Select status</option>

                    @for (option of statusOptions; track option.value) {
                      <option [value]="option.value">
                        {{ option.label }}
                      </option>
                    }
                  </select>
                </label>
              }
              <!-- In the grid, not under it: beside Name on a desktop, stacked on a phone. -->
              <label class="field">
                <span>Description</span>
                <textarea formControlName="description" rows="1"></textarea>
              </label>
            </div>
          </app-section-card>

          @if (!isEdit()) {
            <app-section-card title="Layout">
              <p class="hint">Floors and rooms are generated once on creation and can be edited afterwards.</p>

              <div class="grid-auto">
                <label class="field">
                  <span>Number of floors</span>
                  <input type="number" min="1" formControlName="numberOfFloors" inputmode="numeric">
                </label>
                @if (!varyByFloor()) {
                  <label class="field">
                    <span>Rooms per floor</span>
                    <input type="number" min="1" formControlName="roomsPerFloor" inputmode="numeric">
                  </label>
                }
              </div>

              <label class="vary"><input type="checkbox" [checked]="varyByFloor()" (change)="setVaryByFloor($any($event.target).checked)">
                Floors have different numbers of rooms</label>
              @if (varyByFloor()) {
                <div class="floor-counts" role="group" aria-label="Rooms on each floor">
                  @for (count of floorRooms(); track $index; let i = $index) {
                    <label class="field">
                      <span>Floor {{ i + 1 }}</span>
                      <input type="number" min="1" max="200" inputmode="numeric" [value]="count" (input)="setFloorRooms(i, $any($event.target).value)">
                    </label>
                  }
                </div>
              }

              <!--
                The names are the point; the patterns that make them are not. Most
                buildings take the defaults, so the example leads and the controls
                that change it stay folded away until someone disagrees with it.
                Only the field(s) a given pattern actually uses are shown — e.g.
                a prefix input is pointless next to LETTER or ROMAN_NUMERAL.
              -->
              @if (customizingNames()) {
                <div class="naming-group" formGroupName="namingConvention">
                  <div class="naming-col">
                    <label class="field">
                      <span>How floors are named</span>
                      <!-- Each option shows what it produces: an example is clearer than a pattern's name. -->
                      <select formControlName="floorPattern">
                        <option value="FLOOR_NUMBER">Floor 1, Floor 2, Floor 3</option>
                        <option value="FLOOR_WITH_PREFIX">Your word + number (Level 1, Level 2)</option>
                        <option value="ORDINAL">1st Floor, 2nd Floor</option>
                        <option value="LETTER">A, B, C</option>
                        <option value="ROMAN_NUMERAL">I, II, III</option>
                      </select>
                    </label>
                    @if (needsFloorPrefix()) {
                      <label class="field"><span>Word before the floor number</span><input formControlName="floorPrefix"></label>
                    }
                  </div>

                  <div class="naming-col">
                    <label class="field">
                      <span>How rooms are named</span>
                      <select formControlName="roomPattern">
                        <option value="LETTER_NUMBER">A1, B1 on floor 1 — A2, B2 on floor 2</option>
                        <option value="NUMBER_ONLY">101, 102 on floor 1 — 201, 202 on floor 2</option>
                        <option value="PREFIX_NUMBER">Your word + running number (Room 1, Room 2)</option>
                        <option value="FLOOR_ROOM">1-1, 1-2 on floor 1 — 2-1, 2-2 on floor 2</option>
                        <option value="LETTER_SEQUENTIAL">A, B, C … through the whole building</option>
                      </select>
                    </label>
                    @if (needsRoomPrefix()) {
                      <label class="field"><span>Word before the room number</span><input formControlName="roomPrefix"></label>
                    }
                    @if (needsRoomSeparator()) {
                      <label class="field"><span>Between floor and room</span><input formControlName="roomSeparator" maxlength="3"></label>
                    }
                  </div>
                </div>
              }

              <div class="button-row">
                <button type="button" class="btn btn-secondary" (click)="toggleNameCustomizing()">
                  {{ customizingNames() ? 'Use default names' : 'Change how floors and rooms are named' }}
                </button>
              </div>

              <div class="example-list">
                @for (floor of exampleFloors(); track floor.floorName) {
                  <p class="example">
                    e.g. <strong>{{ floor.floorName }}</strong> → {{ floor.rooms.join(', ') }}
                  </p>
                }
              </div>
            </app-section-card>
          }

          <app-section-card title="Rent terms">
            <div class="grid-auto">
              <!-- Blank takes the agency's value; the hint says what that is. -->
              <label class="field">
                <span>Monthly rent</span>
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="monthlyRent" aria-label="Monthly rent in KES"></span>
                @if (defaultOffer('monthlyRent'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('monthlyRent')">{{ offer }}</button> }
                <app-field-error [control]="form.controls.monthlyRent" label="Monthly rent" />
              </label>
                <label class="field">
                  <span>Security deposit</span>
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="securityDeposit" aria-label="Security deposit in KES"></span>
                  @if (defaultOffer('securityDeposit'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('securityDeposit')">{{ offer }}</button> }
                </label>
                <label class="field">
                  <span>Rent due on day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay" inputmode="numeric">
                  @if (form.controls.paymentDueDay.invalid && form.controls.paymentDueDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                  @if (defaultOffer('paymentDueDay'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('paymentDueDay')">{{ offer }}</button> }
                </label>
                <label class="field">
                  <span>Bills created on day</span>
                  <input type="number" min="1" max="31" formControlName="rentArrearsGenerateDay" inputmode="numeric">
                  @if (form.controls.rentArrearsGenerateDay.invalid && form.controls.rentArrearsGenerateDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <!-- The agency's choice unless the building makes its own: on, with an amount and grace period; or off. -->
                <label class="field">
                  <span>Late fee</span>
                  <select formControlName="lateFeeMode">
                    <option value="AGENCY">Same as agency ({{ agencyLateFeesOn() ? 'charged' : 'off' }})</option>
                    <option value="ON">Charge a late fee</option>
                    <option value="OFF">No late fee</option>
                  </select>
                </label>
                @if (lateFeesApply()) {
                <label class="field">
                  <span>Late fee amount</span>
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="lateFeeAmount" aria-label="Late fee in KES"></span>
                  @if (defaultOffer('lateFeeAmount'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('lateFeeAmount')">{{ offer }}</button> }
                </label>
                <label class="field">
                  <span>Grace period (days)</span>
                  <input type="number" min="0" formControlName="gracePeriodDays" inputmode="numeric">
                  @if (defaultOffer('gracePeriodDays'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('gracePeriodDays')">{{ offer }}</button> }
                </label>
                }
              <!-- Off unless chosen: by default the landlord enters readings and confirms each month. -->
              <div class="field field--full auto-confirm">
                <label class="switch-row">
                  <span>Confirm bills automatically</span>
                  <input type="checkbox" role="switch" class="switch" [checked]="autoConfirm()" (change)="setAutoConfirm($any($event.target).checked)">
                </label>
                @if (autoConfirm()) {
                  <label class="field">
                    <span>On day</span>
                    <input type="number" min="1" max="31" formControlName="billsAutoConfirmDay" inputmode="numeric">
                    <app-field-error [control]="form.controls.billsAutoConfirmDay" label="Day" />
                  </label>
                  <small class="hint">Missing meter readings move to the next bill.</small>
                }
              </div>
            </div>

          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Building already exists' : 'Unable to save building'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          @if (!isEdit() && layoutSummary(); as summary) {
            <p class="create-summary" role="status">{{ summary }}</p>
          }
          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving…' : (isEdit() ? 'Save changes' : 'Create building') }}
            </button>
            <a appBack class="btn btn-secondary" [routerLink]="RoutePaths.buildings">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    .vary { display: flex; gap: var(--space-2); align-items: center; min-height: 2.75rem; margin-top: var(--space-2); }
    .floor-counts { display: grid; gap: var(--space-2) var(--space-3); grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); }

    .use-default { justify-self: start; padding: 0; min-height: 2rem; font-size: var(--text-sm); text-align: left; }
    .status-choice { border: 0; margin: 0; padding: 0; min-width: 0; }
    .status-choice legend { padding: 0; margin-bottom: var(--space-1-5); font-weight: var(--weight-semibold); }
    .status-choice .req { color: var(--danger); }
    .status-choice .segmented { display: inline-flex; flex-wrap: wrap; }
    .status-choice .segmented label { white-space: nowrap; display: inline-flex; align-items: center; gap: var(--space-1-5); min-height: 2.75rem; padding: 0 var(--space-3); cursor: pointer; }
    .auto-confirm { display: grid; gap: var(--space-2); }
    .create-summary { margin: 0; font-weight: var(--weight-semibold); }
    form {
      display: grid;
      gap: var(--space-4);
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .naming-group {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      gap: var(--space-6);
    }

    .naming-col {
      display: grid;
      gap: var(--space-3);
      align-content: start;
    }

    .example-list {
      display: grid;
      gap: var(--space-1);
    }

    .example {
      color: var(--text-muted);
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingFormPageComponent implements OnInit, HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  readonly statusOptions = [
    { value: 'ACTIVE', label: 'Active' }, { value: 'PENDING_APPROVAL', label: 'Pending approval' },
    { value: 'DISABLED', label: 'Disabled' }, { value: 'CLOSED', label: 'Closed' }
  ];

  readonly autoConfirm = signal(false);
  private readonly toasts = inject(NotificationService);

  setAutoConfirm(on: boolean): void {
    this.autoConfirm.set(on);
    const control = this.form.controls.billsAutoConfirmDay;
    control.setValidators(on ? [Validators.required, Validators.min(1), Validators.max(31)] : []);
    if (!on) {
      control.setValue(null);
    }
    control.updateValueAndValidity();
    this.form.markAsDirty();
  }

  /** "Creates 3 floors with 4 rooms each: 12 rooms." — or, floors differing, "…: 4, 6 and 6 rooms: 16 rooms." */
  readonly layoutSummary = computed(() => {
    const floors = Number(this.numberOfFloorsValue() ?? 0);
    if (this.varyByFloor()) {
      const counts = this.floorRooms();
      const total = counts.reduce((sum, n) => sum + n, 0);
      if (floors <= 0 || counts.some((n) => n < 1)) {
        return null;
      }
      const list = counts.length > 1 ? `${counts.slice(0, -1).join(', ')} and ${counts[counts.length - 1]}` : `${counts[0]}`;
      return `Creates ${floors} ${floors === 1 ? 'floor' : 'floors'} with ${list} rooms: ${total} rooms.`;
    }
    const rooms = Number(this.roomsPerFloorValue() ?? 0);
    return floors > 0 && rooms > 0
      ? `Creates ${floors} ${floors === 1 ? 'floor' : 'floors'} with ${rooms} ${rooms === 1 ? 'room' : 'rooms'} each: ${floors * rooms} rooms.` : null;
  });

  /** Floors that differ: one room count per floor, ground first. */
  readonly varyByFloor = signal(false);
  readonly floorRooms = signal<number[]>([]);

  setVaryByFloor(on: boolean): void {
    this.varyByFloor.set(on);
    if (on) {
      this.fitFloorRooms();
    }
    this.form.markAsDirty();
  }

  setFloorRooms(index: number, value: string): void {
    const n = Math.max(0, Math.min(200, Math.floor(Number(value) || 0)));
    this.floorRooms.update((list) => list.map((count, i) => (i === index ? n : count)));
    // Keeps the shared field valid while the per-floor counts are what is sent.
    this.form.controls.roomsPerFloor.setValue(Math.max(1, ...this.floorRooms()), { emitEvent: false });
    this.form.markAsDirty();
  }

  /** One count per floor, keeping those already typed when the number of floors changes. */
  private fitFloorRooms(): void {
    const floors = Math.max(0, Math.min(50, Number(this.form.controls.numberOfFloors.value) || 0));
    const fallback = Number(this.form.controls.roomsPerFloor.value) || 1;
    this.floorRooms.update((list) => Array.from({ length: floors }, (_, i) => list[i] ?? fallback));
    if (this.form.controls.roomsPerFloor.value == null) {
      this.form.controls.roomsPerFloor.setValue(fallback, { emitEvent: false });
    }
  }

  private readonly keepFloorRoomsFitted = effect(() => {
    this.numberOfFloorsValue();
    if (untracked(() => this.varyByFloor())) {
      untracked(() => this.fitFloorRooms());
    }
  });
  readonly RoutePaths = RoutePaths;

  readonly agencyId = input<string>();
  readonly buildingId = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly context = inject(ActiveContextService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  /** Folded away until the operator disagrees with the generated names. */
  readonly customizingNames = signal(false);

  readonly isEdit = computed(() => !!this.buildingId());

  private readonly loadedBuilding = signal<BuildingDetail | null>(null);
  /** The agency's value for each term, to show beside a blank field. */
  private readonly agencyTerms = signal<Partial<Record<RentTermKey, number | string | null>>>({});
  /** Whether the agency charges late fees: what "Same as agency" means for this building. */
  readonly agencyLateFeesOn = signal(false);
  /** Late fees apply here: switched on for the building, or following an agency that charges them. */
  readonly lateFeesApply = computed(() => {
    const mode = this.formValue().lateFeeMode;
    return mode === 'ON' || (mode === 'AGENCY' && this.agencyLateFeesOn());
  });

  private current(building: BuildingDetail, key: RentTermKey): number | null {
    const value = building.effectiveTerms?.[key];
    return value === null || value === undefined ? null : Number(value);
  }

  private setInheritedFrom(effective: Partial<Record<RentTermKey, number | string | null>> | null,
                           sources: Partial<Record<RentTermKey, string>> | null): void {
    const inherited: Partial<Record<RentTermKey, number | string | null>> = {};
    for (const key of Object.keys(effective ?? {}) as RentTermKey[]) {
      if (sources?.[key] === 'AGENCY') {
        inherited[key] = effective![key] ?? null;
      }
    }
    this.agencyTerms.set(inherited);
    this.updateRentRequirement();
  }

  /** Keys the operator set back to the agency's value with "Use agency default". */
  private readonly usedDefaults = new Set<RentTermKey>();

  /**
   * "Use agency default (KES 25,000)" under a field. On a new building, under every field that does not
   * hold it yet; on an edit, only under a value that differs from the agency's.
   */
  defaultOffer(key: RentTermKey): string | null {
    this.formValue();
    const value = this.agencyTerms()[key];
    const current = this.form.controls[key].value;
    if (value === null || value === undefined || (current !== null && Number(current) === Number(value))) {
      return null;
    }
    if (this.isEdit() && current === null) {
      return null;
    }
    const shown = key === 'paymentDueDay' ? dueDayLabel(Number(value))
      : key === 'gracePeriodDays' ? `${value} days` : formatCurrency(value);
    return `Use agency default (${shown})`;
  }

  /** Fills the field with the agency's value; on an edit, the building then follows the agency again. */
  useDefault(key: RentTermKey): void {
    const value = this.agencyTerms()[key];
    if (value === null || value === undefined) {
      return;
    }
    this.form.controls[key].setValue(Number(value));
    this.form.controls[key].markAsDirty();
    this.usedDefaults.add(key);
  }

  /** Monthly rent is always asked for on a new building: rarely do two buildings charge the same. */
  private updateRentRequirement(): void {
    const control = this.form.controls.monthlyRent;
    control.setValidators(this.isEdit() ? [Validators.min(0)] : [Validators.required, Validators.min(0)]);
    control.updateValueAndValidity();
  }

  /**
   * Terms that follow the agency after saving: emptied ones, and any whose value equals the agency's
   * (left as shown, or set with "Use agency default"), so a later agency change still reaches them.
   */
  private clearedTerms(): RentTermKey[] {
    if (!this.loadedBuilding()) {
      return [];
    }
    return (['monthlyRent', 'securityDeposit', 'paymentDueDay', 'lateFeeAmount', 'gracePeriodDays'] as RentTermKey[])
      .filter((key) => {
        const current = this.form.controls[key].value;
        const agency = this.agencyTerms()[key];
        return current === null || (agency !== null && agency !== undefined && Number(current) === Number(agency));
      });
  }

  /** On a new building, the chosen agency's terms are what blank fields will use. */
  /** What "Same as agency" means here, on the edit form (the create form learns it with the agency's terms). */
  private async loadAgencyLateFees(agencyId: number): Promise<void> {
    try {
      this.agencyLateFeesOn.set(!!(await firstValueFrom(this.housing.getAgency(agencyId))).lateFeeEnabled);
    } catch {
      this.agencyLateFeesOn.set(false);
    }
  }

  private async loadAgencyTerms(agencyId: number | null): Promise<void> {
    if (!agencyId) {
      return;
    }
    try {
      const agency = await firstValueFrom(this.housing.getAgency(agencyId));
      this.agencyTerms.set({
        monthlyRent: agency.monthlyRent ?? null, securityDeposit: agency.securityDeposit ?? null,
        paymentDueDay: agency.paymentDueDay ?? null, lateFeeAmount: agency.lateFeeAmount ?? null,
        gracePeriodDays: agency.gracePeriodDays ?? null
      });
      this.agencyLateFeesOn.set(!!agency.lateFeeEnabled);
    } catch {
      this.agencyTerms.set({});
    }
    this.updateRentRequirement();
  }

  /** A super admin chooses from every agency; everyone else from their own. */
  readonly canSeeAllAgencies = computed(() => this.context.can(PermissionConstants.AGENCY_READ_ALL));

  /** The caller's own agencies, already fetched — a dropdown, not a search. */
  readonly myAgencies = signal<AgencyPreviewWithRole[]>([]);
  readonly myAgencyOptions = computed(() =>
    this.myAgencies().map((agency) => ({ value: agency.id, label: agency.name })));

  /** The caller's sole agency, when that is all they hold. */
  readonly onlyAgency = computed(() => {
    const agencies = this.myAgencies();
    return agencies.length === 1 ? agencies[0] : null;
  });

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: '',
    registrationNumber: '',
    agencyId: [null as number | null, [Validators.required, Validators.min(1)]],
    status: ['ACTIVE', [Validators.required]],
    numberOfFloors: [null as number | null, [Validators.required, Validators.min(1)]],
    roomsPerFloor: [null as number | null, [Validators.required, Validators.min(1)]],
    namingConvention: this.formBuilder.group({
      // Typed as the literal unions (not just `string`) so this form group's value
      // is directly assignable to BuildingNamingConvention — no casting at call sites.
      floorPattern: 'FLOOR_NUMBER' as FloorNamingPattern,
      floorPrefix: '',
      roomPattern: 'LETTER_NUMBER' as RoomNamingPattern,
      roomPrefix: '',
      roomSeparator: ''
    }),
    // Required on a new building; the other terms may be left for the agency's (see "Use agency default").
    monthlyRent: [null as number | null, [Validators.required, Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.min(0)]],
    paymentDueDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
    /*
     * Required by the database, not by the DTO: `rent_arrears_generate_day` is
     * NOT NULL but carries no @NotNull, so omitting it got past bean validation
     * and failed as a 409 "Column ... cannot be null". Required here so the
     * operator is told by the form rather than by the constraint.
     */
    rentArrearsGenerateDay: [1 as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
    lateFeeAmount: [null as number | null, [Validators.min(0)]],
    gracePeriodDays: [null as number | null, [Validators.min(0)]],
    lateFeeMode: 'AGENCY' as 'AGENCY' | 'ON' | 'OFF',
    billsAutoConfirmDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // --- Instant, client-side naming example (no request, no debounce) ---
  private readonly namingConventionValue = toSignal(
    this.form.controls.namingConvention.valueChanges,
    { initialValue: this.form.controls.namingConvention.getRawValue() }
  );
  private readonly roomsPerFloorValue = toSignal(
    this.form.controls.roomsPerFloor.valueChanges,
    { initialValue: this.form.controls.roomsPerFloor.value }
  );
  private readonly numberOfFloorsValue = toSignal(
    this.form.controls.numberOfFloors.valueChanges,
    { initialValue: this.form.controls.numberOfFloors.value }
  );

  readonly needsFloorPrefix = computed(() => this.namingConventionValue().floorPattern === 'FLOOR_WITH_PREFIX');
  readonly needsRoomPrefix = computed(() => this.namingConventionValue().roomPattern === 'PREFIX_NUMBER');
  readonly needsRoomSeparator = computed(() => this.namingConventionValue().roomPattern === 'FLOOR_ROOM');

  /**
   * A few sample floors so the pattern's shape across floors is visible (e.g. that
   * ORDINAL reads "1st Floor, 2nd Floor…", not just what floor 1 alone looks like).
   * Capped at 3 — this is a taste of the pattern, not the actual layout.
   */
  readonly exampleFloors = computed(() => {
    const floorCount = Math.min(this.numberOfFloorsValue() || 3, 3);
    const roomsPerFloor = Math.min(this.roomsPerFloorValue() || 3, 3);
    const convention = this.namingConventionValue();
    return Array.from({ length: floorCount }, (_, floorIdx) => {
      const floor = floorIdx + 1;
      return {
        floorName: previewFloorName(floor, convention),
        rooms: Array.from({ length: roomsPerFloor }, (_, roomIdx) =>
          previewRoomName(floor, roomIdx + 1, roomsPerFloor, convention))
      };
    });
  });

  ngOnInit(): void {
    if (!this.canSeeAllAgencies()) {
      void this.loadMyAgencies();
    }

    if (this.isEdit()) {
      this.form.controls.agencyId.clearValidators();
      this.form.controls.agencyId.updateValueAndValidity();
    } else {
      // Coming from an agency page — prefill the agency this building belongs to.
      // Prefer an explicit ?agencyId=, else the agency the operator is working in.
      const queryAgencyId = this.route.snapshot.queryParamMap.get('agencyId');
      const agencyId = queryAgencyId ? Number(queryAgencyId) : this.context.agencyId();
      if (agencyId !== null) {
        this.form.patchValue({ agencyId });
      }
      void this.loadAgencyTerms(this.form.controls.agencyId.value);
      this.form.controls.agencyId.valueChanges.subscribe((id) => void this.loadAgencyTerms(id));
    }

    void this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.agencyId();
    const buildingId = this.buildingId();
    if (!agencyId || !buildingId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const building = await firstValueFrom(this.housing.getBuilding(Number(agencyId), Number(buildingId)));
      this.form.patchValue({
        name: building.name,
        description: building.description ?? '',
        registrationNumber: building.registrationNumber ?? '',
        agencyId: building.agency?.id ?? Number(agencyId),
        status: building.status ?? 'ACTIVE',
        // What the building charges now, wherever it was set: never a blank that reads as zero.
        monthlyRent: this.current(building, 'monthlyRent'),
        securityDeposit: this.current(building, 'securityDeposit'),
        paymentDueDay: this.current(building, 'paymentDueDay'),
        lateFeeAmount: this.current(building, 'lateFeeAmount'),
        gracePeriodDays: this.current(building, 'gracePeriodDays'),
        rentArrearsGenerateDay: building.rentArrearsGenerateDay ?? 1,
        billsAutoConfirmDay: building.billsAutoConfirmDay ?? null,
        lateFeeMode: building.lateFeeEnabled === true ? 'ON' : building.lateFeeEnabled === false ? 'OFF' : 'AGENCY'
      });
      void this.loadAgencyLateFees(building.agency?.id ?? Number(agencyId));
      this.autoConfirm.set(!!building.billsAutoConfirmDay);
      this.form.markAsPristine();
      this.loadedBuilding.set(building);
      this.setInheritedFrom(building.effectiveTerms ?? null, building.termSources ?? null);
      // The agency's own values, so any field (overridden ones too) can be cleared back to them.
      void this.loadAgencyTerms(building.agency?.id ?? Number(agencyId));
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMyAgencies(): Promise<void> {
    try {
      // One generous page: a person administers a handful, not a catalogue.
      const result = await firstValueFrom(this.housing.getMyAgencies({ page: 0, size: 100 }));
      this.myAgencies.set(result.items);

      // Nothing to choose, so choose it. The field shows the name instead of a select.
      if (!this.isEdit() && result.items.length === 1) {
        this.form.patchValue({ agencyId: result.items[0].id });
      }
    } catch {
      // The field falls back to an empty dropdown; saving still reports the real error.
      this.myAgencies.set([]);
    }
  }

  toggleNameCustomizing(): void {
    this.customizingNames.update((open) => !open);

    // Coming back to the defaults means the example should reflect defaults again.
    if (!this.customizingNames()) {
      this.form.controls.namingConvention.reset({
        floorPattern: 'FLOOR_NUMBER',
        floorPrefix: '',
        roomPattern: 'LETTER_NUMBER',
        roomPrefix: '',
        roomSeparator: ''
      });
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      const agencyId = this.agencyId();
      const buildingId = this.buildingId();

      if (agencyId && buildingId) {
        const saved = await firstValueFrom(this.housing.updateBuilding(Number(agencyId), Number(buildingId), {
          name: value.name,
          description: value.description || null,
          registrationNumber: value.registrationNumber || null,
          status: value.status as BuildingStatus,
          monthlyRent: value.monthlyRent,
          securityDeposit: value.securityDeposit,
          paymentDueDay: value.paymentDueDay,
          rentArrearsGenerateDay: value.rentArrearsGenerateDay,
          lateFeeAmount: value.lateFeeAmount,
          gracePeriodDays: value.gracePeriodDays,
          ...(value.lateFeeMode === 'AGENCY' ? {} : { lateFeeEnabled: value.lateFeeMode === 'ON' }),
          // Emptied fields that the building used to set go back to the agency's value; so does "Same as agency".
          inherit: value.lateFeeMode === 'AGENCY' ? [...this.clearedTerms(), 'lateFeeEnabled'] : this.clearedTerms(),
          // Empty switches it off (0), so clearing the field is how a landlord goes back to confirming by hand.
          billsAutoConfirmDay: value.billsAutoConfirmDay ?? 0
        }));
        this.form.markAsPristine();
        this.toasts.push('success', 'Building saved.');
        await this.router.navigateByUrl(RoutePaths.buildingDetail(Number(agencyId), saved.id));
        return;
      }

      const created = await firstValueFrom(this.housing.createBuilding({
        name: value.name,
        description: value.description || null,
        registrationNumber: value.registrationNumber || null,
        agencyId: value.agencyId!,
        numberOfFloors: value.numberOfFloors,
        roomsPerFloor: value.roomsPerFloor,
        roomsByFloor: this.varyByFloor() ? this.floorRooms() : null,
        namingConvention: this.namingConventionPayload(),
        monthlyRent: value.monthlyRent,
        securityDeposit: value.securityDeposit,
        paymentDueDay: value.paymentDueDay,
        rentArrearsGenerateDay: value.rentArrearsGenerateDay,
        billsAutoConfirmDay: value.billsAutoConfirmDay,
        lateFeeAmount: value.lateFeeAmount,
        gracePeriodDays: value.gracePeriodDays,
        lateFeeEnabled: value.lateFeeMode === 'AGENCY' ? null : value.lateFeeMode === 'ON',
      }));

      this.form.markAsPristine();
      this.toasts.push('success', `${created.name} created. Next: its charges, contacts and tenants.`);
      await this.router.navigateByUrl(RoutePaths.buildingDetail(value.agencyId!, created.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private namingConventionPayload() {
    const convention = this.form.getRawValue().namingConvention;
    return {
      floorPattern: convention.floorPattern,
      floorPrefix: convention.floorPrefix || null,
      roomPattern: convention.roomPattern,
      roomPrefix: convention.roomPrefix || null,
      roomSeparator: convention.roomSeparator || null
    };
  }
}