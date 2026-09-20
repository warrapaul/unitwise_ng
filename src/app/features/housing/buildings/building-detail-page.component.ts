import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import { BuildingDetail, BuildingFloorDetail, RoomPreview } from '../models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

/** Numeric-aware so room "A2" sorts before "A10" rather than after it. */
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function roomLabel(room: RoomPreview): string {
  return room.name || (room.roomNumber !== null && room.roomNumber !== undefined ? `Room ${room.roomNumber}` : '');
}

@Component({
  selector: 'app-building-detail-page',
  standalone: true,
  imports: [
    PluralPipe,
    EntityPickerComponent,
    AddressPreviewComponent,
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    ContextGuardComponent,
    RowLinkDirective,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    UnitPipe,
    DetailGroupComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.buildings" label="Back" [title]="building()?.name || null" />
      <app-context-guard [agencyId]="agencyId()" [buildingId]="buildingId()" requirePermission="BUILDING_READ">
      @if (loading()) {
        <app-loading-state label="Loading building..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (building(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.description || null">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.BUILDING_UPDATE]">
                <a class="btn btn-primary btn-outline" [routerLink]="RoutePaths.buildingEdit(agencyId(), buildingId())">Edit</a>
              </app-permission-gate>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.buildingUtilities(agencyId(), buildingId())">Utilities</a>
              <!--
                Working on one building means every tenant, lease and message
                list should narrow to it. Rather than asking the operator to
                set the same filter on four pages, they set it once here and
                the shell carries it (§30.5).
              -->
              @if (isActiveBuilding()) {
                <a class="btn btn-secondary" [routerLink]="RoutePaths.tenants">View tenants</a>
              } @else {
                <button type="button" class="btn btn-secondary" (click)="workOnThisBuilding()">
                  Work on this building
                </button>
              }
              <app-permission-gate
                [permissions]="[Permissions.CONTRACT_TEMPLATE_MANAGE, Permissions.CONTRACT_TEMPLATE_MANAGE_ALL]"
                [agencyId]="agencyId()"
              >
                <a class="btn btn-secondary" [routerLink]="RoutePaths.buildingContractTemplate(agencyId(), buildingId())">
                  Contract template
                </a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.BUILDING_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
                </button>
              </app-permission-gate>
            </div>
          </ng-container>

          <div class="detail-groups">
            <app-detail-group label="Overview">
              <div class="lead">
                <dt>Status</dt>
                <dd><app-status-chip [status]="detail.status" /></dd>
              </div>
              <div class="lead"><dt>Rooms</dt><dd>{{ detail.totalRoomCount ?? 0 }}</dd></div>
              <div><dt>Floors</dt><dd>{{ detail.floorCount ?? 0 }}</dd></div>
              <div>
                <dt>Agency</dt>
                <dd>
                  @if (detail.agency?.id) {
                    <a [routerLink]="RoutePaths.agencyDetail(detail.agency!.id)">{{ detail.agency!.name }}</a>
                  } @else {
                    -
                  }
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd><app-address-preview [address]="detail.address ?? null" empty="Not set" /></dd>
              </div>
            </app-detail-group>

            <app-detail-group label="Default rent terms">
              <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent ?? '-' }}</dd></div>
              <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit ?? '-' }}</dd></div>
              <div><dt>Payment due day</dt><dd>{{ detail.paymentDueDay ?? '-' }}</dd></div>
              <div><dt>Arrears generation day</dt><dd>{{ detail.rentArrearsGenerateDay ?? '-' }}</dd></div>
              <div><dt>Late fee</dt><dd>{{ detail.lateFeeAmount ?? '-' }}</dd></div>
              <div><dt>Grace period</dt><dd>{{ detail.gracePeriodDays | unit: 'days' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Record">
              <div><dt>Registration</dt><dd class="mono">{{ detail.registrationNumber || '-' }}</dd></div>
            </app-detail-group>
          </div>
        </app-section-card>

        <app-section-card title="Address">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_UPDATE]">
              @if (!editingAddress()) {
                <button type="button" class="btn btn-secondary btn-sm" (click)="startAddress(detail)">
                  {{ detail.address ? 'Change address' : 'Set address' }}
                </button>
              }
            </app-permission-gate>
          </ng-container>

          @if (editingAddress()) {
            <!--
              Written, not searched. The platform address search needs
              ADDRESS_READ_ALL and 403s for every agency admin, and a building
              has exactly one address rather than a list of them.
            -->
            <form class="stack" [formGroup]="addressForm" appFormFeedback (ngSubmit)="saveAddress()">
              <div class="grid-auto">
                <label class="field">
                  <span>County</span>
                  <app-entity-picker
                    [config]="pickers.county"
                    formControlName="countyId"
                    placeholder="Select a county"
                    (valueChange)="onAddressCountyChanged()"
                  />
                </label>

                <label class="field">
                  <span>City</span>
                  @if (addressCityPicker(); as config) {
                    <app-entity-picker [config]="config" formControlName="cityId" placeholder="Select a city" />
                  } @else {
                    <input disabled placeholder="Choose a county first">
                  }
                </label>

                <label class="field">
                  <span>Town</span>
                  @if (addressTownPicker(); as config) {
                    <app-entity-picker [config]="config" formControlName="townId" placeholder="Select a town" />
                  } @else {
                    <input disabled placeholder="Choose a city first">
                  }
                </label>

                <label class="field">
                  <span>Postal code</span>
                  <input formControlName="postalCode" placeholder="Optional">
                </label>

                <label class="field field--full">
                  <span>Description</span>
                  <input formControlName="description" placeholder="e.g. Gate 3, opposite the petrol station">
                  <small class="hint">How someone finds it on the ground.</small>
                </label>
              </div>

              @if (addressError(); as apiError) {
                <app-error-card
                  title="Unable to save the address"
                  [message]="apiError.message"
                  [details]="apiError.details"
                />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="savingAddress()">
                  {{ savingAddress() ? 'Saving...' : 'Save address' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="cancelAddress()">Cancel</button>
                @if (detail.address) {
                  <button type="button" class="btn btn-danger btn-sm" [disabled]="savingAddress()" (click)="removeAddress()">
                    Remove
                  </button>
                }
              </div>
            </form>
          } @else {
            <app-address-preview [address]="detail.address ?? null" [block]="true" empty="No address set for this building." />
          }
        </app-section-card>

        <!--
          One card, not two. Adding a floor and reading the floors are the
          same job at different moments, and splitting them put a titled,
          mostly-empty card above the thing it acts on. The fields still stay
          hidden until somebody says they want them — a form nobody asked for
          is the reason it was a separate card in the first place.
        -->
        <app-section-card title="Floors and rooms">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.BUILDING_MANAGE, Permissions.AGENCY_BUILDING_MANAGE, Permissions.FLOOR_CREATE, Permissions.FLOOR_UPDATE, Permissions.FLOOR_DELETE, Permissions.ROOM_CREATE]">
              <button type="button" class="btn btn-secondary btn-sm" (click)="toggleFloorForm()">
                {{ floorFormOpen() ? 'Cancel' : 'Add floor' }}
              </button>
            </app-permission-gate>
          </ng-container>

          <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.BUILDING_MANAGE, Permissions.AGENCY_BUILDING_MANAGE, Permissions.FLOOR_CREATE, Permissions.FLOOR_UPDATE, Permissions.FLOOR_DELETE, Permissions.ROOM_CREATE]">
            @if (floorFormOpen()) {
            <form [formGroup]="floorForm" appFormFeedback (ngSubmit)="addFloor()">
              <div class="grid-auto">
                <label class="field">
                  <span>Floor number</span>
                  <input type="number" min="0" formControlName="floorNumber">
                  @if (floorForm.controls.floorNumber.invalid && floorForm.controls.floorNumber.touched) {
                    <small class="error-text">A floor number is required.</small>
                  }
                </label>
                <label class="field"><span>Name</span><input formControlName="name" placeholder="Ground floor"></label>
                <label class="field">
                  <span>Rooms to generate</span>
                  <input type="number" min="0" formControlName="numberOfRooms">
                  <small class="hint">Leave empty to create the floor without rooms.</small>
                </label>
              </div>

              @if (floorError(); as apiError) {
                <app-error-card
                  [title]="apiError.status === 409 ? 'Floor already exists' : 'Unable to add floor'"
                  [message]="apiError.message"
                  [details]="apiError.details"
                />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="addingFloor()">
                  {{ addingFloor() ? 'Adding...' : 'Add floor' }}
                </button>
              </div>
            </form>
          }
          </app-permission-gate>

          @if (floors().length === 0) {
            <app-empty-state title="No floors yet" description="Add a floor to start laying out rooms." />
          } @else {
            @for (floor of floors(); track floor.id) {
              <article class="floor-panel">
                <header class="floor-panel__header">
                  <div>
                    <h3>{{ floor.name || ('Floor ' + floor.floorNumber) }}</h3>
                    <p class="muted">{{ (floor.roomCount ?? (floor.rooms ?? []).length) | plural: 'room' }}</p>
                  </div>
                  <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.BUILDING_MANAGE, Permissions.AGENCY_BUILDING_MANAGE, Permissions.FLOOR_CREATE, Permissions.FLOOR_UPDATE, Permissions.FLOOR_DELETE, Permissions.ROOM_CREATE]">
                    <div class="row-actions">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="toggleRoomForm(floor)">
                        {{ roomFormFloorId() === floor.id ? 'Close' : 'Add room' }}
                      </button>
                      <button
                        type="button"
                        class="icon-action icon-action--danger"
                        aria-label="Delete floor"
                        title="Delete floor"
                        [disabled]="deletingFloorId() === floor.id"
                        (click)="removeFloor(floor)"
                      ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                    </div>
                  </app-permission-gate>
                </header>

                @if (roomFormFloorId() === floor.id) {
                  <form [formGroup]="roomForm" appFormFeedback (ngSubmit)="addRoom(floor)">
                    <div class="grid-auto">
                      <label class="field">
                        <span>Room number</span>
                        <input type="number" min="0" formControlName="roomNumber">
                        @if (roomForm.controls.roomNumber.invalid && roomForm.controls.roomNumber.touched) {
                          <small class="error-text">A room number is required.</small>
                        }
                      </label>
                      <label class="field"><span>Name</span><input formControlName="name"></label>
                      <label class="field"><span>Monthly rent</span><input type="number" step="0.01" min="0" formControlName="monthlyRent"></label>
                      <label class="field">
                        <span>Status</span>
                        <select formControlName="status">
                          <option value="VACANT">Vacant</option>
                          <option value="OCCUPIED">Occupied</option>
                          <option value="UNDER_MAINTENANCE">Under maintenance</option>
                        </select>
                      </label>
                    </div>

                    @if (roomError(); as apiError) {
                      <app-error-card
                        [title]="apiError.status === 409 ? 'Room already exists' : 'Unable to add room'"
                        [message]="apiError.message"
                        [details]="apiError.details"
                      />
                    }

                    <div class="button-row">
                      <button type="submit" class="btn btn-primary" [disabled]="addingRoom()">
                        {{ addingRoom() ? 'Adding...' : 'Add room' }}
                      </button>
                    </div>
                  </form>
                }

                @if ((floor.rooms ?? []).length === 0) {
                  <p class="muted">No rooms on this floor.</p>
                } @else {
                  <div class="table-scroll">
                    <table class="table">
                      <thead>
                        <tr><th>Room</th><th>Rent</th><th>Status</th><th>Maintenance</th></tr>
                      </thead>
                      <tbody>
                        @for (room of floor.rooms ?? []; track room.id) {
                          <tr [appRowLink]="RoutePaths.roomDetail(agencyId(), buildingId(), room.id)">
                            <td>
                              <a class="record-link__primary" [routerLink]="RoutePaths.roomDetail(agencyId(), buildingId(), room.id)">
                                {{ room.name || ('Room ' + room.roomNumber) }}
                              </a>
                            </td>
                            <td>{{ room.monthlyRent ?? '-' }}</td>
                            <td><span class="status-chip" [ngClass]="roomStatusClass(room.status)">{{ room.status | humanLabel }}</span></td>
                            <td>{{ room.maintenanceStatus | humanLabel }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </article>
            }
          }
        </app-section-card>
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .floor-panel {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.9rem 1rem;
      display: grid;
      gap: 0.75rem;
    }

    .floor-panel__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .floor-panel h3 {
      margin: 0;
      font-size: 1rem;
    }

    .floor-panel p {
      margin: 0;
      font-size: 0.85rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly context = inject(ActiveContextService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);
  readonly building = signal<BuildingDetail | null>(null);

  /** Whether the shell is already scoped to this building. */
  readonly isActiveBuilding = computed(() =>
    this.context.buildingId() === Number(this.buildingId())
  );

  /**
   * Adding a floor happens once when the building is set up, then almost never.
   * A permanently open form pushed the floors and rooms — the reason the page
   * exists — below the fold.
   */
  readonly floorFormOpen = signal(false);
  readonly addingFloor = signal(false);
  readonly floorError = signal<ApiError | null>(null);
  readonly deletingFloorId = signal<number | null>(null);

  /**
   * The layout the operator navigates: floors bottom-up, rooms by name within
   * each floor. The payload arrives in insertion order, so the ordering has to
   * happen here — and it has to be numeric-aware, or "A10" sorts before "A2".
   */
  readonly floors = computed<BuildingFloorDetail[]>(() => {
    const floors = this.building()?.floors ?? [];
    return [...floors]
      .sort((a, b) => (a.floorNumber ?? 0) - (b.floorNumber ?? 0))
      .map((floor) => ({
        ...floor,
        rooms: [...(floor.rooms ?? [])].sort((a, b) => COLLATOR.compare(roomLabel(a), roomLabel(b)))
      }));
  });

  readonly roomFormFloorId = signal<number | null>(null);
  readonly addingRoom = signal(false);
  readonly roomError = signal<ApiError | null>(null);

  readonly floorForm = this.formBuilder.group({
    floorNumber: [null as number | null, [Validators.required, Validators.min(0)]],
    name: '',
    numberOfRooms: [null as number | null, [Validators.min(0)]]
  });

  readonly roomForm = this.formBuilder.group({
    roomNumber: [null as number | null, [Validators.required, Validators.min(0)]],
    name: '',
    monthlyRent: [null as number | null, [Validators.min(0)]],
    status: 'VACANT'
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  /**
   * Adopt this building as the working context, then go where the operator
   * was heading. Setting it silently and staying put would leave them
   * wondering whether the button did anything.
   */
  async workOnThisBuilding(): Promise<void> {
    this.context.syncFromRoute(
      Number(this.agencyId()),
      Number(this.buildingId()),
      this.building()?.name ?? null
    );

    await this.router.navigateByUrl(RoutePaths.tenants);
  }

  readonly editingAddress = signal(false);
  readonly savingAddress = signal(false);
  readonly addressError = signal<ApiError | null>(null);

  readonly addressForm = this.formBuilder.group({
    countyId: [null as number | null],
    cityId: [null as number | null],
    townId: [null as number | null],
    postalCode: '',
    description: ''
  });

  // A FormControl is not a signal, so the cascade tracks valueChanges.
  private readonly addressCountyId = toSignal(this.addressForm.controls.countyId.valueChanges, {
    initialValue: this.addressForm.controls.countyId.value
  });
  private readonly addressCityId = toSignal(this.addressForm.controls.cityId.valueChanges, {
    initialValue: this.addressForm.controls.cityId.value
  });

  readonly addressCityPicker = computed(() => {
    const countyId = this.addressCountyId();
    return countyId ? this.pickers.citiesIn(countyId) : null;
  });

  readonly addressTownPicker = computed(() => {
    const cityId = this.addressCityId();
    return cityId ? this.pickers.townsIn(cityId, this.addressCountyId()) : null;
  });

  startAddress(building: BuildingDetail): void {
    const address = building.address;
    this.addressForm.reset({
      countyId: address?.countyId ?? null,
      cityId: address?.cityId ?? null,
      townId: address?.townId ?? null,
      postalCode: address?.postalCode ?? '',
      description: address?.description ?? ''
    });
    this.addressError.set(null);
    this.editingAddress.set(true);
  }

  cancelAddress(): void {
    this.editingAddress.set(false);
    this.addressError.set(null);
  }

  /** A city outside the new county would be a nonsense pairing. */
  onAddressCountyChanged(): void {
    this.addressForm.controls.cityId.setValue(null);
    this.addressForm.controls.townId.setValue(null);
  }

  /**
   * Creates the address and attaches it in one call.
   *
   * `POST /v1/buildings/{agencyId}/{buildingId}/address` is authorised with
   * the building's own BUILDING_UPDATE, unlike the platform address search,
   * which needs ADDRESS_READ_ALL and refuses every agency admin.
   */
  async saveAddress(): Promise<void> {
    const value = this.addressForm.getRawValue();

    this.savingAddress.set(true);
    this.addressError.set(null);

    try {
      await firstValueFrom(this.housing.setBuildingAddress(
        Number(this.agencyId()), Number(this.buildingId()), {
          countyId: value.countyId,
          cityId: value.cityId,
          townId: value.townId,
          postalCode: value.postalCode || null,
          description: value.description || null
        }
      ));

      this.editingAddress.set(false);
      await this.reload();
    } catch (error) {
      this.addressError.set(toApiError(error));
    } finally {
      this.savingAddress.set(false);
    }
  }

  async removeAddress(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Remove this building\'s address?',
      message: 'Anything already generated that quoted it keeps its own copy.',
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }

    this.savingAddress.set(true);

    try {
      await firstValueFrom(this.housing.removeBuildingAddress(
        Number(this.agencyId()), Number(this.buildingId())
      ));
      this.editingAddress.set(false);
      await this.reload();
    } catch (error) {
      this.addressError.set(toApiError(error));
    } finally {
      this.savingAddress.set(false);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const building = await firstValueFrom(
        this.housing.getBuilding(Number(this.agencyId()), Number(this.buildingId()))
      );
      this.building.set(building);
      this.context.syncFromRoute(Number(this.agencyId()), Number(this.buildingId()), building.name);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async addFloor(): Promise<void> {
    if (this.floorForm.invalid) {
      this.floorForm.markAllAsTouched();
      return;
    }

    this.addingFloor.set(true);
    this.floorError.set(null);

    const value = this.floorForm.getRawValue();

    try {
      await firstValueFrom(this.housing.addFloor(Number(this.agencyId()), Number(this.buildingId()), {
        floorNumber: value.floorNumber!,
        name: value.name || null,
        numberOfRooms: value.numberOfRooms
      }));
      this.floorForm.reset({ floorNumber: null, name: '', numberOfRooms: null });
      await this.reload();
    } catch (error) {
      this.floorError.set(toApiError(error));
    } finally {
      this.addingFloor.set(false);
    }
  }

  async removeFloor(floor: BuildingFloorDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete "${floor.name || 'floor ' + floor.floorNumber}" and its rooms?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deletingFloorId.set(floor.id);
    this.error.set(null);

    try {
      await firstValueFrom(this.housing.deleteFloor(Number(this.agencyId()), Number(this.buildingId()), floor.id));
      await this.reload();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deletingFloorId.set(null);
    }
  }

  async toggleRoomForm(floor: BuildingFloorDetail): Promise<void> {
    this.roomError.set(null);
    this.roomFormFloorId.update((current) => (current === floor.id ? null : floor.id));
  }

  async addRoom(floor: BuildingFloorDetail): Promise<void> {
    if (this.roomForm.invalid) {
      this.roomForm.markAllAsTouched();
      return;
    }

    this.addingRoom.set(true);
    this.roomError.set(null);

    const value = this.roomForm.getRawValue();

    try {
      await firstValueFrom(this.housing.addRoom(Number(this.agencyId()), Number(this.buildingId()), floor.id, {
        roomNumber: value.roomNumber!,
        name: value.name || null,
        monthlyRent: value.monthlyRent,
        status: value.status as 'VACANT' | 'OCCUPIED' | 'UNDER_MAINTENANCE'
      }));
      this.roomForm.reset({ roomNumber: null, name: '', monthlyRent: null, status: 'VACANT' });
      this.roomFormFloorId.set(null);
      await this.reload();
    } catch (error) {
      this.roomError.set(toApiError(error));
    } finally {
      this.addingRoom.set(false);
    }
  }

  async remove(building: BuildingDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the building "${building.name}"? Its floors and rooms are removed too.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.housing.deleteBuilding(Number(this.agencyId()), Number(this.buildingId())));
      await this.router.navigateByUrl(RoutePaths.buildings);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }



  roomStatusClass(status?: string | null): string {
    switch (status) {
      case 'VACANT':
        return 'status-chip--success';
      case 'OCCUPIED':
        return 'status-chip--info';
      case 'UNDER_MAINTENANCE':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
  }

  toggleFloorForm(): void {
    this.floorFormOpen.update((open) => !open);
  }
}
