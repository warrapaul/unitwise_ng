import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal, computed } from '@angular/core';
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
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import { AccessControlService } from '../../access-control/access-control.service';
import { RoleResponse } from '../../access-control/models/access-control.models';
import { AgencyAdmin, AgencyDetail, BuildingPreview } from '../models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';

@Component({
  selector: 'app-agency-detail-page',
  standalone: true,
  imports: [
    AddressPreviewComponent,
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    EntityPickerComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FormFeedbackDirective,
    BackLinkComponent,
    UnitPipe,
    DetailGroupComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.agencies" label="Back" [title]="agency()?.name || null" />
      @if (loading()) {
        <app-loading-state label="Loading agency..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (agency(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.description || null">
          <ng-container actions>
            <div class="button-row">
              <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.agencyEdit(detail.id)">Edit</a>
              </app-permission-gate>
              <!--
                The exception to "this row acts on this record" (§28.10): for an
                operator with a single agency this page stands in for the list,
                and the list is where a create button lives. Without it they
                would have no way to add a second.
              -->
              <app-permission-gate [permissions]="[Permissions.AGENCY_CREATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.agencyCreate">New agency</a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.CONTRACT_TEMPLATE_MANAGE, Permissions.CONTRACT_TEMPLATE_MANAGE_ALL]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.agencyContractTemplate(detail.id)">
                  Contract template
                </a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.AGENCY_DELETE]">
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
              <div class="lead"><dt>Owner</dt><dd>{{ detail.ownerName || '-' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Default rent terms">
              <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent ?? '-' }}</dd></div>
              <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit ?? '-' }}</dd></div>
              <div><dt>Payment due day</dt><dd>{{ detail.paymentDueDay ?? '-' }}</dd></div>
              <div><dt>Late fee</dt><dd>{{ detail.lateFeeAmount ?? '-' }}</dd></div>
              <div><dt>Grace period</dt><dd>{{ detail.gracePeriodDays | unit: 'days' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Contact">
              <div><dt>Contact phone</dt><dd class="mono">{{ detail.agencyProfile?.phoneNumber || '-' }}</dd></div>
              <div><dt>Contact email</dt><dd>{{ detail.agencyProfile?.email || '-' }}</dd></div>
              <div><dt>Owner email</dt><dd>{{ detail.ownerEmail || '-' }}</dd></div>
              <div><dt>Website</dt><dd>{{ detail.agencyProfile?.website || '-' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Record">
              <div><dt>Registration</dt><dd class="mono">{{ detail.registrationNumber || '-' }}</dd></div>
            </app-detail-group>
          </div>

          @if (detail.termsAndConditions) {
            <details>
              <summary>Terms and conditions</summary>
              <p>{{ detail.termsAndConditions }}</p>
            </details>
          }
        </app-section-card>

        <app-section-card title="Addresses">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
              @if (!addingAddress()) {
                <button type="button" class="btn btn-secondary btn-sm" (click)="startAddress()">Add address</button>
              }
            </app-permission-gate>
          </ng-container>

          @if ((detail.agencyAddresses ?? []).length === 0 && !addingAddress()) {
            <p class="muted">No address on file for this agency yet.</p>
          } @else {
            <ul class="address-list">
              @for (address of detail.agencyAddresses ?? []; track address.id) {
                <li class="address-list__row">
                  <app-address-preview [address]="address" [block]="true" />
                  <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
                    <button
                      type="button"
                      class="icon-action icon-action--danger"
                      aria-label="Unlink address"
                      title="Unlink address"
                      [disabled]="unlinkingAddressId() === address.id"
                      (click)="unlinkAddress(address.id)"
                    ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                  </app-permission-gate>
                </li>
              }
            </ul>
          }

          <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
            <!--
              Write the address here rather than searching for one.

              Searching means reading the platform's whole address table,
              which is a super-admin capability and 403s for every agency
              admin. The scoped create-and-assign endpoint is the one their
              own permission covers, and it is also the truer flow: nobody
              adding their office address expects to find it already typed
              in by a stranger.
            -->
            @if (addingAddress()) {
              <form class="stack" [formGroup]="addressForm" appFormFeedback (ngSubmit)="createAddress()">
                <div class="grid-auto">
                  <label class="field">
                    <span>County</span>
                    <app-entity-picker
                      [config]="pickers.county"
                      formControlName="countyId"
                      placeholder="Select a county"
                      (valueChange)="onCountyChanged()"
                    />
                  </label>

                  <label class="field">
                    <span>City</span>
                    @if (cityPicker(); as config) {
                      <app-entity-picker [config]="config" formControlName="cityId" placeholder="Select a city" />
                    } @else {
                      <input disabled placeholder="Choose a county first">
                    }
                  </label>

                  <label class="field">
                    <span>Town</span>
                    @if (townPicker(); as config) {
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
                    <input formControlName="description" placeholder="e.g. 3rd floor, opposite the petrol station">
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
                </div>
              </form>
            }
          </app-permission-gate>
        </app-section-card>

        <app-section-card title="Buildings">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_CREATE]">
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.buildingCreate" [queryParams]="{ agencyId: detail.id }">
                Add building
              </a>
            </app-permission-gate>
          </ng-container>

          @if (buildingsLoading()) {
            <app-loading-state label="Loading buildings..." />
          } @else if (buildingsError()) {
            <app-error-state [message]="buildingsError()!" (retry)="loadBuildings()" />
          } @else if (buildings().length === 0) {
            <app-empty-state title="No buildings yet" description="Add a building to start managing units." />
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Building</th><th>Floors</th><th>Rooms</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (building of buildings(); track building.id) {
                    <tr [appRowLink]="RoutePaths.buildingDetail(detail.id, building.id)">
                      <td>
                        <a class="record-link__primary" [routerLink]="RoutePaths.buildingDetail(detail.id, building.id)">
                          {{ building.name }}
                        </a>
                      </td>
                      <td>{{ building.floorCount ?? 0 }}</td>
                      <td>{{ building.totalRoomCount ?? 0 }}</td>
                      <td><app-status-chip [status]="building.status" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_READ]">
          <app-section-card title="Administrators">
            <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_ADD]">
              <form [formGroup]="adminForm" appFormFeedback (ngSubmit)="addAdmin()">
                <div class="grid-auto">
                  <label class="field">
                    <span>User ID</span>
                    <app-entity-picker [config]="pickers.user" formControlName="userId" placeholder="Search for the user" />
                    @if (adminForm.controls.userId.invalid && adminForm.controls.userId.touched) {
                      <small class="error-text">A user ID is required.</small>
                    }
                  </label>
                  <label class="field">
                    <span>Role</span>
                    <select formControlName="roleId">
                      <option [ngValue]="null">Select a role</option>
                      @for (role of roles(); track role.id) {
                        <option [ngValue]="role.id">{{ role.name }}</option>
                      }
                    </select>
                    @if (adminForm.controls.roleId.invalid && adminForm.controls.roleId.touched) {
                      <small class="error-text">A role is required.</small>
                    }
                  </label>
                  <label class="field">
                    <span>Scope</span>
                    <select formControlName="scope">
                      <option value="AGENCY_WIDE">Agency wide</option>
                      <option value="BUILDING_LEVEL">Building level</option>
                    </select>
                  </label>
                </div>

                @if (adminForm.controls.scope.value === 'BUILDING_LEVEL') {
                  <fieldset class="building-select">
                    <legend>Assigned buildings</legend>
                    @if (buildingsLoading()) {
                      <p class="muted">Loading buildings…</p>
                    } @else if (buildingsError()) {
                      <p class="error-text">
                        {{ buildingsError() }}
                        <button type="button" class="btn btn-secondary btn-sm" (click)="loadBuildings()">Retry</button>
                      </p>
                    } @else if (buildings().length === 0) {
                      <p class="muted">This agency has no buildings to assign yet.</p>
                    } @else {
                      <div class="checkbox-grid">
                        @for (building of buildings(); track building.id) {
                          <label class="checkbox-field">
                            <input
                              type="checkbox"
                              [checked]="selectedBuildingIds().has(building.id)"
                              (change)="toggleBuilding(building.id)"
                            >
                            <span>{{ building.name }}</span>
                          </label>
                        }
                      </div>
                    }
                  </fieldset>
                }

                @if (adminError(); as apiError) {
                  <app-error-card
                    [title]="apiError.status === 409 ? 'Already an administrator' : 'Unable to add administrator'"
                    [message]="apiError.message"
                    [details]="apiError.details"
                  />
                }

                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="addingAdmin()">
                    {{ addingAdmin() ? 'Adding...' : 'Add administrator' }}
                  </button>
                </div>
              </form>
            </app-permission-gate>

            <!-- Reading who administers an agency is its own permission. -->
            @if (adminsLoading()) {
              <app-loading-state label="Loading administrators..." />
            } @else if (adminsError()) {
              <app-error-state [message]="adminsError()!" (retry)="loadAdmins()" />
            } @else if (admins().length === 0) {
              <app-empty-state title="No administrators" description="Add an administrator to delegate management." />
            } @else if (admins().length <= COMPACT_THRESHOLD) {
              <!--
                An agency has a handful of administrators, and six columns of
                chrome to show three of them is machinery without a question.
              -->
              <div class="record-grid">
                @for (admin of admins(); track admin.id) {
                  <article class="record-card">
                    <header class="record-card__head">
                      <span class="record-card__title">{{ adminName(admin) }}</span>
                      <span class="status-chip" [ngClass]="admin.isEnabled ? 'status-chip--success' : 'status-chip--neutral'">
                        {{ admin.isEnabled ? 'Enabled' : 'Disabled' }}
                      </span>
                    </header>

                    <p class="muted">{{ admin.user?.email || '-' }}</p>

                    <dl class="record-card__facts">
                      <div><dt>Role</dt><dd>{{ admin.role?.name || '-' }}</dd></div>
                      <div><dt>Scope</dt><dd>{{ admin.scope || '-' }}</dd></div>
                    </dl>

                    @if (admin.scope === 'BUILDING_LEVEL') {
                      <p class="muted">{{ assignedBuildingNames(admin) }}</p>
                    }

                    <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_REMOVE]">
                      <div class="button-row">
                        <button
                          type="button"
                          class="btn btn-danger btn-sm"
                          [disabled]="removingAdminUserId() === admin.user?.id"
                          (click)="removeAdmin(admin)"
                        >Remove</button>
                      </div>
                    </app-permission-gate>
                  </article>
                }
              </div>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr><th>Administrator</th><th>Role</th><th>Scope</th><th>Buildings</th><th>Status</th><th class="actions-col">Actions</th></tr>
                  </thead>
                  <tbody>
                    @for (admin of admins(); track admin.id) {
                      <tr>
                        <td>
                          <div class="cell-stack">
                            <span>{{ adminName(admin) }}</span>
                            <span class="muted">{{ admin.user?.email || '-' }}</span>
                          </div>
                        </td>
                        <td>{{ admin.role?.name || '-' }}</td>
                        <td>{{ admin.scope || '-' }}</td>
                        <td>{{ assignedBuildingNames(admin) }}</td>
                        <td>
                          <span class="status-chip" [ngClass]="admin.isEnabled ? 'status-chip--success' : 'status-chip--neutral'">
                            {{ admin.isEnabled ? 'Enabled' : 'Disabled' }}
                          </span>
                        </td>
                        <td class="actions-col">
                          <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_REMOVE]">
                            <button
                              type="button"
                              class="btn btn-danger btn-sm"
                              [disabled]="removingAdminUserId() === admin.user?.id"
                              (click)="removeAdmin(admin)"
                            >
                              Remove
                            </button>
                          </app-permission-gate>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>
        </app-permission-gate>
      }
    </section>
  `,
  styles: [`
    .address-list { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }

    .address-list__row {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 10px;
    }

    form {
      display: grid;
      gap: 1.15rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .building-select {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      margin: 0;
    }

    legend {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0 0.35rem;
    }

    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.35rem 1rem;
    }

    details p {
      margin: 0.5rem 0 0;
      white-space: pre-wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyDetailPageComponent implements OnInit {
  /** Below this many records a table is chrome without a question (§28.7). */
  readonly COMPACT_THRESHOLD = 5;

  private readonly confirm = inject(ConfirmService);
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  private readonly accessControl = inject(AccessControlService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);
  readonly agency = signal<AgencyDetail | null>(null);

  readonly buildingsLoading = signal(false);
  readonly buildingsError = signal<string | null>(null);
  readonly buildings = signal<BuildingPreview[]>([]);

  readonly adminsLoading = signal(false);
  readonly adminsError = signal<string | null>(null);
  readonly admins = signal<AgencyAdmin[]>([]);
  readonly roles = signal<RoleResponse[]>([]);
  readonly addingAdmin = signal(false);
  readonly adminError = signal<ApiError | null>(null);
  readonly removingAdminUserId = signal<number | null>(null);
  readonly selectedBuildingIds = signal<Set<number>>(new Set());

  readonly linkingAddress = signal(false);
  readonly addressError = signal<ApiError | null>(null);
  readonly unlinkingAddressId = signal<number | null>(null);

  readonly adminForm = this.formBuilder.group({
    userId: [null as number | null, [Validators.required, Validators.min(1)]],
    roleId: [null as number | null, [Validators.required]],
    scope: 'AGENCY_WIDE'
  });

  readonly addingAddress = signal(false);
  readonly savingAddress = signal(false);

  readonly addressForm = this.formBuilder.group({
    countyId: [null as number | null],
    cityId: [null as number | null],
    townId: [null as number | null],
    postalCode: '',
    description: ''
  });

  // A FormControl is not a signal, so the cascade tracks valueChanges.
  private readonly countyId = toSignal(this.addressForm.controls.countyId.valueChanges, {
    initialValue: this.addressForm.controls.countyId.value
  });
  private readonly cityId = toSignal(this.addressForm.controls.cityId.valueChanges, {
    initialValue: this.addressForm.controls.cityId.value
  });

  /** Each tier is scoped by the one above it, so it cannot exist before it. */
  readonly cityPicker = computed(() => {
    const countyId = this.countyId();
    return countyId ? this.pickers.citiesIn(countyId) : null;
  });

  readonly townPicker = computed(() => {
    const cityId = this.cityId();
    return cityId ? this.pickers.townsIn(cityId, this.countyId()) : null;
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
    void this.loadAdmins();
    void this.loadRoles();
  }

  /**
   * Refreshes the agency *and* its buildings.
   *
   * They were loaded once in ngOnInit and never again, so adding a building
   * elsewhere left this page insisting the agency had none — including in the
   * administrator form's building picker, where it read as "nothing to assign".
   */
  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.agency.set(await firstValueFrom(this.housing.getAgency(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }

    void this.loadBuildings();
  }

  async loadBuildings(): Promise<void> {
    this.buildingsLoading.set(true);
    this.buildingsError.set(null);

    try {
      const result = await firstValueFrom(this.housing.getBuildingsForAgency(Number(this.id()), { page: 0, size: 100 }));
      this.buildings.set(result.items);
    } catch (error) {
      this.buildingsError.set(extractErrorMessage(error));
    } finally {
      this.buildingsLoading.set(false);
    }
  }

  async loadAdmins(): Promise<void> {
    this.adminsLoading.set(true);
    this.adminsError.set(null);

    try {
      this.admins.set(await firstValueFrom(this.housing.getAgencyAdmins(Number(this.id()))));
    } catch (error) {
      this.adminsError.set(extractErrorMessage(error));
    } finally {
      this.adminsLoading.set(false);
    }
  }

  async loadRoles(): Promise<void> {
    try {
      this.roles.set(await firstValueFrom(this.accessControl.getAgencyRoles()));
    } catch {
      // Without AGENCY_ROLES_READ the select stays empty and the required validator blocks submit.
      this.roles.set([]);
    }
  }

  async toggleBuilding(buildingId: number): Promise<void> {
    this.selectedBuildingIds.update((current) => {
      const next = new Set(current);
      next.has(buildingId) ? next.delete(buildingId) : next.add(buildingId);
      return next;
    });
  }

  async addAdmin(): Promise<void> {
    if (this.adminForm.invalid) {
      this.adminForm.markAllAsTouched();
      return;
    }

    this.addingAdmin.set(true);
    this.adminError.set(null);

    const value = this.adminForm.getRawValue();

    try {
      await firstValueFrom(this.housing.addAgencyAdmin(Number(this.id()), {
        userId: value.userId!,
        roleId: value.roleId!,
        scope: value.scope as 'AGENCY_WIDE' | 'BUILDING_LEVEL',
        buildingIds: value.scope === 'BUILDING_LEVEL' ? [...this.selectedBuildingIds()] : null
      }));

      this.adminForm.reset({ userId: null, roleId: null, scope: 'AGENCY_WIDE' });
      this.selectedBuildingIds.set(new Set());
      await this.loadAdmins();
    } catch (error) {
      this.adminError.set(toApiError(error));
    } finally {
      this.addingAdmin.set(false);
    }
  }

  async removeAdmin(admin: AgencyAdmin): Promise<void> {
    const userId = admin.user?.id;
    if (!userId || !await this.confirm.ask({
      title: `Remove ${this.adminName(admin)} as an administrator?`,
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }

    this.removingAdminUserId.set(userId);
    this.adminsError.set(null);

    try {
      await firstValueFrom(this.housing.removeAgencyAdmin(Number(this.id()), userId));
      this.admins.update((items) => items.filter((item) => item.user?.id !== userId));
    } catch (error) {
      this.adminsError.set(extractErrorMessage(error));
    } finally {
      this.removingAdminUserId.set(null);
    }
  }

  startAddress(): void {
    this.addressForm.reset({ countyId: null, cityId: null, townId: null, postalCode: '', description: '' });
    this.addressError.set(null);
    this.addingAddress.set(true);
  }

  cancelAddress(): void {
    this.addingAddress.set(false);
    this.addressError.set(null);
  }

  /** A city outside the new county would be a nonsense pairing. */
  onCountyChanged(): void {
    this.addressForm.controls.cityId.setValue(null);
    this.addressForm.controls.townId.setValue(null);
  }

  /**
   * Creates the address and attaches it in one call.
   *
   * `POST /v1/agencies/{id}/addresses` is authorised with the agency's own
   * `AGENCY_UPDATE`, unlike the platform address search the picker used to
   * call, which needs `ADDRESS_READ_ALL` and 403s for every agency admin.
   */
  async createAddress(): Promise<void> {
    const value = this.addressForm.getRawValue();

    this.savingAddress.set(true);
    this.addressError.set(null);

    try {
      await firstValueFrom(this.housing.addAgencyAddress(Number(this.id()), {
        countyId: value.countyId,
        cityId: value.cityId,
        townId: value.townId,
        postalCode: value.postalCode || null,
        description: value.description || null
      }));

      this.addingAddress.set(false);
      await this.reload();
    } catch (error) {
      this.addressError.set(toApiError(error));
    } finally {
      this.savingAddress.set(false);
    }
  }


  async unlinkAddress(addressId?: number): Promise<void> {
    if (!addressId || !await this.confirm.ask({
      title: 'Unlink this address from the agency?',
      confirmLabel: 'Unlink',
      destructive: true
    })) {
      return;
    }

    this.unlinkingAddressId.set(addressId);
    this.error.set(null);

    try {
      await firstValueFrom(this.housing.unlinkAgencyAddress(Number(this.id()), addressId));
      await this.reload();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.unlinkingAddressId.set(null);
    }
  }

  async remove(agency: AgencyDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the agency "${agency.name}"? This also removes its buildings.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.housing.deleteAgency(agency.id));
      await this.router.navigateByUrl(RoutePaths.agencies);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }

  adminName(admin: AgencyAdmin): string {
    const user = admin.user;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    return name || user?.email || `User #${user?.id ?? admin.id}`;
  }

  assignedBuildingNames(admin: AgencyAdmin): string {
    const names = (admin.assignedBuildings ?? []).map((building) => building.name);
    return names.length > 0 ? names.join(', ') : 'All';
  }

  joinParts(values: Array<string | null | undefined>, separator = ', '): string {
    return values.filter((value): value is string => !!value).join(separator) || '-';
  }

}
