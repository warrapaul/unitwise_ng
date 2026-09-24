import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal, computed } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { assignableRoleNames } from '../../../core/rbac/role.constants';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
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
import { UserIdentity } from '../../users/models/user.models';
import { UsersService } from '../../users/users.service';
import { ActiveContextService } from '../../../core/services/active-context.service';
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
import { ContractSettingsComponent } from '../contract-settings/contract-settings.component';
import { UidShareComponent } from '../../../shared/components/uid-share/uid-share.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';

@Component({
  selector: 'app-agency-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, HumanLabelPipe, 
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
    ContractSettingsComponent,
    UidShareComponent,
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
          <!-- Tenants quote this to share their renter profile with the agency. -->
          <app-uid-share
            title-addon
            variant="inline"
            [uid]="detail.agencyCode || null"
            [name]="detail.name"
            label="Agency code"
            codeName="agency code"
          />
          <!--
            Edit only: the action used most, on the name's row at every width.
            New agency is rare and moved to the foot of the page; Delete is last
            of all (§40.1a); Contract template lives in Contract details.
          -->
          <ng-container actions>
            <div class="icon-row">
              <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
                <a class="icon-action" [routerLink]="RoutePaths.agencyEdit(detail.id)" aria-label="Edit agency" title="Edit agency">
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                </a>
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

        </app-section-card>

        <app-section-card title="Buildings">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_CREATE]">
              <!-- The next step for a new agency: nothing else works until it has a building. -->
              <a class="btn btn-sm" [class.btn-primary]="!buildingsLoading() && buildings().length === 0"
                 [class.btn-secondary]="buildingsLoading() || buildings().length > 0"
                 [routerLink]="RoutePaths.buildingCreate" [queryParams]="{ agencyId: detail.id }">
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
                  <!--
                    Searching every user on the platform needs USER_READ_ALL
                    and 403s for an agency admin — correctly, since it is a
                    read of everyone. A landlord adds somebody they already
                    know, so they identify them by the uid that person gave
                    them, exactly as when adding a tenant.
                  -->
                  @if (canSearchAllUsers()) {
                    <label class="field">
                      <span>User</span>
                      <app-entity-picker [config]="pickers.user" formControlName="userId" placeholder="Search for the user" />
                      @if (adminForm.controls.userId.invalid && adminForm.controls.userId.touched) {
                        <small class="error-text">Choose a user.</small>
                      }
                    </label>
                  } @else {
                    <label class="field">
                      <span>Their Unitwise ID</span>
                      <div class="uid-lookup">
                        <input
                          class="mono"
                          [value]="adminUid()"
                          (input)="onAdminUidInput($event)"
                          (keyup.enter)="lookupAdmin()"
                          placeholder="Type or paste their ID"
                          autocomplete="off"
                          spellcheck="false"
                          maxlength="12"
                        >
                        <button
                          type="button"
                          class="btn btn-secondary"
                          [disabled]="!adminUid().trim() || lookingUpAdmin()"
                          (click)="lookupAdmin()"
                        >{{ lookingUpAdmin() ? 'Finding...' : 'Find' }}</button>
                      </div>

                      @if (adminUidError(); as message) {
                        <small class="error-text">{{ message }}</small>
                      }

                    </label>
                  }
                  <label class="field">
                    <span>Role</span>
                    <select formControlName="roleId">
                      <option [ngValue]="null">Select a role</option>
                      <!-- Only what RoleAssignmentPolicy lets this operator grant; the rest would 403. -->
                      @for (role of assignableRoles(); track role.id) {
                        <option [ngValue]="role.id">{{ role.name | humanLabel }}</option>
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

                <!--
                  Who you found, stated plainly and across the full width.
                  It was a line of muted helper text under the input, which
                  is how you confirm a postcode — not how you confirm the
                  person about to be given administrative access to your
                  agency. Typing again clears it, so what is shown is always
                  the account that will actually be added.
                -->
                @if (adminIdentity(); as person) {
                  <article class="found">
                    <span class="found__mark" aria-hidden="true">{{ foundInitials(person) }}</span>

                    <div class="found__body">
                      <p class="found__name">{{ foundName(person) }}</p>
                      <p class="muted mono">{{ person.userUid }}</p>
                      @if (person.accountActive === false) {
                        <p class="muted">This account has not been claimed yet.</p>
                      }
                    </div>

                    <p class="muted found__note">
                      This is who will be added. Check it before granting access.
                    </p>
                  </article>
                }

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
                      <div><dt>Role</dt><dd>{{ admin.role?.name | humanLabel }}</dd></div>
                      <div><dt>Scope</dt><dd>{{ admin.scope | humanLabel }}</dd></div>
                    </dl>

                    @if (admin.scope === 'BUILDING_LEVEL') {
                      <p class="muted">{{ assignedBuildingNames(admin) }}</p>
                    }

                    <!-- Nobody removes themselves: it would lock them out of this page mid-task. -->
                    @if (!isSelf(admin)) {
                      <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_REMOVE]">
                        <div class="button-row">
                          <button
                            type="button"
                            class="icon-action icon-action--danger"
                            [disabled]="removingAdminUserId() === admin.user?.id"
                            (click)="removeAdmin(admin)"
                            [attr.aria-label]="'Remove ' + adminName(admin)"
                            title="Remove administrator"
                          ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                        </div>
                      </app-permission-gate>
                    } @else {
                      <p class="muted">You</p>
                    }
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
                        <td>{{ admin.role?.name | humanLabel }}</td>
                        <td>{{ admin.scope | humanLabel }}</td>
                        <td>{{ assignedBuildingNames(admin) }}</td>
                        <td>
                          <span class="status-chip" [ngClass]="admin.isEnabled ? 'status-chip--success' : 'status-chip--neutral'">
                            {{ admin.isEnabled ? 'Enabled' : 'Disabled' }}
                          </span>
                        </td>
                        <td class="actions-col">
                          @if (!isSelf(admin)) {
                            <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_REMOVE]">
                              <button
                                type="button"
                                class="icon-action icon-action--danger"
                                [disabled]="removingAdminUserId() === admin.user?.id"
                                (click)="removeAdmin(admin)"
                                [attr.aria-label]="'Remove ' + adminName(admin)"
                                title="Remove administrator"
                              ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                            </app-permission-gate>
                          } @else {
                            <span class="muted">You</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>
        </app-permission-gate>

        <!--
          The values every lease this agency issues states — landlord, where
          rent is paid, house rules. Recorded once here rather than typed into
          each contract.
        -->
        <app-contract-settings [agencyId]="detail.id" [templateLink]="canManageTemplate() ? RoutePaths.agencyContractTemplate(detail.id) : null" />

        <!-- Last: addresses are set once and rarely read, unlike buildings and administrators. -->
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
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <!--
          For an operator with one agency this page stands in for the list, and
          the list is where create lives (§28.10) — so it is offered, but at the
          foot, because setting up a second agency is rare.
        -->
        <app-permission-gate [permissions]="[Permissions.AGENCY_CREATE]">
          <section class="panel another">
            <span class="muted">Another agency</span>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.agencyCreate">New agency</a>
          </section>
        </app-permission-gate>

        <!-- Not offered for an operator's only agency: it would leave them nothing to work in (§40.3). -->
        @if (canDeleteAgency()) {
          <app-permission-gate [permissions]="[Permissions.AGENCY_DELETE]">
            <app-danger-zone label="Delete agency" [busy]="deleting()" (pressed)="remove(detail)" />
          </app-permission-gate>
        }
      }
    </section>
  `,
  styles: [`
    .icon-row { display: flex; align-items: center; gap: 0.4rem; }

    .another {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding: 0.8rem 1.25rem;
    }

    /* The person about to be granted access, at the weight that deserves. */
    .found {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.3rem 0.85rem;
      align-items: center;
      margin: 0.85rem 0;
      padding: 0.8rem 1rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-lg);
      background: var(--primary-tint);
    }

    .found__mark {
      display: inline-grid;
      place-items: center;
      width: 2.6rem;
      height: 2.6rem;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--primary-ring);
      color: var(--primary-strong);
      font-weight: 700;
    }

    .found__body { display: grid; gap: 0.1rem; min-width: 0; }
    .found__name { margin: 0; font-size: 1.05rem; font-weight: 700; }
    .found__body p { margin: 0; }
    .found__note { grid-column: 1 / -1; margin: 0; font-size: 0.8rem; }

    @media (max-width: 560px) {
      .found { grid-template-columns: 1fr; justify-items: start; }
    }

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
  private readonly context = inject(ActiveContextService);

  /** An operator's only agency is not theirs to delete; a platform reader may. */
  readonly canDeleteAgency = computed(() =>
    this.context.can(PermissionConstants.AGENCY_READ_ALL) || this.context.agencies().length > 1);

  private readonly session = inject(AuthSessionService);

  /** The signed-in operator's own admin row. */
  isSelf(admin: AgencyAdmin): boolean {
    const me = this.session.currentUserId();
    return me !== null && me !== undefined && admin.user?.id === me;
  }

  readonly canManageTemplate = computed(() => this.context.canAny([
    PermissionConstants.CONTRACT_TEMPLATE_MANAGE, PermissionConstants.CONTRACT_TEMPLATE_MANAGE_ALL]));
  private readonly users = inject(UsersService);

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

  /**
   * The roles this operator may give, mirroring the backend's
   * RoleAssignmentPolicy: a super admin any, an agency admin Agency admin or
   * Caretaker. Every role the operator holds counts, not only the active one.
   */
  readonly assignableRoles = computed(() => {
    const assignable = assignableRoleNames(this.context.options().map((option) => option.roleName));
    return this.roles().filter((role) => assignable === 'ALL' || assignable.has(role.name));
  });
  readonly addingAdmin = signal(false);
  readonly adminError = signal<ApiError | null>(null);
  readonly removingAdminUserId = signal<number | null>(null);
  readonly selectedBuildingIds = signal<Set<number>>(new Set());

  readonly linkingAddress = signal(false);
  readonly addressError = signal<ApiError | null>(null);
  readonly unlinkingAddressId = signal<number | null>(null);

  /** Searching every user is a platform-wide read; a landlord never holds it. */
  readonly canSearchAllUsers = computed(() => this.context.can(PermissionConstants.USER_READ_ALL));

  readonly adminUid = signal('');
  readonly lookingUpAdmin = signal(false);
  readonly adminUidError = signal<string | null>(null);
  readonly adminIdentity = signal<UserIdentity | null>(null);

  onAdminUidInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    if (input.value !== upper) {
      input.value = upper;
    }
    this.adminUid.set(upper.trim());
    this.adminIdentity.set(null);
  }

  foundName(person: UserIdentity): string {
    return [person.officialFirstName, person.officialLastName].filter(Boolean).join(' ')
      || 'Name not stated yet';
  }

  foundInitials(person: UserIdentity): string {
    return [person.officialFirstName, person.officialLastName]
      .filter(Boolean)
      .map((part) => part!.charAt(0).toUpperCase())
      .join('') || '?';
  }

  async lookupAdmin(): Promise<void> {
    const uid = this.adminUid().trim();
    if (!uid) {
      return;
    }

    this.lookingUpAdmin.set(true);
    this.adminUidError.set(null);
    this.adminIdentity.set(null);

    try {
      this.adminIdentity.set(await firstValueFrom(this.users.getUserIdentityByUid(uid)));
    } catch (error) {
      this.adminUidError.set(
        toApiError(error).status === 404 ? `No account with UID "${uid}".` : extractErrorMessage(error)
      );
    } finally {
      this.lookingUpAdmin.set(false);
    }
  }

  readonly adminForm = this.formBuilder.group({
    // Required only on the picker path; the uid path supplies the person
    // instead, and the guard in addAdmin checks whichever is in use.
    userId: [null as number | null],
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
    const identified = this.canSearchAllUsers()
      ? this.adminForm.controls.userId.value !== null
      : this.adminIdentity() !== null;

    if (this.adminForm.invalid || !identified) {
      this.adminForm.markAllAsTouched();
      if (!identified) {
        this.adminUidError.set('Find the person by their Unitwise ID first.');
      }
      return;
    }

    this.addingAdmin.set(true);
    this.adminError.set(null);

    const value = this.adminForm.getRawValue();

    try {
      await firstValueFrom(this.housing.addAgencyAdmin(Number(this.id()), {
        userId: value.userId,
        // The landlord's path: no numeric id, because the uid lookup is all
        // they can reach. Sending both is harmless — the server prefers userId.
        userUid: this.adminIdentity()?.userUid ?? null,
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
