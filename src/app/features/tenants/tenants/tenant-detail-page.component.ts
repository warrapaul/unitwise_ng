import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FileUploadComponent, FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants, PermissionSets } from '../../../core/rbac/permission.constants';
import { ContractsService } from '../../contracts/contracts.service';
import { ContractReadiness } from '../../contracts/models/contract.models';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { RoomLinkComponent } from '../../../shared/components/room-link/room-link.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { TenantsService } from '../tenants.service';
import { ProfileGrantsService } from '../profile-grants/profile-grants.service';
import { SharedDocument } from '../models/profile-grant.models';
import { HousingService } from '../../housing/housing.service';
import { RoomDetail, RoomEffectiveTerms, RoomTermSource } from '../../housing/models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import {
  DocumentType,
  LeaseTermsRequest,
  MoveInRequest,
  LeaseType,
  TENANT_DOCUMENT_MAX_MB,
  TENANT_DOCUMENT_TYPES,
  TenantDocumentPreview,
  TenantFullDetail,
  VerificationSnapshotDetail,
  VerifyAndAssignRequest
} from '../models/tenant.models';
import { HumanLabelPipe, humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { FileListComponent, FileListItem } from '../../../shared/components/files/file-list/file-list.component';
import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { TenantDepositsComponent } from '../../rent/components/tenant-deposits.component';
import { InitialPaymentsComponent, initialPaymentsGroup, toInitialPayments } from '../../rent/components/initial-payments.component';
import { RentService } from '../../rent/rent.service';
import { RecordPaymentDialogComponent } from '../../rent/components/record-payment-dialog.component';
import { toMonthPath } from '../../rent/models/rent.models';
import { thisMonthIso, todayIso } from '../../../shared/utils/date.util';
import { ChatService } from '../../chat/chat.service';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmService } from '../../../shared/services/confirm.service';

/** A complaint this page raises itself, shaped like the ones the API returns. */
function localError(message: string): ApiError {
  return { status: 0, errorCode: 'CLIENT_VALIDATION', message, details: [] };
}

const DOCUMENT_TYPES: readonly { value: DocumentType; label: string }[] = [
  { value: 'NATIONAL_ID_FRONT', label: 'National ID (front)' },
  { value: 'NATIONAL_ID_BACK', label: 'National ID (back)' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'PROOF_OF_EMPLOYMENT', label: 'Proof of employment' },
  { value: 'UTILITY_BILL', label: 'Utility bill' },
  { value: 'BANK_STATEMENT', label: 'Bank statement' },
  { value: 'REFERENCE_LETTER', label: 'Reference letter' },
  { value: 'OTHER', label: 'Other' }
];

