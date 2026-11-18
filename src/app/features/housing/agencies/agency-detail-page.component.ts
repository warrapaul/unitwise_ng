import { PageTitleService } from '../../../core/services/page-title.service';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { NotificationService } from '../../../core/services/notification.service';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { dueDayLabel } from '../../../shared/utils/format.util';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { MpesaCollectionComponent } from '../../rent/components/mpesa-collection.component';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS, EMPTY_ADDRESS_FIELDS, TYPED_PLACE_CONTROLS } from '../../../shared/components/address-fields/address-fields.component';
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
import { OwnersService } from '../../owners/owners.service';
import { UidShareComponent } from '../../../shared/components/uid-share/uid-share.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';

import { UtilityChargesComponent } from '../../rent/templates/utility-charges.component';
@Component({
  selector: 'app-agency-detail-page',
  standalone: true,
  imports: [PhoneMenuComponent, DialogComponent, FieldErrorComponent, MoneyPipe, CardTableDirective, MpesaCollectionComponent, AddressFieldsComponent, DangerZoneComponent, HumanLabelPipe, UtilityChargesComponent, 
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
        <app-loading-state label="Loading agency…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (agency(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.description || null">
          <!-- Tenants quote this to share their tenant profile with the agency. -->
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
              <!-- The agency's plan, invoices and payments; the platform admin manages the subscription there. -->
              <app-permission-gate [permissions]="['BILLING_VIEW', 'BILLING_SUBSCRIPTION_MANAGE']">
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.billingAgency(detail.id)">Plan &amp; billing</a>
              </app-permission-gate>
            </div>
          </ng-container>
          <ng-container card-tools>
            <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
                <a class="icon-action" [routerLink]="RoutePaths.agencyEdit(detail.id)" aria-label="Edit agency" title="Edit agency">
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
              <!-- The owner's account is one tap away for whoever may read other people's accounts. -->
              <div class="lead">
                <dt>Owner</dt>
                <dd>
                  @if (detail.ownerId && context.can('USER_READ_ALL')) {
                    <a [routerLink]="RoutePaths.userDetail(detail.ownerId)">{{ detail.ownerName || 'User #' + detail.ownerId }}</a>
                  } @else {
                    {{ detail.ownerName || '-' }}
                  }
                </dd>
              </div>
              <div class="lead">
                <dt>Manages</dt>
                <dd>
                  {{ detail.managementMode === 'FOR_OWNERS' ? 'Other landlords\' buildings' : 'Its own buildings' }}
                  <app-permission-gate [permissions]="['AGENCY_MODE_MANAGE']">
                    <button type="button" class="btn btn-text btn-sm" [disabled]="switchingMode()" (click)="switchMode(detail)">
                      {{ detail.managementMode === 'FOR_OWNERS' ? 'Switch to own buildings' : 'Switch to managing for owners' }}</button>
                  </app-permission-gate>
                </dd>
              </div>
            </app-detail-group>

            <app-detail-group label="Contact">
              <div><dt>Contact phone</dt><dd>@if (detail.agencyProfile?.phoneNumber) { <app-phone-menu [phone]="detail.agencyProfile!.phoneNumber!" /> } @else { - }</dd></div>
              <div><dt>Contact email</dt><dd class="wrap-anywhere">@if (detail.agencyProfile?.email) { <a [href]="'mailto:' + detail.agencyProfile!.email">{{ detail.agencyProfile!.email }}</a> } @else { - }</dd></div>
              <div><dt>Owner email</dt><dd class="wrap-anywhere">@if (detail.ownerEmail) { <a [href]="'mailto:' + detail.ownerEmail">{{ detail.ownerEmail }}</a> } @else { - }</dd></div>
              @if (detail.agencyProfile?.website) { <div><dt>Website</dt><dd>{{ detail.agencyProfile!.website }}</dd></div> }
              <div><dt>Registration number</dt><dd>{{ detail.registrationNumber || '-' }}</dd></div>
            </app-detail-group>
          </div>
        </app-section-card>

        <!-- Section shortcuts: a long page, jumped through rather than scrolled. -->
        <nav class="jump" aria-label="Sections on this page">
          @for (part of jumpTargets; track part.id) {
            <button type="button" class="filter-chip" (click)="jump(part.id)">{{ part.label }}</button>
          }
        </nav>

        <!-- Its own card, with its own Edit: what every building and room starts from. -->
        <app-section-card id="rent-terms" title="Rent terms for all buildings">
          <ng-container card-tools>
            <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.agencyEdit(detail.id)">Edit</a>
            </app-permission-gate>
          </ng-container>
          <dl class="detail-grid">
            <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent | money }}</dd></div>
            <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit | money }}</dd></div>
            <div><dt>Rent due</dt><dd>{{ dueDay(detail.paymentDueDay) }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFeeEnabled ? (detail.lateFeeAmount | money) : 'Off' }}</dd></div>
            <div><dt>Grace period</dt><dd>{{ detail.gracePeriodDays | unit: 'days' }}</dd></div>
          </dl>
        </app-section-card>

        <app-section-card id="buildings" title="Buildings">
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
            <app-loading-state label="Loading buildings…" />
          } @else if (buildingsError()) {
            <app-error-state [message]="buildingsError()!" (retry)="loadBuildings()" />
          } @else if (buildings().length === 0) {
            @if (context.can('BUILDING_CREATE')) {
              <app-empty-state title="No buildings yet" description="Add a building to start managing rooms."
                               actionLabel="Create a building" [actionLink]="RoutePaths.buildingCreate" />
            } @else {
              <app-empty-state title="No buildings yet" description="Add a building to start managing rooms." />
            }
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead>
                  <tr><th>Building</th><th>Location</th><th>Floors</th><th>Rooms</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (building of buildings(); track building.id) {
                    <tr [appRowLink]="RoutePaths.buildingDetail(detail.id, building.id)">
                      <td class="card-title">
                        <a class="record-link__primary" [routerLink]="RoutePaths.buildingDetail(detail.id, building.id)">
                          {{ building.name }} <span class="chevron" aria-hidden="true">›</span>
                        </a>
                      </td>
                      <td class="location card-skip">{{ buildingLocation(building) !== '-' ? buildingLocation(building) : 'No address yet' }}</td>
                      <td class="card-skip">{{ building.floorCount ?? 0 }}</td>
                      <td class="card-skip">{{ building.totalRoomCount ?? 0 }}</td>
                      <td>@if (building.status !== 'ACTIVE') { <app-status-chip [status]="building.status" /> }</td>
                      <td class="card-only muted">
                        {{ buildingLocation(building) !== '-' ? buildingLocation(building) + ' · ' : 'No address yet · ' }}{{ building.floorCount ?? 0 }} floors · {{ building.totalRoomCount ?? 0 }} rooms
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <!-- Charged in every building each month; a building or room with its own of the same name overrides it.
             Right after Buildings: what tenants are billed is read far more often than who administers the agency or the contract values. -->
        <app-permission-gate [permissions]="['RENT_ARREAR_READ']">
          <div id="charges"><app-utility-charges [agencyId]="detail.id" /></div>
        </app-permission-gate>

        <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_READ]">
          <app-section-card id="admins" title="Administrators">
            <ng-container actions>
              <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_ADD]">
                <button type="button" class="btn btn-primary btn-sm" (click)="openAdminSheet(null)">Add administrator</button>
              </app-permission-gate>
            </ng-container>

            <!-- The list first; adding or changing someone happens in a sheet. -->
            @if (adminsLoading()) {
              <app-loading-state label="Loading administrators…" />
            } @else if (adminsError()) {
              <app-error-state [message]="adminsError()!" (retry)="loadAdmins()" />
            } @else if (admins().length === 0) {
              <app-empty-state title="No administrators" description="Add an administrator to delegate management." />
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead>
                    <tr><th>Administrator</th><th>Access</th><th>Status</th><th class="actions-col"><span class="visually-hidden">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    @for (admin of admins(); track admin.id) {
                      <tr>
                        <td class="card-title">
                          <div class="cell-stack">
                            <span>{{ adminName(admin) }} @if (isSelf(admin)) { <span class="status-chip status-chip--info">You</span> }</span>
                            <span class="muted">{{ admin.user?.email || '-' }}</span>
                          </div>
                        </td>
                        <td>{{ accessLine(admin) }}</td>
                        <td>
                          <span class="status-chip" [ngClass]="admin.isEnabled ? 'status-chip--success' : 'status-chip--neutral'">
                            {{ admin.isEnabled ? 'Enabled' : 'Disabled' }}
                          </span>
                        </td>
                        <td class="actions-col">
                          @if (!isSelf(admin)) {
                            <div class="button-row">
                              <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_UPDATE]">
                                <button type="button" class="btn btn-secondary btn-sm" (click)="openAdminSheet(admin)">Edit</button>
                              </app-permission-gate>
                              <app-permission-gate [permissions]="[Permissions.AGENCY_ADMIN_REMOVE]">
                                <button type="button" class="btn btn-text btn-sm btn-danger-outline" [disabled]="removingAdminUserId() === admin.user?.id"
                                        (click)="removeAdmin(admin)">Remove</button>
                              </app-permission-gate>
                            </div>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          @if (adminSheetOpen()) {
            <app-dialog [title]="editingAdmin() ? 'Edit ' + adminName(editingAdmin()!) : 'Add administrator'" (closed)="closeAdminSheet()">
              <form id="admin-form" class="stack" [formGroup]="adminForm" appFormFeedback (ngSubmit)="saveAdmin()">
                @if (!editingAdmin()) {
                  <div class="grid-auto">
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
                        >{{ lookingUpAdmin() ? 'Finding…' : 'Find' }}</button>
                      </div>

                      @if (adminUidError(); as message) {
                        <small class="error-text">{{ message }}</small>
                      }

                    </label>
                  }
                  </div>
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
                  <app-field-error [control]="adminForm.controls.roleId" label="Role" />
                  <app-permission-gate [permissions]="[Permissions.ROLE_READ]">
                    <a class="text-link small" [routerLink]="RoutePaths.roles" target="_blank" rel="noopener">View roles and their permissions</a>
                  </app-permission-gate>
                </label>
                <!-- No default: agency-wide is the widest access, so it is a choice, never a preset. -->
                <fieldset class="field scope">
                  <legend>Scope <span class="req" aria-hidden="true">*</span></legend>
                  <div class="segmented" role="radiogroup">
                    <label><input type="radio" formControlName="scope" value="BUILDING_LEVEL"> Selected buildings</label>
                    <label><input type="radio" formControlName="scope" value="AGENCY_WIDE"> Whole agency</label>
                  </div>
                  @if (adminForm.controls.scope.invalid && adminForm.controls.scope.touched) {
                    <small class="error-text" role="alert">Choose a scope.</small>
                  }
                </fieldset>
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

                @if (editingAdmin()) {
                  <label class="switch-row">
                    <span>Enabled</span>
                    <input type="checkbox" role="switch" class="switch" [checked]="adminEnabled()" (change)="adminEnabled.set($any($event.target).checked)">
                  </label>
                }
                @if (adminError(); as apiError) {
                  <app-error-card
                    [title]="apiError.status === 409 ? 'Already an administrator' : 'Not saved'"
                    [message]="apiError.message"
                    [details]="apiError.details"
                  />
                }
              </form>
              <div dialog-actions>
                <button type="submit" form="admin-form" class="btn btn-primary" [disabled]="addingAdmin()">
                  {{ addingAdmin() ? 'Saving…' : editingAdmin() ? 'Save changes' : 'Add administrator' }}
                </button>
              </div>
            </app-dialog>
          }
        </app-permission-gate>

        <!--
          The values every lease this agency issues states — landlord, where
          rent is paid, house rules. Recorded once here rather than typed into
          each contract.
        -->
        <!-- Where rent is paid by M-Pesa, and whether Unitwise hears of it: the agency's own Daraja app. -->
        <app-permission-gate [permissions]="[Permissions.PAYMENT_SETTINGS_MANAGE]">
          <div id="mpesa"><app-mpesa-collection [agencyId]="detail.id" /></div>
        </app-permission-gate>

        <!-- Side by side on a wide screen; one column on a narrow one (styles.scss .card-pair). -->
        <div class="card-pair">
        <app-contract-settings id="contract" [agencyId]="detail.id" [templateLink]="canManageTemplate() ? RoutePaths.agencyContractTemplate(detail.id) : null" />

        <!-- Last: addresses are set once and rarely read, unlike buildings and administrators. -->
        <app-section-card id="addresses" title="Addresses">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
              @if (!addingAddress()) {
                <button type="button" class="btn btn-secondary btn-sm" (click)="startAddress()">Add address</button>
              }
            </app-permission-gate>
          </ng-container>

          @if ((detail.agencyAddresses ?? []).length === 0 && !addingAddress()) {
            <!-- The way in sits in the empty space, where the eye already is. -->
            @if (context.can(Permissions.AGENCY_UPDATE)) {
              <app-empty-state title="No address on file"
                               description="Where tenants and the lease find this agency — its office or postal address."
                               actionLabel="Add address" (action)="startAddress()" />
            } @else {
              <p class="muted">No address on file for this agency yet.</p>
            }
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
                    {{ savingAddress() ? 'Saving…' : 'Save address' }}
                  </button>
                  <button type="button" class="btn btn-secondary" (click)="cancelAddress()">Cancel</button>
                </div>
              </form>
            }
          </app-permission-gate>
        </app-section-card>
        </div>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <!--
          For an operator with one agency this page stands in for the list, and
          the list is where create lives (§28.10) — so it is offered, but at the
          foot, because setting up a second agency is rare.
        -->
        <!--
          RESTORE NOTE (agency admins creating agencies): hidden from AGENCY_ADMIN accounts
          for now — only a platform admin (AGENCY_CREATE_FOR_OTHERS) creates agencies, choosing
          the landlord as owner. To give agency admins "New agency" back, gate this on
          Permissions.AGENCY_CREATE again (the backend still allows it).
        <app-permission-gate [permissions]="[Permissions.AGENCY_CREATE]">
          <section class="panel another">
            <span class="muted">Another agency</span>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.agencyCreate">New agency</a>
          </section>
        </app-permission-gate>
        -->
        <app-permission-gate [permissions]="[Permissions.AGENCY_CREATE_FOR_OTHERS]">
          <section class="panel another">
            <span class="muted">Another agency for a landlord</span>
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
    .jump { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    #rent-terms, #buildings, #charges, #admins, #mpesa, #contract, #addresses { scroll-margin-top: 4.5rem; }
    .chevron { color: var(--text-muted); }
    /* Scope reads as an ordinary labelled field, not a framed box. */
    fieldset.scope { border: 0; margin: 0; padding: 0; min-width: 0; }
    fieldset.scope legend { padding: 0; margin-bottom: var(--space-1-5); font-weight: var(--weight-semibold); }
    fieldset.scope .req { color: var(--danger); }
    fieldset.scope .segmented { display: inline-flex; flex-wrap: wrap; }
    fieldset.scope .segmented label { display: inline-flex; align-items: center; gap: var(--space-1-5); min-height: 2.75rem; padding: 0 var(--space-3); cursor: pointer; }
    .actions-col .button-row { flex-wrap: nowrap; justify-content: flex-end; }
    td.location { font-size: var(--text-md); color: var(--text-muted); }
    /* The one nested frame on the page: a form being filled in, apart from the list it adds to. */
    .admin-add {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }
    .admin-add__title, .admin-list__title { margin: 0; font-weight: var(--weight-bold); }
    .admin-list__title { margin-top: var(--space-2); }
    .icon-row { display: flex; align-items: center; gap: var(--space-1-5); }

    .another {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
      padding: var(--space-3) var(--space-5);
    }

    /* The person about to be granted access, at the weight that deserves. */
    .found {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-1) var(--space-3);
      align-items: center;
      margin: var(--space-3) 0;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }

    .found__mark {
      display: inline-grid;
      place-items: center;
      width: 2.6rem;
      height: 2.6rem;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--primary-ring);
      color: var(--primary-strong);
      font-weight: var(--weight-bold);
    }

    .found__body { display: grid; gap: var(--space-0-5); min-width: 0; }
    .found__name { margin: 0; font-size: var(--text-base); font-weight: var(--weight-bold); }
    .found__body p { margin: 0; }
    .found__note { grid-column: 1 / -1; margin: 0; font-size: var(--text-sm); }

    @media (max-width: 560px) {
      .found { grid-template-columns: 1fr; justify-items: start; }
    }

    .address-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }

    .address-list__row {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2-5) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
    }

    form {
      display: grid;
      gap: var(--space-5);
    }

    .actions-col {
      white-space: nowrap;
    }

    .building-select {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: var(--space-3) var(--space-4);
      margin: 0;
    }

    legend { padding: 0 var(--space-1-5); font-size: var(--font-section-label); font-weight: var(--weight-semibold); color: var(--text); }

    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
      gap: var(--space-1-5) var(--space-4);
    }

    details p {
      margin: var(--space-2) 0 0;
      white-space: pre-wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyDetailPageComponent implements OnInit {
  readonly dueDay = dueDayLabel;
  /** Below this many records a table is chrome without a question (§28.7). */

  private readonly confirm = inject(ConfirmService);
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly context = inject(ActiveContextService);

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
  readonly switchingMode = signal(false);
  private readonly ownersApi = inject(OwnersService);

  /** The platform's switch between an agency owning its buildings and managing them for owners. */
  async switchMode(detail: AgencyDetail): Promise<void> {
    const forOwners = detail.managementMode !== 'FOR_OWNERS';
    if (!await this.confirm.ask({
      title: forOwners ? `Let ${detail.name} manage buildings for owners?` : `Make ${detail.name} the owner of its buildings?`,
      message: forOwners
        ? 'Its admins can then add owners, link buildings to them, charge commission and send monthly owner statements.'
        : 'Owners, statements and payouts are hidden but kept, and come back if it is switched again.',
      confirmLabel: 'Switch'
    })) {
      return;
    }
    this.switchingMode.set(true);
    try {
      await firstValueFrom(this.ownersApi.changeManagementMode(detail.id, forOwners ? 'FOR_OWNERS' : 'OWN_BUILDINGS'));
      this.agency.set({ ...detail, managementMode: forOwners ? 'FOR_OWNERS' : 'OWN_BUILDINGS' });
      this.notifications.push('success', forOwners ? 'Now managing buildings for owners.' : 'Now owns its buildings.');
    } catch (error) {
      this.notifications.push('error', toApiError(error).message);
    } finally {
      this.switchingMode.set(false);
    }
  }

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
    scope: [null as 'AGENCY_WIDE' | 'BUILDING_LEVEL' | null, [Validators.required]]
  });

  private readonly notifications = inject(NotificationService);
  private readonly pageTitles = inject(PageTitleService);
  /** Only sections this person can see: M-Pesa is for whoever manages payment settings. */
  get jumpTargets(): { id: string; label: string }[] {
    return [
      { id: 'rent-terms', label: 'Rent terms' }, { id: 'buildings', label: 'Buildings' }, { id: 'charges', label: 'Charges' },
      { id: 'admins', label: 'Administrators' }, { id: 'mpesa', label: 'M-Pesa' }, { id: 'contract', label: 'Contract' }, { id: 'addresses', label: 'Addresses' }
    ].filter((target) => target.id !== 'mpesa' || this.context.can(this.Permissions.PAYMENT_SETTINGS_MANAGE));
  }

  jump(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  readonly adminSheetOpen = signal(false);
  readonly editingAdmin = signal<AgencyAdmin | null>(null);
  readonly adminEnabled = signal(true);

  openAdminSheet(admin: AgencyAdmin | null): void {
    this.adminError.set(null);
    this.editingAdmin.set(admin);
    this.adminEnabled.set(admin?.isEnabled ?? true);
    this.adminForm.reset({
      userId: null,
      roleId: admin?.role?.id ?? null,
      scope: (admin?.scope as 'AGENCY_WIDE' | 'BUILDING_LEVEL' | undefined) ?? null
    });
    this.selectedBuildingIds.set(new Set((admin?.assignedBuildings ?? []).map((building) => building.id)));
    if (!admin) {
      this.adminIdentity.set(null);
    }
    this.adminSheetOpen.set(true);
  }

  closeAdminSheet(): void {
    this.adminSheetOpen.set(false);
    this.editingAdmin.set(null);
  }

  /** "Caretaker · Acacia Court" or "Agency admin · Whole agency". */
  accessLine(admin: AgencyAdmin): string {
    const role = humanizeLabel(admin.role?.name ?? '', admin.role?.name ?? '-');
    const where = admin.scope === 'BUILDING_LEVEL' ? this.assignedBuildingNames(admin) : 'Whole agency';
    return `${role} · ${where}`;
  }

  saveAdmin(): Promise<void> {
    return this.editingAdmin() ? this.updateAdmin(this.editingAdmin()!) : this.addAdmin();
  }

  private async updateAdmin(admin: AgencyAdmin): Promise<void> {
    if (!this.scopeIsComplete()) {
      return;
    }
    const value = this.adminForm.getRawValue();
    this.addingAdmin.set(true);
    this.adminError.set(null);
    try {
      await firstValueFrom(this.housing.updateAgencyAdmin(Number(this.id()), admin.user!.id!, {
        roleId: value.roleId,
        scope: value.scope,
        buildingIds: value.scope === 'BUILDING_LEVEL' ? [...this.selectedBuildingIds()] : [],
        enabled: this.adminEnabled()
      }));
      this.closeAdminSheet();
      this.notifications.push('success', 'Administrator updated.');
      await this.loadAdmins();
    } catch (error) {
      this.adminError.set(toApiError(error));
    } finally {
      this.addingAdmin.set(false);
    }
  }

  /** Building level means at least one building: an empty list would grant nothing, silently. */
  private scopeIsComplete(): boolean {
    if (this.adminForm.invalid) {
      this.adminForm.markAllAsTouched();
      return false;
    }
    if (this.adminForm.controls.scope.value === 'BUILDING_LEVEL' && this.selectedBuildingIds().size === 0) {
      this.adminError.set({ status: 0, errorCode: 'VALIDATION_ERROR', message: 'Choose at least one building.', details: [] });
      return false;
    }
    return true;
  }

  readonly addingAddress = signal(false);
  readonly savingAddress = signal(false);

  readonly addressForm = this.formBuilder.group({
    ...ADDRESS_FIELD_CONTROLS,
    ...TYPED_PLACE_CONTROLS,
    postalCode: '',
    description: ''
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
      const agency = await firstValueFrom(this.housing.getAgency(Number(this.id())));
      this.agency.set(agency);
      // The app bar names the agency, not "Agency detail".
      this.pageTitles.set(agency.name);
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

    if (!identified) {
      this.adminForm.markAllAsTouched();
      this.adminUidError.set('Find the person by their Unitwise ID first.');
      return;
    }
    if (!this.scopeIsComplete()) {
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

      this.adminForm.reset({ userId: null, roleId: null, scope: null });
      this.selectedBuildingIds.set(new Set());
      this.closeAdminSheet();
      this.notifications.push('success', 'Administrator added.');
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

  /** Where a building is, finest first — the same parts the Buildings page shows. */
  buildingLocation(building: { address?: { town?: string | null; ward?: string | null; county?: string | null } | null }): string {
    const address = building.address;
    return [address?.town, address?.ward, address?.county].filter((part) => !!part && part.trim()).join(' · ') || '-';
  }

  startAddress(): void {
    this.addressForm.reset({ ...EMPTY_ADDRESS_FIELDS, estateName: '', streetName: '', postalCode: '', description: '' });
    this.addressError.set(null);
    this.addingAddress.set(true);
  }

  cancelAddress(): void {
    this.addingAddress.set(false);
    this.addressError.set(null);
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
        subCountyId: value.subCountyId,
        wardId: value.wardId,
        townId: value.townId,
        estateAreaId: value.estateAreaId,
        streetRoadId: value.streetRoadId,
        estateName: value.estateAreaId ? null : value.estateName.trim() || null,
        streetName: value.streetRoadId ? null : value.streetName.trim() || null,
        buildingHouse: value.buildingHouse.trim() || null,
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
      title: `Delete the agency "${agency.name}"?`,
      message: 'An agency can only be deleted once it has no buildings.',
      confirmLabel: 'Delete agency',
      destructive: true,
      typeToConfirm: agency.name
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
