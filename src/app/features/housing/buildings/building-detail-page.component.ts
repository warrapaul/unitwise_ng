import { BuildingContactsComponent } from './building-contacts.component';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS, EMPTY_ADDRESS_FIELDS } from '../../../shared/components/address-fields/address-fields.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
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
import { ContractSettingsComponent } from '../contract-settings/contract-settings.component';
import { UtilityChargesComponent } from '../../rent/templates/utility-charges.component';
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
  imports: [BuildingContactsComponent, AddressFieldsComponent, DangerZoneComponent, 
    PluralPipe,
    ContractSettingsComponent,
    UtilityChargesComponent,
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
          <!-- Edit only, on the name's row at every width (§29.10); the rest moved where it belongs. -->
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_UPDATE]">
              <a class="icon-action" [routerLink]="RoutePaths.buildingEdit(agencyId(), buildingId())" aria-label="Edit building" title="Edit building">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
              </a>
            </app-permission-gate>
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
          <!--
            Working on one building means every tenant, lease and message list
            should narrow to it. Rather than asking the operator to set the same
            filter on four pages, they set it once here and the shell carries it
            (§30.5).
          -->
          <div>
            @if (isActiveBuilding()) {
              <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.tenants">View tenants</a>
            } @else {
              <button type="button" class="btn btn-primary btn-sm" (click)="workOnThisBuilding()">Work on this building</button>
            }
          </div>
        </app-section-card>

        <!--
          Two short cards side by side on a wide screen: where the building is,
          and what its leases state. Tables below keep the full width.
        -->
        <div class="pair">
        <app-section-card title="Address">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_UPDATE]">
              @if (!editingAddress()) {
                <button type="button" class="btn btn-primary btn-sm" (click)="startAddress(detail)">
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
              <!-- County → sub-county → ward → town/locality → estate/area → street/road, then building. -->
                <app-address-fields [group]="addressForm" />

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
          What this building's leases state where it differs from the agency:
          its own landlord, paybill, LR number or house rules. Blank values
          fall back to the agency's.
        -->
        <app-contract-settings
          [agencyId]="numericAgencyId()"
          [buildingId]="numericBuildingId()"
          [templateLink]="canManageTemplate() ? RoutePaths.buildingContractTemplate(agencyId(), buildingId()) : null"
        />
        </div>

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
              <!-- The section's own action is primary; once it reads Cancel it steps back to secondary. -->
              <button type="button" class="btn btn-sm" [class.btn-primary]="!floorFormOpen()" [class.btn-secondary]="floorFormOpen()"
                      (click)="toggleFloorForm()">
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
            <!--
              One table, headed once; each floor is a group under a heading row
              that carries its own actions. A card per floor repeated Room, Rent,
              Status, Maintenance over every floor — ten floors, ten header rows.
            -->
            <div class="table-scroll">
              <table class="table rooms-table">
                <thead>
                  <tr><th>Room</th><th>Rent</th><th>Status</th><th>Maintenance</th></tr>
                </thead>
                @for (floor of floors(); track floor.id) {
                  <tbody>
                    <tr class="floor-row">
                      <th colspan="4" scope="rowgroup">
                        <div class="floor-row__inner">
                          <span>
                            <strong>{{ floor.name || ('Floor ' + floor.floorNumber) }}</strong>
                            <span class="muted"> · {{ (floor.roomCount ?? (floor.rooms ?? []).length) | plural: 'room' }}</span>
                          </span>
                          <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.BUILDING_MANAGE, Permissions.AGENCY_BUILDING_MANAGE, Permissions.FLOOR_CREATE, Permissions.FLOOR_UPDATE, Permissions.FLOOR_DELETE, Permissions.ROOM_CREATE]">
                            <div class="row-actions">
                              <button type="button" class="btn btn-sm" [class.btn-primary]="roomFormFloorId() !== floor.id"
                                      [class.btn-secondary]="roomFormFloorId() === floor.id" (click)="toggleRoomForm(floor)">
                                {{ roomFormFloorId() === floor.id ? 'Close' : 'Add room' }}
                              </button>
                              <button
                                type="button"
                                class="icon-action icon-action--danger"
                                [attr.aria-label]="'Delete ' + (floor.name || 'floor ' + floor.floorNumber)"
                                title="Delete floor"
                                [disabled]="deletingFloorId() === floor.id"
                                (click)="removeFloor(floor)"
                              ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                            </div>
                          </app-permission-gate>
                        </div>
                      </th>
                    </tr>

                    @if (roomFormFloorId() === floor.id) {
                      <tr class="form-row">
                        <td colspan="4">
                          <form [formGroup]="roomForm" appFormFeedback (ngSubmit)="addRoom(floor)">
                            <div class="form-grid">
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
                              <div class="button-row">
                                <button type="submit" class="btn btn-primary" [disabled]="addingRoom()">
                                  {{ addingRoom() ? 'Adding...' : 'Add room' }}
                                </button>
                              </div>
                            </div>
                            @if (roomError(); as apiError) {
                              <app-error-card
                                [title]="apiError.status === 409 ? 'Room already exists' : 'Unable to add room'"
                                [message]="apiError.message"
                                [details]="apiError.details"
                              />
                            }
                          </form>
                        </td>
                      </tr>
                    }

                    @for (room of floor.rooms ?? []; track room.id) {
                      <tr [appRowLink]="RoutePaths.roomDetail(agencyId(), buildingId(), room.id)">
                        <td>
                          <a class="record-link__primary" [routerLink]="RoutePaths.roomDetail(agencyId(), buildingId(), room.id)">
                            {{ room.name || ('Room ' + room.roomNumber) }}
                          </a>
                        </td>
                        <td>{{ room.monthlyRent ?? '-' }}</td>
                        <td><span class="status-chip" [ngClass]="roomStatusClass(room.status)">{{ room.status | humanLabel }}</span></td>
                        <td>
                          <!-- The usual answer is a mark, so the exceptions are what the eye catches. -->
                          @if (!room.maintenanceStatus || room.maintenanceStatus === 'OK') {
                            <span class="maintenance-ok" title="OK">
                              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-check" /></svg>
                              <span class="visually-hidden">OK</span>
                            </span>
                          } @else {
                            <span class="status-chip status-chip--warning">{{ room.maintenanceStatus | humanLabel }}</span>
                          }
                        </td>
                      </tr>
                    } @empty {
                      @if (roomFormFloorId() !== floor.id) {
                        <tr><td colspan="4" class="muted">No rooms on this floor.</td></tr>
                      }
                    }
                  </tbody>
                }
              </table>
            </div>
          }
        </app-section-card>

        <!-- Charged to every room each month; a room that differs sets its own on its page. -->
        <app-utility-charges [agencyId]="numericAgencyId()" [buildingId]="numericBuildingId()" />

        <!-- Who this building's tenants are told to call, as the owner lists them. -->
        <app-building-contacts [agencyId]="numericAgencyId()" [buildingId]="numericBuildingId()" />

        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.BUILDING_DELETE]">
          <app-danger-zone label="Delete building" [busy]="deleting()" (pressed)="remove(detail)" />
        </app-permission-gate>
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: stretch; }
    .pair > * { min-width: 0; }
    @media (max-width: 1000px) { .pair { grid-template-columns: minmax(0, 1fr); } }
    .rooms-table .floor-row th { padding-top: 0.9rem; background: var(--surface-2); text-transform: none; letter-spacing: 0; font-size: 0.92rem; color: var(--text); }
    .floor-row__inner { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .rooms-table .form-row td { background: var(--surface); }
    .maintenance-ok svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: var(--success); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle; }
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
  readonly numericAgencyId = computed(() => Number(this.agencyId()));
  readonly numericBuildingId = computed(() => Number(this.buildingId()));

  readonly canManageTemplate = computed(() => this.context.canAny([
    PermissionConstants.CONTRACT_TEMPLATE_MANAGE, PermissionConstants.CONTRACT_TEMPLATE_MANAGE_ALL]));

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
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
    ...ADDRESS_FIELD_CONTROLS,
    postalCode: '',
    description: ''
  });

  startAddress(building: BuildingDetail): void {
    const address = building.address;
    this.addressForm.reset({
      countyId: address?.countyId ?? null,
      subCountyId: address?.subCountyId ?? null,
      wardId: address?.wardId ?? null,
      townId: address?.townId ?? null,
      estateAreaId: address?.estateAreaId ?? null,
      streetRoadId: address?.streetRoadId ?? null,
      buildingHouse: address?.buildingHouse ?? '',
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
          subCountyId: value.subCountyId,
          wardId: value.wardId,
          townId: value.townId,
          estateAreaId: value.estateAreaId,
          streetRoadId: value.streetRoadId,
          buildingHouse: value.buildingHouse.trim() || null,
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
    const floorName = floor.name || `Floor ${floor.floorNumber}`;
    if (!await this.confirm.ask({
      title: `Delete "${floorName}"?`,
      message: 'Its rooms are removed too, and this cannot be undone.',
      confirmLabel: 'Delete floor',
      destructive: true,
      typeToConfirm: floorName
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
      title: `Delete the building "${building.name}"?`,
      message: 'Its floors and rooms are removed too, and this cannot be undone.',
      confirmLabel: 'Delete building',
      destructive: true,
      typeToConfirm: building.name
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
