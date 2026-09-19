import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
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
  imports: [
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
        <app-loading-state label="Loading building..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit building' : 'New building'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field"><span>Registration number</span><input formControlName="registrationNumber"></label>

              @if (!isEdit()) {
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
              } @else {
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="PENDING_APPROVAL">Pending approval</option>
                    <option value="ACTIVE">Active</option>
                    <option value="DISABLED">Disabled</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </label>
              }
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>
          </app-section-card>

          @if (!isEdit()) {
            <app-section-card title="Layout">
              <p class="hint">Floors and rooms are generated once on creation and can be edited afterwards.</p>

              <div class="grid-auto">
                <label class="field">
                  <span>Number of floors</span>
                  <input type="number" min="1" formControlName="numberOfFloors">
                </label>
                <label class="field">
                  <span>Rooms per floor</span>
                  <input type="number" min="1" formControlName="roomsPerFloor">
                </label>
              </div>

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
                      <span>Floor pattern</span>
                      <select formControlName="floorPattern">
                        <option value="FLOOR_NUMBER">Floor number</option>
                        <option value="FLOOR_WITH_PREFIX">Floor with prefix</option>
                        <option value="ORDINAL">Ordinal</option>
                        <option value="LETTER">Letter</option>
                        <option value="ROMAN_NUMERAL">Roman numeral</option>
                      </select>
                    </label>
                    @if (needsFloorPrefix()) {
                      <label class="field"><span>Floor prefix</span><input formControlName="floorPrefix"></label>
                    }
                  </div>

                  <div class="naming-col">
                    <label class="field">
                      <span>Room pattern</span>
                      <select formControlName="roomPattern">
                        <option value="LETTER_NUMBER">Letter + number</option>
                        <option value="NUMBER_ONLY">Number only</option>
                        <option value="PREFIX_NUMBER">Prefix + number</option>
                        <option value="FLOOR_ROOM">Floor + room</option>
                        <option value="LETTER_SEQUENTIAL">Letter sequential</option>
                      </select>
                    </label>
                    @if (needsRoomPrefix()) {
                      <label class="field"><span>Room prefix</span><input formControlName="roomPrefix"></label>
                    }
                    @if (needsRoomSeparator()) {
                      <label class="field"><span>Room separator</span><input formControlName="roomSeparator"></label>
                    }
                  </div>
                </div>
              }

              <div class="button-row">
                <button type="button" class="btn btn-secondary" (click)="toggleNameCustomizing()">
                  {{ customizingNames() ? 'Use default naming' : 'Customize naming' }}
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
              <label class="field"><span>Monthly rent</span><input type="number" step="0.01" min="0" formControlName="monthlyRent"></label>

              @if (!isEdit()) {
                <label class="field"><span>Security deposit</span><input type="number" step="0.01" min="0" formControlName="securityDeposit"></label>
                <label class="field">
                  <span>Payment due day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay">
                  @if (form.controls.paymentDueDay.invalid && form.controls.paymentDueDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field">
                  <span>Arrears generation day</span>
                  <input type="number" min="1" max="31" formControlName="rentArrearsGenerateDay">
                  @if (form.controls.rentArrearsGenerateDay.invalid && form.controls.rentArrearsGenerateDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field"><span>Late fee amount</span><input type="number" step="0.01" min="0" formControlName="lateFeeAmount"></label>
                <label class="field"><span>Grace period (days)</span><input type="number" min="0" formControlName="gracePeriodDays"></label>
              }
            </div>

          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Building already exists' : 'Unable to save building'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create building') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.buildings">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .naming-group {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
    }

    .naming-col {
      display: grid;
      gap: 0.75rem;
      align-content: start;
    }

    .example-list {
      display: grid;
      gap: 0.25rem;
    }

    .example {
      color: var(--text-muted);
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingFormPageComponent implements OnInit {
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

  /** A super admin chooses from every agency; everyone else from their own. */
  readonly canSeeAllAgencies = computed(() => this.context.can(PermissionConstants.AGENCY_READ_ALL));

  /** The caller's own agencies, already fetched — a dropdown, not a search. */
  readonly myAgencies = signal<AgencyPreviewWithRole[]>([]);
  readonly myAgencyOptions = computed(() =>
    this.myAgencies().map((agency) => ({ value: agency.id, label: agency.name })));

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: '',
    registrationNumber: '',
    agencyId: [null as number | null, [Validators.required, Validators.min(1)]],
    status: 'ACTIVE',
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
    monthlyRent: [null as number | null, [Validators.required, Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.required, Validators.min(0)]],
    // Sensible for most tenancies, and still editable — a required field with no
    // value is a question the operator usually has no opinion about.
    paymentDueDay: [5 as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
    /*
     * Required by the database, not by the DTO: `rent_arrears_generate_day` is
     * NOT NULL but carries no @NotNull, so omitting it got past bean validation
     * and failed as a 409 "Column ... cannot be null". Required here so the
     * operator is told by the form rather than by the constraint.
     */
    rentArrearsGenerateDay: [1 as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
    lateFeeAmount: [null as number | null, [Validators.min(0)]],
    gracePeriodDays: [null as number | null, [Validators.min(0)]],
  });

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
        monthlyRent: building.monthlyRent === null || building.monthlyRent === undefined ? null : Number(building.monthlyRent)
      });
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
          monthlyRent: value.monthlyRent
        }));
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
        namingConvention: this.namingConventionPayload(),
        monthlyRent: value.monthlyRent,
        securityDeposit: value.securityDeposit,
        paymentDueDay: value.paymentDueDay,
        rentArrearsGenerateDay: value.rentArrearsGenerateDay,
        lateFeeAmount: value.lateFeeAmount,
        gracePeriodDays: value.gracePeriodDays,
      }));

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