@Component({
  selector: 'app-tenant-detail-page',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    DangerZoneComponent,
    PluralPipe,
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    ContextGuardComponent,
    RowLinkDirective,
    FieldErrorComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    FileUploadComponent,
    FileListComponent,
    TenantDepositsComponent,
    InitialPaymentsComponent,
    RecordPaymentDialogComponent,
    RoomLinkComponent,
    HumanLabelPipe,
    RoomPickerComponent,
    DetailGroupComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.tenants" label="Back" [title]="tenant() ? fullName(tenant()!) : null" />
      <app-context-guard [agencyId]="agencyId()" [buildingId]="buildingId()" requirePermission="TENANT_READ" [allowOwner]="isOwnRecord()">
      @if (loading()) {
        <app-loading-state label="Loading tenant..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (tenant(); as detail) {
        <!--
          A tenancy nobody has acknowledged is not the same as one sitting in
          the landlord's review queue, and it is the landlord's worklist that
          gets it wrong when the two look alike. So this says plainly whose turn
          it is, and offers the way out for the cases acceptance cannot cover.
        -->
        @if (detail.status === 'AWAITING_TENANT_ACCEPTANCE') {
          <section class="panel awaiting">
            <div class="awaiting__copy">
              <h2 class="heading-sm">Waiting on the tenant</h2>
              <p class="muted">
                {{ fullName(detail) }} has been asked to accept this tenancy. Until they do, it is
                not in your verification queue — there is nothing for you to review yet.
              </p>
            </div>

            <app-permission-gate [permissions]="[Permissions.TENANT_WRITE_ALL, Permissions.TENANT_WRITE]">
              @if (!proceeding()) {
                <button type="button" class="btn btn-secondary" (click)="startProceed()">
                  Proceed without their acceptance
                </button>
              }
            </app-permission-gate>

            @if (proceeding()) {
              <form class="awaiting__form stack" [formGroup]="proceedForm" appFormFeedback (ngSubmit)="proceedUnaccepted()">
                <p class="muted">
                  This switches the tenancy to fully managed and moves it into your queue. You will
                  need to collect and upload their documents yourself — it does not give you access
                  to the ones they hold, which still needs their permission.
                </p>

                <!--
                  The identity has to be typed in here because the tenancy has
                  none: it was created from a uid alone, and nobody has
                  consented to fill it in. This is the one path where a
                  landlord states somebody's details on their behalf, which is
                  why it is recorded as fully managed.
                -->
                <div class="grid-auto">
                  <label class="field">
                    <span>First name</span>
                    <input formControlName="firstName">
                    <app-field-error [control]="proceedForm.controls.firstName" label="First name" />
                  </label>
                  <label class="field">
                    <span>Middle name</span>
                    <input formControlName="middleName">
                  </label>
                  <label class="field">
                    <span>Last name</span>
                    <input formControlName="lastName">
                    <app-field-error [control]="proceedForm.controls.lastName" label="Last name" />
                  </label>
                  <label class="field">
                    <span>National ID</span>
                    <input formControlName="nationalIdNumber">
                    <app-field-error [control]="proceedForm.controls.nationalIdNumber" label="National ID" />
                  </label>
                  <label class="field">
                    <span>Phone number</span>
                    <input formControlName="phoneNumber">
                  </label>
                  <label class="field">
                    <span>Email</span>
                    <input type="email" formControlName="email">
                  </label>
                </div>

                <label class="field field--wide">
                  <span>Why you are proceeding</span>
                  <textarea
                    formControlName="reason"
                    rows="2"
                    placeholder="Tenant has no smartphone; documents collected in person at the office."
                  ></textarea>
                  <app-field-error [control]="proceedForm.controls.reason" label="Reason" />
                  <small class="hint">Recorded against the tenancy with your name and the date.</small>
                </label>

                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="savingProceed()">
                    {{ savingProceed() ? 'Saving...' : 'Proceed' }}
                  </button>
                  <button type="button" class="btn btn-secondary" (click)="cancelProceed()">Cancel</button>
                </div>
              </form>
            }
          </section>
        }

        <app-section-card [title]="fullName(detail)" [subtitle]="detail.buildingName || null">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
                <button type="button" class="btn btn-secondary" (click)="recordingPayment.set(true)">Record payment</button>
              </app-permission-gate>
              <!-- Only someone with an account can read a message. -->
              @if (detail.userId) {
                <app-permission-gate [permissions]="['TENANT_MESSAGE_CREATE']">
                  <button type="button" class="btn btn-secondary" [disabled]="chatLauncher.opening()" (click)="messageTenant()">Message</button>
                </app-permission-gate>
              }
              <app-permission-gate [permissions]="[Permissions.TENANT_WRITE_ALL, Permissions.TENANT_WRITE]">
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">
                  {{ editing() ? 'Close editor' : 'Edit tenant' }}
                </button>
              </app-permission-gate>
            </div>
          </ng-container>

          <!--
            One card, two states. Showing the record and its editor at once made
            the operator read the same values twice and left it ambiguous which
            set was live. Editing replaces the view; the header, title and
            actions stay put so the page never appears to navigate.
          -->
          @if (!editing()) {
          <div class="detail-groups">
            <app-detail-group label="Tenancy">
              <div class="lead">
                <dt>Status</dt>
                <dd><app-status-chip [status]="detail.status" /></dd>
              </div>
              <div class="lead">
                <dt>Room</dt>
                <dd>
                  <app-room-link
                    [agencyId]="detail.agencyId ?? agencyId()"
                    [buildingId]="detail.buildingId ?? buildingId()"
                    [roomId]="detail.roomId ?? detail.intendedRoomId ?? null"
                    [roomNumber]="detail.roomId ? detail.roomNumber : detail.intendedRoomNumber"
                    [roomName]="detail.roomId ? detail.roomName : detail.intendedRoomName"
                    [intended]="!detail.roomId && !!detail.intendedRoomId"
                  />
                </dd>
              </div>
              <!--
                Only worth its own row once the two differ — while the tenant is
                unassigned the intended room IS the Room row, and repeating it
                below as a bare id was the confusing part.
              -->
              @if (detail.roomId && detail.intendedRoomId && detail.roomId !== detail.intendedRoomId) {
                <div>
                  <dt>Intended room</dt>
                  <dd>
                    <app-room-link
                      [agencyId]="detail.agencyId ?? agencyId()"
                      [buildingId]="detail.buildingId ?? buildingId()"
                      [roomId]="detail.intendedRoomId"
                      [roomNumber]="detail.intendedRoomNumber"
                      [roomName]="detail.intendedRoomName"
                      [intended]="true"
                    />
                  </dd>
                </div>
              }
              <div><dt>Move in</dt><dd>{{ formatDate(detail.moveInDate) }}</dd></div>
              <div><dt>Move out</dt><dd>{{ formatDate(detail.moveOutDate) }}</dd></div>
              <div><dt>Notice given</dt><dd>{{ formatDate(detail.noticeGivenDate) }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Contact">
              <div><dt>Phone</dt><dd class="mono">{{ detail.phoneNumber || '-' }}</dd></div>
              <div><dt>Email</dt><dd>{{ detail.email || '-' }}</dd></div>
              <div><dt>Emergency contact</dt><dd>{{ detail.emergencyContactName || '-' }}</dd></div>
              <div><dt>Emergency phone</dt><dd class="mono">{{ detail.emergencyContactPhone || '-' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Identity">
              <div><dt>Type</dt><dd>{{ detail.tenantType | humanLabel }}</dd></div>
              <div><dt>National ID</dt><dd class="mono">{{ detail.nationalIdNumber || '-' }}</dd></div>
              <!-- The person's own identifier: shown to them and to super admins, not to agencies. -->
              @if (context.isSuperAdmin()) {
                <div><dt>Unitwise ID</dt><dd class="mono">{{ detail.userUid || '-' }}</dd></div>
              }
            </app-detail-group>

            <!--
              How the record came to exist and who signed it off. Real, but never
              the reason anyone opened the page — so it goes last, not beside the
              tenant's room.
            -->
            <app-detail-group label="Record">
              <!-- How the account came to be: platform housekeeping, not the agency's concern. -->
              @if (context.isSuperAdmin()) {
                <div><dt>Creation mode</dt><dd>{{ detail.creationMode | humanLabel }}</dd></div>
                <div><dt>Claim status</dt><dd>{{ detail.claimStatus | humanLabel }}</dd></div>
              }
              <div><dt>Verified by</dt><dd>{{ detail.verifiedByLandlordName || '-' }}</dd></div>
              @if (currentSnapshot(); as snapshot) {
                <div>
                  <dt>Verified</dt>
                  <dd class="verified-row">
                    <span>{{ formatDate(snapshot.snapshotDate) }}@if (snapshot.roomName || snapshot.roomNumber) { · {{ snapshot.roomName || 'Room ' + snapshot.roomNumber }} }</span>
                    <a class="btn btn-secondary btn-sm"
                       [routerLink]="RoutePaths.verificationSnapshotDetail(detail.agencyId ?? agencyId(), detail.buildingId ?? buildingId(), detail.id, snapshot.id)">
                      View verified record
                    </a>
                  </dd>
                </div>
              }
            </app-detail-group>
          </div>

          @if (detail.notes) {
            <p class="muted">{{ detail.notes }}</p>
          }
          } @else {
            <form [formGroup]="form" appFormFeedback (ngSubmit)="save()">
              <div class="grid-auto">
                <label class="field">
                  <span>First name</span>
                  <input formControlName="firstName">
                  @if (form.controls.firstName.invalid && form.controls.firstName.touched) {
                    <small class="error-text">First name is required.</small>
                  }
                </label>
                <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
                <label class="field">
                  <span>Last name</span>
                  <input formControlName="lastName">
                  @if (form.controls.lastName.invalid && form.controls.lastName.touched) {
                    <small class="error-text">Last name is required.</small>
                  }
                </label>
                <label class="field">
                  <span>Email</span>
                  <input type="email" formControlName="email">
                  @if (form.controls.email.invalid && form.controls.email.touched) {
                    <small class="error-text">Enter a valid email address.</small>
                  }
                </label>
                <label class="field"><span>Phone</span><input formControlName="phoneNumber"></label>
                <label class="field"><span>National ID</span><input formControlName="nationalIdNumber"></label>
                <label class="field"><span>Contact person</span><input formControlName="contactPerson"></label>
                <label class="field">
                  <span>Type</span>
                  <select formControlName="tenantType">
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="CORPORATE">Corporate</option>
                    <option value="FAMILY">Family</option>
                    <option value="STUDENT">Student</option>
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <!--
                    AWAITING_TENANT_ACCEPTANCE is absent on purpose: it is the
                    tenant's own state to leave, and the backend's transition
                    map has no route back into it. Offering it would be an
                    option that always fails.
                  -->
                  <select formControlName="status">
                    <option value="PENDING">Pending my review</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="NOTICE_GIVEN">Notice given</option>
                    <option value="TERMINATED">Terminated</option>
                    <option value="EVICTED">Evicted</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </label>
                <!-- Picked by name, never typed as an id (§28). -->
                <label class="field">
                  <span>Room</span>
                  <app-room-picker
                    formControlName="roomId"
                    [agencyId]="detail.agencyId ?? agencyId()"
                    [buildingId]="detail.buildingId ?? buildingId()"
                  />
                </label>
                <label class="field"><span>Move in date</span><input type="date" formControlName="moveInDate"></label>
                <label class="field"><span>Move out date</span><input type="date" formControlName="moveOutDate"></label>
                <label class="field"><span>Notice given date</span><input type="date" formControlName="noticeGivenDate"></label>
                <label class="field"><span>Emergency contact</span><input formControlName="emergencyContactName"></label>
                <label class="field"><span>Emergency phone</span><input formControlName="emergencyContactPhone"></label>
                <label class="field"><span>Relationship</span><input formControlName="emergencyContactRelationship"></label>
              </div>

              <label class="field field--wide">
                <span>Notes</span>
                <textarea formControlName="notes" rows="3"></textarea>
              </label>

              @if (saveError(); as apiError) {
                <app-error-card title="Unable to save tenant" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : 'Save tenant' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">Cancel</button>
              </div>
            </form>
          }
        </app-section-card>

        <app-section-card title="Documents">
          <ng-container actions>
            <span class="muted">{{ documentList().length | plural: 'document' }}</span>
            @if (canAskForDocuments(detail)) {
              <app-permission-gate [permissions]="[Permissions.TENANT_DOCUMENT_READ]">
                <button type="button" class="btn btn-secondary btn-sm" (click)="startDocumentRequest()">
                  Ask for their documents
                </button>
              </app-permission-gate>
            }
          </ng-container>

          <!--
            Asking is all an agency can do. The person chooses which documents
            and for how long, and can stop at any time — a uid or a tenancy is
            never on its own enough to reach somebody's national ID.
          -->
          @if (requestingDocuments()) {
            <form class="stack document-request" [formGroup]="documentRequestForm" appFormFeedback (ngSubmit)="requestDocuments()">
              <p class="muted">
                {{ fullName(detail) }} is asked to share. Nothing reaches you until they approve,
                and they see how often you open what they send.
              </p>

              <label class="field field--wide">
                <span>Why you need them</span>
                <input
                  formControlName="purpose"
                  [placeholder]="'Verification for ' + (detail.buildingName || 'this tenancy')"
                >
                <small class="hint">Shown to them before they decide.</small>
              </label>

              @if (documentRequestError(); as apiError) {
                <app-error-card
                  title="Unable to send the request"
                  [message]="apiError.message"
                  [details]="apiError.details"
                />
              }

              @if (documentRequestSent()) {
                <p class="muted">Request sent. It is now theirs to answer.</p>
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="sendingDocumentRequest()">
                  {{ sendingDocumentRequest() ? 'Sending...' : 'Send request' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="cancelDocumentRequest()">Close</button>
              </div>
            </form>
          }

          <!--
            One list: what the tenant shared from their own library first, then
            anything this agency filed. Each can be previewed in place; a filed
            one can be replaced, which files a new version and keeps the old as
            history. Uploading what is still missing comes last.
          -->
          <!-- The tenant's own copy is theirs to replace; the agency replaces only what it filed. -->
          <app-file-list [items]="documentItems()" [replace]="replaceDocument"
                         [replaceTypes]="documentTypes" [replaceMaxSizeMb]="maxDocumentMb"
                         [emptyLabel]="awaitingShare() ? 'Waiting for them to share their documents.' : 'No documents yet.'" />

          @if (replaceError(); as apiError) {
            <app-error-card title="Unable to replace the document" [message]="apiError.message" [details]="apiError.details" />
          }

          <app-permission-gate [permissions]="PermissionSets.TENANT_DOCUMENT_WRITE">
          <div class="stack doc-upload" [formGroup]="uploadForm">
            <app-file-upload [types]="documentTypes" [maxSizeMb]="maxDocumentMb"
                             uploadLabel="Upload document" [send]="uploadDocument">
              <label class="field">
                <span>Document type</span>
                <!-- Only what is still missing: a type already on file is replaced from its row. -->
                <select formControlName="documentType">
                  @for (option of missingDocumentTypes(); track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </label>
            </app-file-upload>

            @if (uploadError(); as apiError) {
              <app-error-card title="Upload failed" [message]="apiError.message" [details]="apiError.details" />
            }
          </div>
          </app-permission-gate>
        </app-section-card>

        <!--
          One card, placed by state: before the leases while the tenant still
          needs verifying, below them once verified — then it is rarely used.
        -->
        <ng-template #verifyCard>
        <app-permission-gate [permissions]="[Permissions.VERIFICATION_SNAPSHOT_CREATE]">
          <app-section-card [title]="currentSnapshot() ? 'Re-verify and reassign' : 'Verify and assign'">
            @if (!currentSnapshot()) {
              <ul class="hint points">
                <li>Approving saves a verified record of their details and documents.</li>
                <li>It reserves the room, and can create the lease in the same step.</li>
              </ul>
            }

            <!--
              Already verified: rarely needed again — only after the room or the
              tenant's details change — so it stays closed until asked for.
            -->
            @if (currentSnapshot() && !reverifyOpen()) {
              <div class="reverify-closed">
                <span class="muted">Needed only if the room or their details change.</span>
                <button type="button" class="btn btn-secondary btn-sm" (click)="reverifyOpen.set(true)">Re-verify</button>
              </div>
            } @else {

            <!--
              The path for a tenant already living somewhere. Re-approving
              would have failed on an occupied room and, had it not, would have
              put the room back to RESERVED and the tenancy back to VERIFIED —
              taking a sitting tenant out of their own home on paper.
            -->
            @if (canRevise()) {
              <div class="panel revise">
                <p><strong>Correct a verified tenant</strong></p>
                <ul class="hint points">
                  <li>Change their details above first.</li>
                  <li>Revising saves a new verified record and keeps the room.</li>
                  <li>The contract is re-issued for them to sign again.</li>
                </ul>
                <div class="button-row">
                  <button type="button" class="btn btn-secondary" [disabled]="revising()" (click)="reviseVerification()">
                    {{ revising() ? 'Revising...' : 'Revise verification' }}
                  </button>
                </div>
              </div>
            }

            @if (supersededSnapshots().length > 0) {
              <details class="doc-select">
                <summary>{{ supersededSnapshots().length | plural: 'earlier verification' }}</summary>
                <ul class="muted">
                  @for (snapshot of supersededSnapshots(); track snapshot.id) {
                    <li>
                      <a
                        [routerLink]="RoutePaths.verificationSnapshotDetail(
                          detail.agencyId ?? agencyId(), detail.buildingId ?? buildingId(), detail.id, snapshot.id
                        )"
                      >#{{ snapshot.id }}</a>
                      — {{ formatDate(snapshot.snapshotDate) }}, {{ snapshot.verifiedByName || 'unknown verifier' }}
                    </li>
                  }
                </ul>
              </details>
            }

            <form [formGroup]="verifyForm" appFormFeedback (ngSubmit)="verify()">
              <!-- One row: the decision is short, and what it asks for next sits beside it. -->
              <div class="verify-row">
                <label class="field">
                  <span>Decision</span>
                  <select formControlName="approved">
                    <option [ngValue]="true">Approve</option>
                    <option [ngValue]="false">Reject</option>
                  </select>
                </label>

                @if (verifyForm.controls.approved.value) {
                  <label class="field">
                    <span>Assign room</span>
                    <app-room-picker
                      formControlName="roomId"
                      [agencyId]="detail.agencyId ?? agencyId()"
                      [buildingId]="detail.buildingId ?? buildingId()"
                    />
                    @if (intendedRoomBlocked(); as blocked) {
                      <small class="error-text">
                        {{ blocked }} — pick another room before approving.
                      </small>
                    } @else if (prefilledFromIntendedRoom()) {
                      <small class="hint">Prefilled with the room this tenant applied for.</small>
                    } @else {
                      <small class="hint">The backend requires a room to approve against.</small>
                    }
                  </label>
                } @else {
                  <label class="field">
                    <span>Rejection reason</span>
                    <input formControlName="rejectionReason">
                    @if (verifyForm.controls.rejectionReason.invalid && verifyForm.controls.rejectionReason.touched) {
                      <small class="error-text">A rejection reason is required.</small>
                    }
                  </label>
                }
              </div>

              <label class="field field--wide">
                <span>Verification notes</span>
                <textarea formControlName="verificationNotes" rows="2"></textarea>
              </label>

              @if (documentChoices().length > 0) {
                <!-- Ticked by default; exactly what is ticked is verified with, and none is allowed. -->
                <details class="doc-select doc-pick">
                  <summary>
                    @if (verifyForm.controls.approved.value && selectedDocumentIds().size === 0) {
                      No documents — approving on their details alone
                    } @else {
                      {{ selectedDocumentIds().size }} of {{ documentChoices().length }} documents
                      {{ verifyForm.controls.approved.value ? 'included' : 'to reject' }}
                    }
                  </summary>
                  <div class="checkbox-grid">
                    @for (document of documentChoices(); track document.id) {
                      <label class="checkbox-field">
                        <input
                          type="checkbox"
                          [checked]="selectedDocumentIds().has(document.id)"
                          (change)="toggleDocument(document.id)"
                        >
                        <span>{{ document.documentType | humanLabel }} — {{ document.fileName }}</span>
                      </label>
                    }
                  </div>
                </details>
              } @else if (verifyForm.controls.approved.value) {
                <p class="muted">No documents on file — approving on their details alone.</p>
              }

              <!--
                Only on a first verification. Once a snapshot exists the Leases
                card below issues leases from it, and offering the same thing
                here as well made two lease forms on one page.
              -->
              @if (verifyForm.controls.approved.value && offersLeaseWithVerification()) {
                <app-permission-gate [permissions]="PermissionSets.LEASE_WRITE">
                  <fieldset class="doc-select">
                    <legend>Contract</legend>
                    <!--
                      Dry run first. Readiness resolves the template against this
                      room, its building and the agency, so a contract that would
                      be refused is never offered — the operator sees what is
                      missing and where to record it instead.
                    -->
                    @if (readinessChecking()) {
                      <small class="hint">Checking whether a contract can be generated for this room…</small>
                    } @else if (leaseBlocked()) {
                      <div class="alert alert-warning">
                        <p><strong>A contract cannot be generated for this room yet.</strong> Missing:</p>
                        <ul class="missing">
                          @for (item of missingForLease(); track item.label) {
                            <li>{{ item.label }} <span class="muted">— {{ item.recordedOn || 'not recorded' }}</span></li>
                          }
                        </ul>
                        <a class="text-link" [routerLink]="RoutePaths.buildingDetail(detail.agencyId ?? agencyId(), detail.buildingId ?? buildingId())">
                          Record them on the building
                        </a>
                      </div>
                      <small class="hint">You can verify now and generate the contract later from the Leases card.</small>
                    } @else {
                      <label class="checkbox-field">
                        <input type="checkbox" formControlName="issueLease">
                        <span>Generate the contract with this verification</span>
                      </label>
                    }

                    @if (verifyForm.controls.issueLease.value && !leaseBlocked()) {
                      <!-- The same leaseForm the Leases card submits once a snapshot exists. -->
                      <div class="grid-auto" [formGroup]="leaseForm">
                        <label class="field">
                          <span>Start date</span>
                          <input type="date" formControlName="startDate">
                          <app-field-error [control]="leaseForm.controls.startDate" label="Start date" />
                        </label>
                        <label class="field">
                          <span>End date</span>
                          <input type="date" formControlName="endDate">
                        </label>
                        <label class="field">
                          <span>Lease type</span>
                          <select formControlName="leaseType">
                            <option value="FIXED_TERM">Fixed term</option>
                            <option value="MONTH_TO_MONTH">Month to month</option>
                            <option value="COMMERCIAL">Commercial</option>
                          </select>
                        </label>
                        <label class="field">
                          <span>Monthly rent</span>
                          <input type="number" step="0.01" min="0" formControlName="monthlyRent">
                        </label>
                        <label class="field">
                          <span>Security deposit</span>
                          <input type="number" step="0.01" min="0" formControlName="securityDeposit">
                        </label>
                        <label class="field">
                          <span>Payment due day</span>
                          <input type="number" min="1" max="31" formControlName="paymentDueDay">
                        </label>
                      </div>

                      @if (roomTermsLoading()) {
                        <small class="hint">Reading what this room is priced at…</small>
                      } @else if (unpricedRoom()) {
                        <small class="error-text">
                          No rent is set on this room, its building or the agency — enter one, or the
                          lease will be refused.
                        </small>
                      } @else if (termsNote(); as note) {
                        <small class="hint">{{ note }} Edit any of them to override for this tenancy.</small>
                      }

                      <label class="checkbox-field">
                        <input type="checkbox" formControlName="activateLease">
                        <span>Also activate the lease and record the move-in</span>
                      </label>
                      <small class="hint">If the lease can't be created, nothing is approved. Leave this unticked to let the tenant sign first.</small>
                    }
                  </fieldset>
                </app-permission-gate>
              }

              <!--
                Without a contract, moving in is its own step, and it is the one
                that starts billing — a verified tenant who never moves in is
                never charged rent.
              -->
              @if (verifyForm.controls.approved.value && offersLeaseWithVerification() && !issuingLease()) {
                <app-permission-gate [permissions]="PermissionSets.TENANT_CREATE">
                  <fieldset class="doc-select">
                    <legend>Move in</legend>
                    <label class="checkbox-field">
                      <input type="checkbox" formControlName="moveInNow">
                      <span>Move them in now, without a contract</span>
                    </label>

                    @if (verifyForm.controls.moveInNow.value) {
                      <div class="grid-auto" [formGroup]="moveInForm">
                        <label class="field">
                          <span>Move-in date</span>
                          <input type="date" formControlName="moveInDate">
                          <app-field-error [control]="moveInForm.controls.moveInDate" label="Move-in date" />
                        </label>
                        <label class="field">
                          <span>Agreed monthly rent</span>
                          <input type="number" step="0.01" min="0" formControlName="monthlyRent">
                        </label>
                        <label class="field">
                          <span>Security deposit taken</span>
                          <input type="number" step="0.01" min="0" formControlName="securityDeposit">
                        </label>
                      </div>
                      <small class="hint">Leave the rent blank to use the room's, its building's or the agency's. Rent is billed from the move-in date.</small>
                    }
                  </fieldset>
                </app-permission-gate>
              }

              <!--
                Money received as they start: recorded once the verification has
                gone through, against the tenancy it creates. Optional.
              -->
              @if (verifyForm.controls.approved.value) {
                <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
                  <fieldset class="doc-select">
                    <legend>Money received</legend>
                    <app-initial-payments [group]="startPayments" [rent]="agreedRent()" [deposit]="agreedDeposit()" />
                  </fieldset>
                </app-permission-gate>
              }

              @if (verifyError(); as apiError) {
                <app-error-card [title]="verifyErrorTitle()" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="verifying()">
                  {{ submitLabel() }}
                </button>
              </div>
            </form>
            }
          </app-section-card>
        </app-permission-gate>
        </ng-template>

        @if (!currentSnapshot()) {
          <ng-container [ngTemplateOutlet]="verifyCard" />
        }

        <!--
          Verified, room reserved, no contract, not moved in: nothing bills
          this tenant until someone records the move-in. A contract can still
          follow from the Leases card and will attach to this occupancy.
        -->
        @if (canMoveIn()) {
          <app-permission-gate [permissions]="PermissionSets.TENANT_CREATE">
            <app-section-card title="Move in">
              <p class="hint">No contract yet. Rent is billed from the move-in date; a contract can be generated later.</p>
              <form class="stack" [formGroup]="moveInForm" appFormFeedback (ngSubmit)="moveInWithoutLease()">
                <div class="grid-auto">
                  <label class="field">
                    <span>Move-in date</span>
                    <input type="date" formControlName="moveInDate">
                    <app-field-error [control]="moveInForm.controls.moveInDate" label="Move-in date" />
                  </label>
                  <label class="field">
                    <span>Agreed monthly rent</span>
                    <input type="number" step="0.01" min="0" formControlName="monthlyRent">
                    <small class="hint">Blank uses the room's, building's or agency's.</small>
                  </label>
                  <label class="field">
                    <span>Security deposit taken</span>
                    <input type="number" step="0.01" min="0" formControlName="securityDeposit">
                  </label>
                </div>

                @if (moveInError(); as apiError) {
                  <app-error-card title="Unable to move the tenant in" [message]="apiError.message" [details]="apiError.details" />
                }

                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="movingInNow()">
                    {{ movingInNow() ? 'Moving in...' : 'Move in' }}
                  </button>
                </div>
              </form>
            </app-section-card>
          </app-permission-gate>
        }

        <!--
          The leases, read as a list. Generating one is a deliberate act, so its
          form opens only on "New lease" rather than sitting open on every visit.
          A lease is changed on its own page (renewal, amendment), not edited here.
        -->
        <app-section-card title="Leases">
          <ng-container actions>
            <div class="icon-row">
              @if (currentSnapshot() && !newLeaseOpen()) {
                <app-permission-gate [permissions]="PermissionSets.LEASE_WRITE">
                  <button type="button" class="btn btn-sm"
                          [class.btn-primary]="(detail.leaseAgreements ?? []).length === 0"
                          [class.btn-secondary]="(detail.leaseAgreements ?? []).length > 0"
                          (click)="newLeaseOpen.set(true)">New lease</button>
                </app-permission-gate>
              }
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.leases" [queryParams]="{ tenantId: detail.id }">
                All leases
              </a>
            </div>
          </ng-container>

          <app-permission-gate [permissions]="PermissionSets.LEASE_WRITE">
            <!--
              A lease is written against the verification snapshot, so there is
              nothing to generate here until the tenant has been verified — the
              first lease is issued from the verify card above.
            -->
            @if (currentSnapshot() && newLeaseOpen()) {
            <form class="stack lease-form" [formGroup]="leaseForm" appFormFeedback (ngSubmit)="generateLease()">
              <div class="grid-auto">
                <label class="field">
                  <span>Start date</span>
                  <input type="date" formControlName="startDate">
                  <app-field-error [control]="leaseForm.controls.startDate" label="Start date" />
                </label>
                <label class="field">
                  <span>End date</span>
                  <input type="date" formControlName="endDate">
                </label>
                <label class="field">
                  <span>Lease type</span>
                  <select formControlName="leaseType">
                    <option value="FIXED_TERM">Fixed term</option>
                    <option value="MONTH_TO_MONTH">Month to month</option>
                    <option value="COMMERCIAL">Commercial</option>
                  </select>
                </label>
                <label class="field">
                  <span>Monthly rent</span>
                  <input type="number" min="0" formControlName="monthlyRent">
                </label>
                <label class="field">
                  <span>Security deposit</span>
                  <input type="number" min="0" formControlName="securityDeposit">
                </label>
                <label class="field">
                  <span>Payment due day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay">
                </label>
                <label class="field field--full">
                  <span>Special terms</span>
                  <textarea formControlName="specialTerms" rows="2"></textarea>
                </label>
              </div>

              @if (leaseError(); as apiError) {
                <app-error-card
                  title="Unable to generate the lease"
                  [message]="apiError.message"
                  [details]="apiError.details"
                />
              }

              <div class="button-row">
                @if (leaseBlocked()) {
                  <div class="alert alert-warning">
                    <p><strong>This contract would be refused.</strong> Missing:</p>
                    <ul class="missing">
                      @for (item of missingForLease(); track item.label) {
                        <li>{{ item.label }} <span class="muted">— {{ item.recordedOn || 'not recorded' }}</span></li>
                      }
                    </ul>
                    <a class="text-link" [routerLink]="RoutePaths.buildingDetail(detail.agencyId ?? agencyId(), detail.buildingId ?? buildingId())">
                      Record them on the building
                    </a>
                  </div>
                }

                <button type="submit" class="btn btn-primary" [disabled]="generatingLease() || leaseBlocked()">
                  {{ generatingLease() ? 'Generating...' : 'Generate lease' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="newLeaseOpen.set(false)">Cancel</button>
                <span class="muted">
                  From their verification of {{ formatDate(currentSnapshot()!.snapshotDate) }}@if (currentSnapshot()!.roomName || currentSnapshot()!.roomNumber) {
                    <span> · {{ currentSnapshot()!.roomName || 'Room ' + currentSnapshot()!.roomNumber }}</span>
                  }
                </span>
              </div>
            </form>
            }
          </app-permission-gate>

          @if ((detail.leaseAgreements ?? []).length === 0) {
            <p class="muted">No lease agreements yet.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Lease</th><th>Term</th><th>Rent</th><th>Status</th><th class="actions-col">Actions</th></tr>
                </thead>
                <tbody>
                  @for (lease of detail.leaseAgreements ?? []; track lease.id) {
                    <tr [appRowLink]="RoutePaths.leaseDetail(lease.id)">
                      <td>
                        <a class="record-link__primary" [routerLink]="RoutePaths.leaseDetail(lease.id)">
                          {{ lease.leaseNumber || ('Lease #' + lease.id) }}
                        </a>
                      </td>
                      <td>{{ formatDate(lease.startDate) }} — {{ formatDate(lease.endDate) }}</td>
                      <td>{{ lease.monthlyRent ?? '-' }}</td>
                      <td><span class="status-chip" [ngClass]="leaseStatusClass(lease.status)">{{ lease.status | humanLabel }}</span></td>
                      <td class="actions-col">
                        <!--
                          Activation is the step that can fail after the lease exists, so
                          finishing it lives here rather than only on the lease page.
                        -->
                        @if (lease.status === 'DRAFT') {
                          <app-permission-gate [permissions]="PermissionSets.LEASE_WRITE">
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              [disabled]="activatingLeaseId() !== null"
                              (click)="activateLease(lease.id)"
                            >
                              {{ activatingLeaseId() === lease.id ? 'Activating...' : 'Activate' }}
                            </button>
                          </app-permission-gate>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <!-- Money held, not rent: received and refunded on its own ledger. -->
        <app-permission-gate [permissions]="['RENT_PAYMENT_READ', 'RENT_PAYMENT_READ_ALL']">
          <app-tenant-deposits [agencyId]="+agencyId()" [buildingId]="+buildingId()" [tenantId]="+tenantId()" />
        </app-permission-gate>

        @if (currentSnapshot()) {
          <ng-container [ngTemplateOutlet]="verifyCard" />
        }

        <app-section-card title="Room history">
          @if ((detail.roomHistory ?? []).length === 0) {
            <p class="muted">No occupancy history recorded.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Room</th><th>Building</th><th>Occupancy</th><th>Rent</th><th>Exit reason</th></tr>
                </thead>
                <tbody>
                  @for (entry of detail.roomHistory ?? []; track entry.id) {
                    <tr>
                      <td>{{ entry.roomName || entry.roomNumber || '-' }}</td>
                      <td>{{ entry.buildingName || '-' }}</td>
                      <td>
                        {{ formatDate(entry.moveInDate) }} — {{ entry.moveOutDate ? formatDate(entry.moveOutDate) : 'present' }}
                        @if (entry.isCurrentOccupancy) {
                          <span class="status-chip status-chip--success">Current</span>
                        }
                      </td>
                      <td>{{ entry.rentAmount ?? '-' }}</td>
                      <td>{{ entry.moveOutReason || '-' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.TENANT_DELETE_ALL, Permissions.TENANT_DELETE]">
          <app-danger-zone label="Delete tenant" [busy]="deleting()" (pressed)="remove()" />
        </app-permission-gate>
      }
      </app-context-guard>
    </section>

    @if (recordingPayment() && tenant(); as tenant) {
      <app-record-payment-dialog [agencyId]="+agencyId()" [buildingId]="+buildingId()" [tenantId]="+tenantId()"
                                 [tenantName]="tenant.firstName + ' ' + tenant.lastName" [month]="thisMonth"
                                 [amount]="tenant.intendedRoomMonthlyRent ?? roomTerms()?.monthlyRent ?? null"
                                 (recorded)="paymentRecorded()" (closed)="recordingPayment.set(false)" />
    }
  `,
  styles: [`
    .points { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.2rem; }
    .icon-row { display: flex; align-items: center; gap: 0.4rem; }
    .lease-form { padding: 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-2); }
    .reverify-closed { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; }
    .verified-row { display: flex; align-items: center; gap: 0.4rem 0.75rem; flex-wrap: wrap; }
    .doc-pick > summary { cursor: pointer; font-weight: 600; }
    .doc-pick[open] > summary { margin-bottom: 0.6rem; }

    .doc-upload { padding-top: 0.75rem; border-top: 1px solid var(--border); }
    .more > summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; }
    .more[open] > summary { margin-bottom: 0.6rem; }


    .missing { margin: 0.4rem 0; padding-left: 1.1rem; }
    .alert-warning p { margin: 0; }

    /* Decision beside what it asks for next: the room, or the reason for refusing. */
    .verify-row {
      display: grid;
      grid-template-columns: minmax(8rem, 11rem) minmax(0, 1fr);
      gap: 1.15rem 1rem;
      align-items: start;
    }

    @media (max-width: 480px) {
      .verify-row { grid-template-columns: minmax(0, 1fr); }
    }

    .revise {
      padding: 0.9rem 1rem;
      border-left: 3px solid var(--warning);
    }

    .revise p { margin: 0 0 0.4rem; }

    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .actions-col {
      white-space: nowrap;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .doc-select {
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
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.35rem 1rem;
    }

    p {
      margin: 0;
    }

    /* Whose turn it is, stated before anything else on the page. */
    .awaiting {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 1rem 1.15rem;
      border-color: var(--warning-border);
      background: var(--warning-tint);
    }

    .awaiting__copy { display: grid; gap: 0.25rem; min-width: 0; flex: 1 1 20rem; }
    .awaiting__copy h2, .awaiting__copy p { margin: 0; }
    .awaiting__form { flex: 1 1 100%; }

    .shared { display: grid; gap: 0.45rem; margin: 0 0 1rem; padding: 0; list-style: none; }

    .shared__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.55rem 0.8rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-lg);
      background: var(--primary-tint);
    }

    .shared__body { display: grid; gap: 0.1rem; min-width: 0; }

    .document-request {
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly PermissionSets = PermissionSets;
  readonly documentTypes = TENANT_DOCUMENT_TYPES;
  readonly maxDocumentMb = TENANT_DOCUMENT_MAX_MB;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly tenantId = input.required<string>();

  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly profileGrants = inject(ProfileGrantsService);
  private readonly housing = inject(HousingService);
  private readonly contracts = inject(ContractsService);
  readonly context = inject(ActiveContextService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tenant = signal<TenantFullDetail | null>(null);

  /**
   * The backend allows this page for `TENANT_READ_ALL`, an agency `TENANT_READ`,
   * **or** the tenant themselves — so a tenant viewing their own record must not
   * be gated on the agency permission.
   */
  readonly isOwnRecord = computed(() =>
    this.tenant()?.userId != null && this.tenant()!.userId === this.authSession.currentUserId()
  );
  readonly deleting = signal(false);

  readonly proceeding = signal(false);
  readonly savingProceed = signal(false);

  /** Mandatory: enrolling somebody who never agreed needs a name against it. */
  readonly proceedForm = this.formBuilder.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
    // Required: the backend refuses without them, because the tenancy is
    // nameless until somebody supplies an identity for it.
    firstName: ['', [Validators.required]],
    middleName: '',
    lastName: ['', [Validators.required]],
    nationalIdNumber: ['', [Validators.required]],
    phoneNumber: '',
    email: ''
  });

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly verifying = signal(false);
  readonly verifyError = signal<ApiError | null>(null);
  /** Verification and lease generation share one submit, so the card names the step that failed. */
  readonly verifyErrorTitle = signal('Unable to verify tenant');
  readonly selectedDocumentIds = signal<Set<number>>(new Set());

  /** What a lease for the chosen room resolves to, room → building → agency. */
  readonly roomTerms = signal<RoomEffectiveTerms | null>(null);
  readonly roomTermsLoading = signal(false);
  /** Set when the tenant's intended room cannot be approved against — it says why. */
  readonly intendedRoomBlocked = signal<string | null>(null);
  readonly prefilledFromIntendedRoom = signal(false);

  /**
   * A lease is generated against a verification snapshot, and `/full` carries the
   * current one — falling back to the list keeps this working against older
   * payloads that only send the collection.
   */
  readonly currentSnapshot = computed<VerificationSnapshotDetail | null>(() => {
    const detail = this.tenant();
    if (!detail) {
      return null;
    }

    return detail.currentVerificationSnapshot
      ?? (detail.verificationSnapshots ?? []).find((snapshot) => snapshot.isCurrent)
      ?? null;
  });

  readonly uploadError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    firstName: ['', [Validators.required]],
    middleName: '',
    lastName: ['', [Validators.required]],
    email: ['', [Validators.email]],
    phoneNumber: '',
    nationalIdNumber: '',
    contactPerson: '',
    tenantType: 'INDIVIDUAL',
    status: 'PENDING',
    roomId: [null as number | null],
    moveInDate: '',
    moveOutDate: '',
    noticeGivenDate: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    notes: ''
  });

  readonly verifyForm = this.formBuilder.group({
    approved: true,
    roomId: [null as number | null],
    rejectionReason: '',
    verificationNotes: '',
    issueLease: true,
    activateLease: false,
    moveInNow: false
  });

  /** A move-in without a contract: what starts billing when no lease is issued. */
  readonly moveInForm = this.formBuilder.group({
    moveInDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    monthlyRent: [null as number | null, [Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.min(0)]]
  });

  /** Whether a contract can be generated for the chosen room; null while unknown. */
  readonly leaseReadiness = signal<ContractReadiness | null>(null);
  readonly readinessChecking = signal(false);

  /**
   * Only a known "not ready" blocks. A failed check (the operator may not hold
   * the template permission) leaves the choice open, and the server still
   * refuses a contract it cannot complete.
   */
  readonly leaseBlocked = computed(() => this.leaseReadiness()?.ready === false);

  /** Each missing value once — the same label can be required by two variables. */
  readonly missingForLease = computed(() => {
    const seen = new Set<string>();
    return (this.leaseReadiness()?.missing ?? []).filter((item) => {
      const label = item.label || item.key;
      if (seen.has(label)) {
        return false;
      }
      seen.add(label);
      return true;
    }).map((item) => ({ ...item, label: item.label || item.key }));
  });

  /**
   * Whether this submit issues a contract: asked for, possible here, and
   * something this operator may do — an unticked-but-hidden default must not
   * send lease terms the backend would refuse on permission.
   */
  issuingLease(): boolean {
    return !!this.verifyForm.controls.approved.value
      && !!this.verifyForm.controls.issueLease.value
      && this.offersLeaseWithVerification()
      && !this.leaseBlocked()
      && this.context.canAny(PermissionSets.LEASE_WRITE);
  }

  readonly movingInNow = signal(false);
  readonly moveInError = signal<ApiError | null>(null);

  /** Verified and not yet living there, with no contract that would move them in on activation. */
  readonly canMoveIn = computed(() => {
    const tenant = this.tenant();
    const openLease = (tenant?.leaseAgreements ?? [])
      .some((lease) => lease.status === 'DRAFT' || lease.status === 'PENDING_SIGNATURE' || lease.status === 'ACTIVE');
    return tenant?.status === 'VERIFIED' && !openLease;
  });

  async moveInWithoutLease(): Promise<void> {
    if (this.moveInForm.invalid) {
      this.moveInForm.markAllAsTouched();
      return;
    }

    this.movingInNow.set(true);
    this.moveInError.set(null);

    try {
      await firstValueFrom(this.tenantsService.moveIn(
        Number(this.agencyId()), Number(this.buildingId()), Number(this.tenantId()), this.moveInRequest()
      ));
      await this.reload();
    } catch (error) {
      this.moveInError.set(toApiError(error));
    } finally {
      this.movingInNow.set(false);
    }
  }

  /** Moving in without a contract, in the same transaction as the approval. */
  movingIn(): boolean {
    return !!this.verifyForm.controls.approved.value
      && !this.issuingLease()
      && !!this.verifyForm.controls.moveInNow.value
      && this.offersLeaseWithVerification()
      && this.context.canAny(PermissionSets.TENANT_CREATE);
  }

  /** Everything the current snapshot replaced, newest first — history, not rivals. */
  readonly supersededSnapshots = computed<VerificationSnapshotDetail[]>(() => {
    const currentId = this.currentSnapshot()?.id;

    return (this.tenant()?.verificationSnapshots ?? [])
      .filter((snapshot) => snapshot.id !== currentId)
      .sort((a, b) => (b.snapshotDate ?? '').localeCompare(a.snapshotDate ?? ''));
  });

  readonly activatingLeaseId = signal<number | null>(null);
  readonly generatingLease = signal(false);
  readonly leaseError = signal<ApiError | null>(null);

  readonly leaseForm = this.formBuilder.group({
    startDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    endDate: [''],
    leaseType: 'FIXED_TERM',
    monthlyRent: [null as number | null, [Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.min(0)]],
    paymentDueDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
    specialTerms: ['']
  });

  /**
   * Only once there is something to correct: a current snapshot to supersede,
   * and a tenancy past initial approval. Before that, ordinary verification
   * is the right action and this would be a second way to do the same thing.
   */
  readonly canRevise = computed(() => {
    const status = this.tenant()?.status;
    return this.currentSnapshot() !== null
      && (status === 'ACTIVE' || status === 'VERIFIED');
  });

  readonly revising = signal(false);

  readonly uploadForm = this.formBuilder.group({
    documentType: 'NATIONAL_ID_FRONT'
  });

  /** What this agency may check: its own filed documents plus what the tenant shared. */
  readonly verifiableDocuments = signal<TenantDocumentPreview[]>([]);

  /**
   * What a verification can be made with. Never a lease agreement: a contract
   * is not evidence of who someone is, and verifying with one archived it.
   */
  readonly documentChoices = computed(() =>
    this.verifiableDocuments().filter((document) => document.documentType !== 'LEASE_AGREEMENT'));

  /** Shared by the tenant first — usually the fuller set — then what the agency filed. */
  readonly documentList = computed(() => [...this.verifiableDocuments()]
    .filter((document) => document.isCurrentVersion !== false)
    .sort((a, b) => Number(!!a.tenantId) - Number(!!b.tenantId)));

  /** Types not on file yet; OTHER can always be added. */
  readonly missingDocumentTypes = computed(() => {
    const held = new Set(this.documentList().map((document) => document.documentType));
    return DOCUMENT_TYPES.filter((option) => option.value === 'OTHER' || !held.has(option.value));
  });

  /** The re-verify card opens only when asked: it is rarely needed once verified. */
  readonly reverifyOpen = signal(false);

  /** The generate form opens on request; the card is otherwise the list of leases. */
  readonly newLeaseOpen = signal(false);

  /**
   * Asking only makes sense for someone with an account who is not already
   * sharing, and has not been asked. A share code or an accepted invitation
   * shares already; a tenant with no account has nothing to share from.
   */
  canAskForDocuments(detail: TenantFullDetail): boolean {
    return !!detail.userUid
      && !this.awaitingShare()
      && !this.verifiableDocuments().some((document) => !document.tenantId);
  }

  readonly replaceError = signal<ApiError | null>(null);

  readonly chatLauncher = inject(ChatLauncherService);
  private readonly chat = inject(ChatService);

  messageTenant(): void {
    void this.chatLauncher.open(this.chat.openTenancyAsStaff(
      Number(this.agencyId()), Number(this.buildingId()), Number(this.tenantId())));
  }

  /** The documents as the shared list shows them; only what the agency filed is replaceable. */
  readonly documentItems = computed<FileListItem[]>(() => {
    const canWrite = this.context.canAny(PermissionSets.TENANT_DOCUMENT_WRITE);
    return this.documentList().map((document) => ({
      id: document.id,
      name: humanizeLabel(document.documentType),
      meta: [document.tenantId ? 'Filed by your agency' : 'Shared by the tenant', document.fileName].filter(Boolean).join(' · '),
      url: document.fileUrl,
      link: RoutePaths.tenantDocumentDetail(this.agencyId(), this.buildingId(), this.tenantId(), document.id),
      replaceable: !!document.tenantId && canWrite
    }));
  });

  private async loadVerifiableDocuments(): Promise<void> {
    try {
      const documents = await firstValueFrom(this.tenantsService.getVerifiableDocuments(
        Number(this.agencyId()), Number(this.buildingId()), Number(this.tenantId())
      ));
      // One row per document: a filed document can also match the library half
      // of the endpoint, which returned the same lease PDF twice.
      this.verifiableDocuments.set([...new Map(documents.map((document) => [document.id, document])).values()]);
    } catch {
      // Without document access the list is simply empty; the page still works.
      this.verifiableDocuments.set([]);
    }
    const first = this.missingDocumentTypes()[0]?.value;
    if (first) {
      this.uploadForm.controls.documentType.setValue(first);
    }
  }

  /** Files a new version of the same type; the old one stays as history. */
  readonly replaceDocument = async (item: FileListItem, file: File): Promise<boolean> => {
    const documentType = this.documentList().find((document) => document.id === item.id)?.documentType;
    if (!documentType) {
      return false;
    }

    this.replaceError.set(null);
    try {
      await firstValueFrom(this.tenantsService.landlordUploadDocument(
        Number(this.agencyId()), Number(this.buildingId()), Number(this.tenantId()), file, documentType
      ));
      await this.reload();
      return true;
    } catch (error) {
      this.replaceError.set(toApiError(error));
      return false;
    }
  };

  constructor() {
    /*
     * The room carries the money terms, so choosing one fills them in rather than
     * asking the operator to copy figures off the room page.
     */
    this.verifyForm.controls.roomId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((roomId) => void this.loadRoomTerms(roomId, true));
  }

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const tenant = await firstValueFrom(
        this.tenantsService.getTenantFull(Number(this.agencyId()), Number(this.buildingId()), Number(this.tenantId()))
      );
      this.tenant.set(tenant);
      this.patchForm(tenant);
      // Before the prefill: it ticks the documents this list holds.
      await this.loadVerifiableDocuments();
      await this.prefillVerification(tenant);
      await this.loadSharedDocuments();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  toggleEdit(): void {
    this.editing.update((value) => !value);
    this.saveError.set(null);

    const tenant = this.tenant();
    if (this.editing() && tenant) {
      this.patchForm(tenant);
    }
  }

  /** Says what the single submit will actually do, so nothing is issued by surprise. */
  /** Verification issues the first lease; after that the Leases card does. */
  readonly offersLeaseWithVerification = computed(() => this.currentSnapshot() === null);

  submitLabel(): string {
    if (this.verifying()) {
      return 'Submitting...';
    }

    if (!this.verifyForm.controls.approved.value) {
      return 'Reject tenant';
    }

    const verb = this.currentSnapshot() ? 'Re-verify' : 'Approve';

    if (!this.issuingLease()) {
      return this.movingIn() ? `${verb} and move in` : `${verb} and reserve room`;
    }

    return this.verifyForm.controls.activateLease.value
      ? `${verb}, issue lease and move in`
      : `${verb} and issue lease`;
  }

  toggleDocument(documentId: number): void {
    this.selectedDocumentIds.update((current) => {
      const next = new Set(current);
      next.has(documentId) ? next.delete(documentId) : next.add(documentId);
      return next;
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      await firstValueFrom(this.tenantsService.landlordUpdateTenant(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        {
          firstName: value.firstName,
          middleName: value.middleName || null,
          lastName: value.lastName,
          email: value.email || null,
          phoneNumber: value.phoneNumber || null,
          nationalIdNumber: value.nationalIdNumber || null,
          contactPerson: value.contactPerson || null,
          tenantType: value.tenantType as never,
          status: value.status as never,
          roomId: value.roomId,
          moveInDate: value.moveInDate || null,
          moveOutDate: value.moveOutDate || null,
          noticeGivenDate: value.noticeGivenDate || null,
          emergencyContactName: value.emergencyContactName || null,
          emergencyContactPhone: value.emergencyContactPhone || null,
          emergencyContactRelationship: value.emergencyContactRelationship || null,
          notes: value.notes || null
        }
      ));

      this.editing.set(false);
      await this.reload();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * The whole approval in one submit. When a lease is asked for, that is a single
   * `verify-and-generate` call: the backend threads the snapshot it just wrote
   * into the lease and runs both in one transaction, so a refused lease rolls the
   * verification back rather than stranding the tenant as VERIFIED with a reserved
   * room and no lease. Move-in stays a separate act — it is the irreversible one.
   */
  async verify(): Promise<void> {
    const value = this.verifyForm.getRawValue();
    const approved = value.approved;
    this.verifyForm.controls.rejectionReason.setValidators(approved ? [] : [Validators.required]);
    this.verifyForm.controls.rejectionReason.updateValueAndValidity();

    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      return;
    }

    const issuingLease = this.issuingLease();
    if (issuingLease && this.leaseForm.invalid) {
      this.leaseForm.markAllAsTouched();
      return;
    }

    const movingIn = this.movingIn();
    if (movingIn && this.moveInForm.invalid) {
      this.moveInForm.markAllAsTouched();
      return;
    }

    if (approved && value.roomId === null) {
      this.verifyErrorTitle.set('Unable to verify tenant');
      this.verifyError.set(localError('Choose the room to reserve for this tenant.'));
      return;
    }

    // A rejection names what it rejects. An approval may tick none — the renter
    // profile, or documents seen in person, can be enough — and says so below.
    if (!approved && this.selectedDocumentIds().size === 0) {
      this.verifyErrorTitle.set('Unable to reject tenant');
      this.verifyError.set(localError('Tick the documents you are rejecting.'));
      return;
    }

    // Nothing in the room → building → agency chain prices this room, and the
    // lease service refuses an unpriced one — catch it before the round trip.
    if (issuingLease && this.unpricedRoom() && this.leaseForm.controls.monthlyRent.value === null) {
      this.verifyErrorTitle.set('Unable to issue the lease');
      this.verifyError.set(localError('Enter a monthly rent — neither the room, its building nor the agency sets one.'));
      return;
    }

    const agencyId = Number(this.agencyId());
    const buildingId = Number(this.buildingId());
    const tenantId = Number(this.tenantId());

    this.verifying.set(true);
    this.verifyError.set(null);
    this.verifyErrorTitle.set(issuingLease ? 'Unable to verify the tenant and issue the lease' : 'Unable to verify tenant');

    // Verification and generation are one server transaction: until it returns,
    // a failure has changed nothing and the form must survive untouched so the
    // operator fixes the one field and resubmits. Past it, the lease exists and
    // the page has to be reloaded to show what actually landed.
    let committed = false;

    try {
      if (issuingLease || movingIn) {
        const result = await firstValueFrom(this.tenantsService.verifyAndGenerateLease(agencyId, buildingId, tenantId, {
          verification: this.verificationRequest(),
          lease: issuingLease ? this.leaseTerms() : null,
          moveIn: movingIn ? this.moveInRequest() : null
        }));
        committed = true;

        if (value.activateLease && result.lease?.id != null) {
          this.verifyErrorTitle.set(
            `Lease ${result.lease.leaseNumber || '#' + result.lease.id} was generated, but activating it failed`
          );
          await firstValueFrom(this.tenantsService.activateLease(agencyId, buildingId, result.lease.id));
        }
      } else {
        await firstValueFrom(this.tenantsService.verifyAndAssign(agencyId, buildingId, tenantId, this.verificationRequest()));
        committed = true;
      }

      if (approved) {
        await this.recordStartPayments(agencyId, buildingId, tenantId);
      }

      this.selectedDocumentIds.set(new Set());
      await this.reload();
    } catch (error) {
      this.verifyError.set(toApiError(error));

      if (committed) {
        // Only activation can fail this late; the draft is on the page to finish.
        await this.reload();
      }
    } finally {
      this.verifying.set(false);
    }
  }

  /** Rent and deposit received at the start: the lease's terms, else the move-in's, else the room's. */
  readonly startPayments = initialPaymentsGroup(this.formBuilder);
  private readonly rentService = inject(RentService);

  /** Rent received any time after the tenant exists — this month by default. */
  readonly recordingPayment = signal(false);
  readonly thisMonth = thisMonthIso();

  paymentRecorded(): void {
    this.recordingPayment.set(false);
    this.notifications.push('success', 'Payment recorded.');
    void this.reload();
  }

  agreedRent(): number | string | null | undefined {
    return (this.issuingLease() ? this.leaseForm.controls.monthlyRent.value : null)
      ?? (this.movingIn() ? this.moveInForm.controls.monthlyRent.value : null)
      ?? this.roomTerms()?.monthlyRent;
  }

  agreedDeposit(): number | string | null | undefined {
    return (this.issuingLease() ? this.leaseForm.controls.securityDeposit.value : null)
      ?? (this.movingIn() ? this.moveInForm.controls.securityDeposit.value : null)
      ?? this.roomTerms()?.securityDeposit;
  }

  /**
   * After the verification has committed: record what was paid. Separate calls,
   * so a refusal here does not undo the verification — the error says what is
   * left to record, and the Deposit card or the rent pages finish it.
   */
  private async recordStartPayments(agencyId: number, buildingId: number, tenantId: number): Promise<void> {
    const { initialRentPayment, depositPayment } = toInitialPayments(this.startPayments);

    if (initialRentPayment) {
      this.verifyErrorTitle.set('Verified — but the rent payment was not recorded');
      await firstValueFrom(this.rentService.createPayment(agencyId, buildingId, {
        tenantId,
        amountPaid: initialRentPayment.amountPaid,
        paymentDate: initialRentPayment.paymentDate ?? todayIso(),
        paymentForMonth: initialRentPayment.paymentForMonth ?? toMonthPath(thisMonthIso()),
        paymentMethod: initialRentPayment.paymentMethod,
        receiptNumber: initialRentPayment.receiptNumber ?? null
      }));
      this.startPayments.patchValue({ rentAmount: null });
    }

    if (depositPayment) {
      this.verifyErrorTitle.set('Verified — but the deposit was not recorded');
      const open = (await firstValueFrom(this.rentService.getTenantDeposits(agencyId, buildingId, tenantId)))
        .find((deposit) => ['PENDING', 'HELD', 'PARTIALLY_REFUNDED'].includes(deposit.status));
      await firstValueFrom(open
        ? this.rentService.recordDepositReceipt(agencyId, buildingId, open.id, depositPayment)
        : this.rentService.openDeposit(agencyId, buildingId, tenantId, { initialReceipt: depositPayment }));
      this.startPayments.patchValue({ depositAmount: null });
    }
  }

  /**
   * Finishes a lease left in DRAFT — the step that can fail after the verification
   * transaction has already committed, so it must be resumable on its own.
   */
  async activateLease(leaseId: number): Promise<void> {
    this.activatingLeaseId.set(leaseId);
    this.leaseError.set(null);

    try {
      await firstValueFrom(this.tenantsService.activateLease(
        Number(this.agencyId()),
        Number(this.buildingId()),
        leaseId
      ));
      await this.reload();
    } catch (error) {
      this.leaseError.set(toApiError(error));
    } finally {
      this.activatingLeaseId.set(null);
    }
  }

  /** Identity and evidence only — the money lives on the lease half. */
  private verificationRequest(): VerifyAndAssignRequest {
    const value = this.verifyForm.getRawValue();

    return {
      approved: value.approved,
      // Omitted, the backend falls back to the room the tenant applied for.
      roomId: value.approved ? value.roomId : null,
      rejectionReason: value.approved ? null : value.rejectionReason,
      verificationNotes: value.verificationNotes || null,
      // Exactly what is ticked. The server never picks documents: an empty list
      // approves on their details alone, which it now allows.
      documentIds: [...this.selectedDocumentIds()]
    };
  }

  private moveInRequest(): MoveInRequest {
    const value = this.moveInForm.getRawValue();
    return {
      moveInDate: value.moveInDate,
      monthlyRent: value.monthlyRent,
      securityDeposit: value.securityDeposit
    };
  }

  /** The lease terms both entry points send, prefilled from the room's cascade. */
  private leaseTerms(): LeaseTermsRequest {
    const value = this.leaseForm.getRawValue();

    return {
      startDate: value.startDate,
      endDate: value.endDate || null,
      leaseType: value.leaseType as LeaseType,
      monthlyRent: value.monthlyRent,
      securityDeposit: value.securityDeposit,
      paymentDueDay: value.paymentDueDay,
      specialTerms: value.specialTerms || null
    };
  }

  /**
   * Re-verifies against the tenancy record as it now stands.
   *
   * No identity fields are sent, and none are asked for: the endpoint reads
   * the tenancy, so it cannot be made to assert something the record does not
   * say. Correcting an employer is a change to the tenant, made above; this
   * is what makes the change part of the verified history.
   */
  async reviseVerification(): Promise<void> {
    const tenant = this.tenant();
    if (!tenant) {
      return;
    }

    const reason = await this.confirm.askForReason({
      title: 'Revise this tenant\'s verification?',
      message: 'A new verified record is saved from their details as they are now, the approved '
        + 'documents carry forward, and the contract is reissued for the tenant to sign again. '
        + 'The room and the tenancy are left where they are.',
      confirmLabel: 'Revise',
      reason: {
        label: 'What changed, and why?',
        placeholder: 'e.g. Employer corrected after the tenant changed jobs',
        hint: 'Kept with the verification and the re-issued contract.',
        required: true,
        maxLength: 500
      }
    });

    if (reason === null) {
      return;
    }

    this.revising.set(true);

    try {
      const result = await firstValueFrom(this.tenantsService.reviseVerification(
        tenant.agencyId ?? Number(this.agencyId()),
        tenant.buildingId ?? Number(this.buildingId()),
        tenant.id,
        { reason }
      ));

      this.notifications.push('success', result.contractReissued
        ? 'Verification revised. The contract has been reissued and awaits the tenant\'s signature.'
        : 'Verification revised.');

      await this.reload();
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.revising.set(false);
    }
  }

  readonly uploadDocument: FileUploadSend = async ([file]) => {
    this.uploadError.set(null);

    try {
      await firstValueFrom(this.tenantsService.landlordUploadDocument(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        file,
        this.uploadForm.getRawValue().documentType as DocumentType
      ));

      await this.reload();
      return true;
    } catch (error) {
      this.uploadError.set(toApiError(error));
      return false;
    }
  };

  /** Documents reachable through an active grant, and whether one is pending. */
  readonly sharedDocuments = signal<SharedDocument[]>([]);
  readonly awaitingShare = signal(false);

  readonly requestingDocuments = signal(false);
  readonly sendingDocumentRequest = signal(false);
  readonly documentRequestSent = signal(false);
  readonly documentRequestError = signal<ApiError | null>(null);

  readonly documentRequestForm = this.formBuilder.group({
    purpose: ['', [Validators.maxLength(255)]]
  });

  startDocumentRequest(): void {
    this.documentRequestForm.reset({ purpose: '' });
    this.documentRequestError.set(null);
    this.documentRequestSent.set(false);
    this.requestingDocuments.set(true);
  }

  cancelDocumentRequest(): void {
    this.requestingDocuments.set(false);
  }

  async requestDocuments(): Promise<void> {
    const agencyId = this.agencyId();
    const tenantId = this.tenant()?.id;
    if (!agencyId || !tenantId) {
      return;
    }

    this.sendingDocumentRequest.set(true);
    this.documentRequestError.set(null);

    try {
      await firstValueFrom(this.profileGrants.requestAccess(Number(agencyId), {
        tenantId,
        purpose: this.documentRequestForm.controls.purpose.value.trim() || null,
        // Both: the profile is what names them on the tenancy, the documents
        // are the evidence to check it against. They may answer with less.
        scopes: ['PROFILE', 'DOCUMENTS']
      }));

      this.documentRequestSent.set(true);
      // Reflect the pending state without making them reload the page.
      await this.loadSharedDocuments();
    } catch (error) {
      this.documentRequestError.set(toApiError(error));
    } finally {
      this.sendingDocumentRequest.set(false);
    }
  }

  startProceed(): void {
    this.proceedForm.reset({
      reason: '', firstName: '', middleName: '', lastName: '',
      nationalIdNumber: '', phoneNumber: '', email: ''
    });
    this.proceeding.set(true);
  }

  cancelProceed(): void {
    this.proceeding.set(false);
  }

  /**
   * Stop waiting for a tenant who never answered.
   *
   * Explicitly not a bypass of document consent, and must not become one: the
   * landlord now collects and uploads their own copies against this tenancy.
   * Skipping the wait buys more work, not more reach — if that ever inverts,
   * the consent model is decorative.
   */
  async proceedUnaccepted(): Promise<void> {
    if (this.proceedForm.invalid) {
      this.proceedForm.markAllAsTouched();
      return;
    }

    const agencyId = this.agencyId();
    const buildingId = this.buildingId();
    const tenantId = this.tenant()?.id;
    if (!agencyId || !buildingId || !tenantId) {
      return;
    }

    if (!await this.confirm.ask({
      title: 'Proceed without their acceptance?',
      message: 'The tenancy becomes fully managed, and the identity you entered plus your reason '
        + 'are recorded against it. You will not gain access to documents they hold.',
      confirmLabel: 'Proceed'
    })) {
      return;
    }

    this.savingProceed.set(true);

    try {
      const value = this.proceedForm.getRawValue();

      await firstValueFrom(this.tenantsService.proceedWithoutTenantAcceptance(
        Number(agencyId), Number(buildingId), tenantId, {
          reason: value.reason.trim(),
          firstName: value.firstName.trim(),
          middleName: value.middleName.trim() || null,
          lastName: value.lastName.trim(),
          nationalIdNumber: value.nationalIdNumber.trim(),
          phoneNumber: value.phoneNumber.trim() || null,
          email: value.email.trim() || null
        }
      ));

      this.proceeding.set(false);
      await this.reload();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.savingProceed.set(false);
    }
  }

  /**
   * Read this tenancy's grants and pool what they cover.
   *
   * Silent on failure: an agency without TENANT_DOCUMENT_READ gets a 403
   * here, and that must not take the tenant page down with it.
   */
  private async loadSharedDocuments(): Promise<void> {
    const agencyId = this.agencyId();
    const tenantId = this.tenant()?.id;
    if (!agencyId || !tenantId) {
      return;
    }

    try {
      // Filtered by the server to this tenancy (§28.12) — not the agency's first page.
      const page = await firstValueFrom(this.profileGrants.getAgencyGrants(Number(agencyId), { tenantId, size: 20 }));
      const mine = page.items ?? [];

      const live = mine.filter((grant) => grant.currentlyValid);

      this.sharedDocuments.set(live.flatMap((grant) => grant.documents ?? []));
      // Carried on the grant itself, so no second request and no chance of
      // rendering a profile whose consent has since lapsed.
      this.awaitingShare.set(mine.some((grant) => grant.status === 'PENDING'));
    } catch {
      this.sharedDocuments.set([]);
      this.awaitingShare.set(false);
    }
  }

  async remove(): Promise<void> {
    const tenant = this.tenant();
    if (!tenant || !await this.confirm.ask({
      title: `Delete ${this.fullName(tenant)}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.tenantsService.deleteTenant(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId())
      ));
      await this.router.navigateByUrl(RoutePaths.tenants);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }

  fullName(tenant: TenantFullDetail): string {
    return [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean).join(' ') || `Tenant #${tenant.id}`;
  }


  leaseStatusClass(status?: string | null): string {
    switch (status) {
      case 'ACTIVE':
        return 'status-chip--success';
      case 'TERMINATED':
      case 'EXPIRED':
        return 'status-chip--danger';
      case 'PENDING_SIGNATURE':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
  }

  documentStatusClass(status?: string | null): string {
    switch (status) {
      case 'SUBMITTED':
        return 'status-chip--success';
      case 'REJECTED':
        return 'status-chip--danger';
      case 'DRAFT':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  /**
   * Sets the verification card up so approving is one click: the room the tenant
   * applied for, that room's money terms, and every document that can legally be
   * snapshotted, all chosen already.
   */
  private async prefillVerification(tenant: TenantFullDetail): Promise<void> {
    this.selectedDocumentIds.set(new Set(this.snapshotableDocuments().map((document) => document.id)));

    const preferred = tenant.roomId ?? tenant.intendedRoomId ?? null;
    this.intendedRoomBlocked.set(null);
    this.prefilledFromIntendedRoom.set(false);

    if (preferred === null) {
      this.verifyForm.controls.roomId.setValue(null);
      return;
    }

    let room: RoomDetail;
    try {
      room = await firstValueFrom(this.housing.getRoom(
        tenant.agencyId ?? Number(this.agencyId()),
        tenant.buildingId ?? Number(this.buildingId()),
        preferred
      ));
    } catch {
      // The room read is a convenience; failing it must not block the page.
      this.verifyForm.controls.roomId.setValue(preferred);
      return;
    }

    if (!this.isAvailableFor(room, tenant)) {
      this.intendedRoomBlocked.set(
        `${room.name || 'Room ' + (room.roomNumber ?? room.id)} is `
        + (room.status ?? 'unavailable').toLowerCase().replace(/_/g, ' ')
      );
      this.verifyForm.controls.roomId.setValue(null);
      return;
    }

    this.prefilledFromIntendedRoom.set(tenant.roomId == null);
    /*
     * Set quietly and resolve the terms here, so a reload — after an upload, or a
     * failed submit — refills only what the operator has not typed over. Picking a
     * room by hand goes through valueChanges instead, which overwrites: the money
     * has to follow the room it belongs to.
     */
    this.verifyForm.controls.roomId.setValue(room.id, { emitEvent: false });
    await this.loadRoomTerms(room.id, false);
  }

  /** The contract dry run for the room being assigned — the same check Generate would fail. */
  private async checkLeaseReadiness(roomId: number | null): Promise<void> {
    this.leaseReadiness.set(null);
    if (roomId === null) {
      return;
    }

    const tenant = this.tenant();
    const agencyId = tenant?.agencyId ?? Number(this.agencyId());
    const buildingId = tenant?.buildingId ?? Number(this.buildingId());
    this.readinessChecking.set(true);

    try {
      const report = await firstValueFrom(this.contracts.getReadiness(agencyId, { buildingId, roomId }));
      // A slower answer for a room since changed must not overwrite the current one.
      if (this.verifyForm.controls.roomId.value === roomId) {
        this.leaseReadiness.set(report);
      }
    } catch {
      this.leaseReadiness.set(null);
    } finally {
      this.readinessChecking.set(false);
    }
  }

  /**
   * Mirrors the backend's own availability rule, with one addition it also makes:
   * a room this tenant already holds, or that their own current snapshot
   * reserved, is not "taken by someone else".
   */
  private isAvailableFor(room: RoomDetail, tenant: TenantFullDetail): boolean {
    if (tenant.roomId === room.id || this.currentSnapshot()?.roomId === room.id) {
      return true;
    }

    const status = (room.status ?? 'VACANT').toUpperCase();
    const maintenance = (room.maintenanceStatus ?? 'OK').toUpperCase();

    return status === 'VACANT' && maintenance === 'OK';
  }

  /**
   * DRAFT and REJECTED documents are refused by the verification endpoint. A
   * re-verification finds the tenant's documents already ARCHIVED by the earlier
   * snapshot — still valid evidence, so they stand in when nothing is pending.
   */
  private snapshotableDocuments(): TenantDocumentPreview[] {
    const documents = this.documentChoices()
      .filter((document) => document.isCurrentVersion !== false && document.status !== 'REJECTED');
    // Shared from their own library: DRAFT by design, and verifiable once shared.
    const shared = documents.filter((document) => !document.tenantId);
    const submitted = documents.filter((document) => !!document.tenantId && document.status === 'SUBMITTED');
    const ready = [...shared, ...submitted];

    return ready.length > 0
      ? ready
      : documents.filter((document) => !!document.tenantId && document.status === 'ARCHIVED');
  }

  /**
   * Reads what a lease for this room would actually be written with. The room's
   * own columns are null whenever the building or agency sets the figure, so
   * prefilling from them showed a blank where the lease silently billed the
   * building's rent — this endpoint resolves the chain and says which level won.
   */
  private async loadRoomTerms(roomId: number | null, overwrite: boolean): Promise<void> {
    void this.checkLeaseReadiness(roomId);

    if (roomId === null) {
      this.roomTerms.set(null);
      return;
    }

    const tenant = this.tenant();
    this.roomTermsLoading.set(true);

    try {
      const terms = await firstValueFrom(this.housing.getRoomEffectiveTerms(
        tenant?.agencyId ?? Number(this.agencyId()),
        tenant?.buildingId ?? Number(this.buildingId()),
        roomId
      ));
      this.roomTerms.set(terms);
      this.applyRoomTerms(terms, overwrite);
    } catch {
      this.roomTerms.set(null);
    } finally {
      this.roomTermsLoading.set(false);
    }
  }

  /**
   * The lease carries the money, so only its form is filled. A value the operator
   * has edited is left alone unless the room itself changed — losing a typed rent
   * to a background reload is worse than showing a stale default.
   */
  private applyRoomTerms(terms: RoomEffectiveTerms, overwrite: boolean): void {
    const tenant = this.tenant();
    const resolved = {
      monthlyRent: this.numeric(terms.monthlyRent) ?? this.numeric(tenant?.intendedRoomMonthlyRent),
      securityDeposit: this.numeric(terms.securityDeposit) ?? this.numeric(tenant?.intendedRoomSecurityDeposit),
      paymentDueDay: terms.paymentDueDay ?? null
    };

    for (const [name, value] of Object.entries(resolved) as [keyof typeof resolved, number | null][]) {
      const control = this.leaseForm.controls[name];
      if (overwrite || control.pristine) {
        control.setValue(value, { emitEvent: false });
      }
    }

    if (overwrite) {
      // The figures now describe the newly chosen room, not the operator's edits.
      this.leaseForm.controls.monthlyRent.markAsPristine();
      this.leaseForm.controls.securityDeposit.markAsPristine();
      this.leaseForm.controls.paymentDueDay.markAsPristine();
    }
  }

  /** No level prices this room, and lease generation refuses that. */
  unpricedRoom(): boolean {
    const terms = this.roomTerms();
    return terms != null && this.numeric(terms.monthlyRent) === null;
  }

  /**
   * Names only the terms the room did not set itself — that a rent came from the
   * building is the surprising part, that it came from the room is not.
   */
  termsNote(): string | null {
    const sources = this.roomTerms()?.sources;
    if (!sources) {
      return null;
    }

    const level: Record<RoomTermSource, string> = {
      ROOM: 'this room',
      BUILDING: 'the building',
      AGENCY: 'the agency',
      DEFAULT: 'the system default',
      UNSET: ''
    };

    const inherited = ([
      ['monthlyRent', 'Rent'],
      ['securityDeposit', 'Deposit'],
      ['paymentDueDay', 'Due day']
    ] as const)
      .filter(([field]) => {
        const source = sources[field];
        return source !== undefined && source !== 'ROOM' && source !== 'UNSET';
      })
      .map(([field, label]) => `${label} from ${level[sources[field]!]}`);

    return inherited.length > 0 ? `${inherited.join(' · ')}.` : null;
  }

  private numeric(value?: number | string | null): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private patchForm(tenant: TenantFullDetail): void {
    this.form.patchValue({
      firstName: tenant.firstName ?? '',
      middleName: tenant.middleName ?? '',
      lastName: tenant.lastName ?? '',
      email: tenant.email ?? '',
      phoneNumber: tenant.phoneNumber ?? '',
      nationalIdNumber: tenant.nationalIdNumber ?? '',
      contactPerson: tenant.contactPerson ?? '',
      tenantType: tenant.tenantType ?? 'INDIVIDUAL',
      status: tenant.status ?? 'PENDING',
      roomId: tenant.roomId ?? null,
      moveInDate: tenant.moveInDate ?? '',
      moveOutDate: tenant.moveOutDate ?? '',
      noticeGivenDate: tenant.noticeGivenDate ?? '',
      emergencyContactName: tenant.emergencyContactName ?? '',
      emergencyContactPhone: tenant.emergencyContactPhone ?? '',
      emergencyContactRelationship: tenant.emergencyContactRelationship ?? '',
      notes: tenant.notes ?? ''
    });
  }

  /**
   * Issues a lease for this tenant. `generateLease` shipped in the service with
   * no caller, so an agency admin holding LEASE_CREATE had no way to raise one.
   */
  async generateLease(): Promise<void> {
    const detail = this.tenant();
    if (!detail || this.leaseForm.invalid) {
      this.leaseForm.markAllAsTouched();
      return;
    }

    // This page is addressed by route params, not by the shell context.
    const agencyId = Number(this.agencyId());
    const buildingId = Number(this.buildingId());
    if (Number.isNaN(agencyId) || Number.isNaN(buildingId)) {
      return;
    }

    // The lease is written against the snapshot the verification produced.
    const snapshotId = this.currentSnapshot()?.id ?? null;
    if (snapshotId === null) {
      this.leaseError.set(localError('Verify this tenant first — the lease is created from their verification.'));
      return;
    }

    this.generatingLease.set(true);
    this.leaseError.set(null);

    try {
      await firstValueFrom(this.tenantsService.generateLease(agencyId, buildingId, detail.id, {
        verificationSnapshotId: snapshotId,
        ...this.leaseTerms()
      }));

      this.leaseForm.reset({ startDate: new Date().toISOString().slice(0, 10), leaseType: 'FIXED_TERM' });
      this.newLeaseOpen.set(false);
      await this.reload();
    } catch (error) {
      this.leaseError.set(toApiError(error));
    } finally {
      this.generatingLease.set(false);
    }
  }
}
