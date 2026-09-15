import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FilePreviewComponent } from '../../../shared/components/file-preview/file-preview.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants, PermissionSets } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { RoomLinkComponent } from '../../../shared/components/room-link/room-link.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { validateFile } from '../../../shared/utils/file-validation.util';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { TenantsService } from '../tenants.service';
import { ProfileGrantsService } from '../profile-grants/profile-grants.service';
import { SharedDocument } from '../models/profile-grant.models';
import { SharedRenterProfile } from '../../users/models/renter-profile.models';
import { HousingService } from '../../housing/housing.service';
import { RoomDetail, RoomEffectiveTerms, RoomTermSource } from '../../housing/models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import {
  DocumentType,
  LeaseTermsRequest,
  LeaseType,
  TENANT_DOCUMENT_MAX_MB,
  TENANT_DOCUMENT_TYPES,
  TenantDocumentPreview,
  TenantFullDetail,
  VerificationSnapshotDetail,
  VerifyAndAssignRequest
} from '../models/tenant.models';
import { DecimalPipe } from '@angular/common';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

/** A complaint this page raises itself, shaped like the ones the API returns. */
function localError(message: string): ApiError {
  return { status: 0, errorCode: 'CLIENT_VALIDATION', message, details: [] };
}

@Component({
  selector: 'app-tenant-detail-page',
  standalone: true,
  imports: [
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
    FilePreviewComponent,
    RoomLinkComponent,
    DecimalPipe,
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
            <div class="button-row">
              <app-permission-gate [permissions]="[Permissions.TENANT_WRITE_ALL, Permissions.TENANT_WRITE]">
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">
                  {{ editing() ? 'Close editor' : 'Edit tenant' }}
                </button>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.TENANT_DELETE_ALL, Permissions.TENANT_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove()">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
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
              <div><dt>User UID</dt><dd class="mono">{{ detail.userUid || '-' }}</dd></div>
            </app-detail-group>

            <!--
              How the record came to exist and who signed it off. Real, but never
              the reason anyone opened the page — so it goes last, not beside the
              tenant's room.
            -->
            <app-detail-group label="Record">
              <div><dt>Creation mode</dt><dd>{{ detail.creationMode | humanLabel }}</dd></div>
              <div><dt>Claim status</dt><dd>{{ detail.claimStatus | humanLabel }}</dd></div>
              <div><dt>Verified by</dt><dd>{{ detail.verifiedByLandlordName || '-' }}</dd></div>
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
                <label class="field"><span>Room ID</span><input type="number" min="1" formControlName="roomId"></label>
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
            <span class="muted">{{ (detail.documents ?? []).length }} document(s)</span>
            <app-permission-gate [permissions]="[Permissions.TENANT_DOCUMENT_READ]">
              <button type="button" class="btn btn-secondary" (click)="startDocumentRequest()">
                Ask for their documents
              </button>
            </app-permission-gate>
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

          <app-permission-gate [permissions]="PermissionSets.TENANT_DOCUMENT_WRITE">
          <form [formGroup]="uploadForm" appFormFeedback (ngSubmit)="uploadDocument()">
            <div class="grid-auto">
              <label class="field">
                <span>Document type</span>
                <select formControlName="documentType">
                  <option value="NATIONAL_ID_FRONT">National ID (front)</option>
                  <option value="NATIONAL_ID_BACK">National ID (back)</option>
                  <option value="PASSPORT">Passport</option>
                  <option value="PROOF_OF_EMPLOYMENT">Proof of employment</option>
                  <option value="UTILITY_BILL">Utility bill</option>
                  <option value="BANK_STATEMENT">Bank statement</option>
                  <option value="REFERENCE_LETTER">Reference letter</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label class="field">
                <span>File</span>
                <input type="file" [accept]="acceptDocumentTypes" (change)="onFileSelected($event)">
                <small class="hint">PDF, JPEG, PNG or Word up to {{ maxDocumentMb }}MB.</small>
                @if (fileError()) {
                  <small class="error-text">{{ fileError() }}</small>
                }
              </label>
            </div>

            @if (selectedFile(); as picked) {
              <app-file-preview [file]="picked" />
            }

            @if (uploadError(); as apiError) {
              <app-error-card title="Upload failed" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-secondary" [disabled]="uploading() || !selectedFile()">
                {{ uploading() ? 'Uploading...' : 'Upload document' }}
              </button>
            </div>
          </form>
          </app-permission-gate>

          <!--
            Documents the person shared from their own library, as distinct
            from anything this agency filed. This is what an admin reviews
            before verifying somebody they added by uid: the tenant holds the
            originals, and a grant is the only reason they are readable here.
          -->
          @if (sharedProfile(); as profile) {
            <h3 class="panel-title">Shared renter profile</h3>
            <p class="muted">
              Stated by the tenant. Check it against the documents below before verifying.
              @if (profile.status === 'DRAFT') { They have not marked it finished. }
            </p>

            <dl class="detail-grid">
              <div><dt>Legal name</dt><dd>{{ profileName(profile) }}</dd></div>
              <div><dt>National ID</dt><dd class="mono">{{ profile.nationalIdNumber || '—' }}</dd></div>
              <div><dt>Phone</dt><dd class="mono">{{ profile.officialPhoneNumber || '—' }}</dd></div>
              <div><dt>Email</dt><dd>{{ profile.officialEmail || '—' }}</dd></div>
              <div><dt>Employment</dt><dd>{{ profile.employmentStatus | humanLabel }}</dd></div>
              <div><dt>Employer</dt><dd>{{ profile.employerName || '—' }}</dd></div>
              <div><dt>Monthly income</dt><dd>{{ profile.monthlyIncome ? (profile.monthlyIncome | number) : '—' }}</dd></div>
              <div><dt>Occupants</dt><dd>{{ profile.occupantCount ?? '—' }}</dd></div>
              <div><dt>Pets</dt><dd>{{ profile.hasPets ? (profile.petDetails || 'Yes') : 'No' }}</dd></div>
              <div><dt>Smoker</dt><dd>{{ profile.smoker ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Previous landlord</dt><dd>{{ profile.previousLandlordName || '—' }}</dd></div>
              <div><dt>Their phone</dt><dd class="mono">{{ profile.previousLandlordPhone || '—' }}</dd></div>
              <div><dt>Previous address</dt><dd>{{ profile.previousAddress || '—' }}</dd></div>
              <div><dt>Reason for leaving</dt><dd>{{ profile.reasonForLeaving || '—' }}</dd></div>
              <div><dt>Reference</dt><dd>{{ profile.referenceName || '—' }}</dd></div>
              <div><dt>Their phone</dt><dd class="mono">{{ profile.referencePhone || '—' }}</dd></div>
            </dl>

            @if (profile.aboutMe) {
              <p class="muted">{{ profile.aboutMe }}</p>
            }
          }

          @if (sharedDocuments().length > 0) {
            <h3 class="panel-title">Shared by the tenant</h3>
            <ul class="shared">
              @for (shared of sharedDocuments(); track shared.id) {
                <li class="shared__row">
                  <div class="shared__body">
                    <a class="record-link__primary" [routerLink]="RoutePaths.tenantDocumentDetail(shared.id)">
                      {{ shared.documentType | humanLabel }}
                    </a>
                    <span class="muted">{{ shared.fileName }}</span>
                  </div>
                  <span class="muted">v{{ shared.versionNumber ?? 1 }}</span>
                </li>
              }
            </ul>
          } @else if (awaitingShare()) {
            <p class="muted">
              Asked for their documents. Nothing is readable here until they approve —
              the originals are theirs.
            </p>
          }

          @if ((detail.documents ?? []).length === 0) {
            <p class="muted">Your agency has not filed any documents against this tenancy.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Document</th><th>Type</th><th>Version</th><th>Status</th><th class="actions-col">Actions</th></tr>
                </thead>
                <tbody>
                  @for (document of detail.documents ?? []; track document.id) {
                    <tr [appRowLink]="RoutePaths.tenantDocumentDetail(document.id)">
                      <td>
                        <a class="record-link__primary" [routerLink]="RoutePaths.tenantDocumentDetail(document.id)">
                          {{ document.fileName || ('Document #' + document.id) }}
                        </a>
                      </td>
                      <td>{{ document.documentType | humanLabel }}</td>
                      <td>
                        v{{ document.versionNumber ?? 1 }}
                        @if (document.isCurrentVersion) {
                          <span class="status-chip status-chip--info">Current</span>
                        }
                      </td>
                      <td>
                        <div class="chip-row">
                          <span class="status-chip" [ngClass]="documentStatusClass(document.status)">{{ document.status | humanLabel }}</span>
                          @if (document.isLockedBySnapshot) {
                            <span class="status-chip status-chip--neutral">Locked</span>
                          }
                        </div>
                      </td>
                      <td class="actions-col">
                        @if (document.fileUrl) {
                          <a class="btn btn-secondary btn-sm" [href]="document.fileUrl" target="_blank" rel="noopener">Open</a>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <app-permission-gate [permissions]="[Permissions.VERIFICATION_SNAPSHOT_CREATE]">
          <app-section-card [title]="currentSnapshot() ? 'Re-verify and reassign' : 'Verify and assign'">
            <p class="hint">
              Approving snapshots the tenant's identity documents, reserves the room and — when
              asked for below — issues the lease off the snapshot it just created.
            </p>

            <!--
              A tenant only ever has one current snapshot: verifying again supersedes
              the last rather than adding a rival. Saying so here is what stops two
              admins in an agency from reading a second snapshot as a contradiction.
            -->
            @if (currentSnapshot(); as snapshot) {
              <p class="hint">
                Snapshot #{{ snapshot.id }} is current — taken
                {{ formatDate(snapshot.snapshotDate) }} by {{ snapshot.verifiedByName || 'a landlord' }}@if (snapshot.roomName || snapshot.roomNumber) {
                  <span> for {{ snapshot.roomName || 'Room ' + snapshot.roomNumber }}</span>
                }.
                Approving again supersedes it; the old one stays as audit history, and any lease
                already issued from it is unaffected.
                <a
                  [routerLink]="RoutePaths.verificationSnapshotDetail(
                    detail.agencyId ?? agencyId(), detail.buildingId ?? buildingId(), detail.id, snapshot.id
                  )"
                >View snapshot</a>
              </p>
            }

            @if (supersededSnapshots().length > 0) {
              <details class="doc-select">
                <summary>{{ supersededSnapshots().length }} superseded snapshot(s)</summary>
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
              <div class="grid-auto">
                <label class="field">
                  <span>Decision</span>
                  <select formControlName="approved">
                    <option [ngValue]="true">Approve</option>
                    <option [ngValue]="false">Reject</option>
                  </select>
                </label>

                @if (verifyForm.controls.approved.value) {
                  <label class="field field--full">
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

              @if ((tenant()?.documents ?? []).length > 0) {
                <fieldset class="doc-select">
                  <legend>{{ verifyForm.controls.approved.value ? 'Documents to snapshot' : 'Documents to reject' }}</legend>
                  <div class="checkbox-grid">
                    @for (document of tenant()?.documents ?? []; track document.id) {
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
                </fieldset>
              }

              @if (verifyForm.controls.approved.value) {
                <app-permission-gate [permissions]="PermissionSets.LEASE_WRITE">
                  <fieldset class="doc-select">
                    <legend>Lease</legend>
                    <label class="checkbox-field">
                      <input type="checkbox" formControlName="issueLease">
                      <span>Generate the lease agreement from this verification</span>
                    </label>

                    @if (verifyForm.controls.issueLease.value) {
                      <!--
                        The dates the lease needs, bound to the same form the Leases
                        card submits — one set of values, whichever entry point the
                        operator uses.
                      -->
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
                        <span>Sign it off and record the move-in straight away</span>
                      </label>
                      <small class="hint">
                        Verification and the lease are one transaction — if the lease is refused, the
                        approval is rolled back with it. Move-in sits outside that: the box above
                        signs the draft and records it once the lease exists.
                      </small>
                    }
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
          </app-section-card>
        </app-permission-gate>

        <app-section-card title="Leases">
          <ng-container actions>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.leases" [queryParams]="{ tenantId: detail.id }">
              All leases
            </a>
          </ng-container>

          <app-permission-gate [permissions]="PermissionSets.LEASE_WRITE">
            <!--
              A lease is written against the verification snapshot, so there is
              nothing to generate until the tenant has been verified — say so
              rather than letting the backend answer with a validation error.
            -->
            @if (!currentSnapshot()) {
              <p class="muted">
                Verify this tenant first — the lease is issued against the verification snapshot.
              </p>
            } @else {
            <form class="stack" [formGroup]="leaseForm" appFormFeedback (ngSubmit)="generateLease()">
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
                <button type="submit" class="btn btn-primary" [disabled]="generatingLease()">
                  {{ generatingLease() ? 'Generating...' : 'Generate lease' }}
                </button>
                <span class="muted">
                  From snapshot #{{ currentSnapshot()!.id }}@if (currentSnapshot()!.roomName || currentSnapshot()!.roomNumber) {
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
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
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
  readonly acceptDocumentTypes = TENANT_DOCUMENT_TYPES.join(',');
  readonly maxDocumentMb = TENANT_DOCUMENT_MAX_MB;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly tenantId = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly profileGrants = inject(ProfileGrantsService);
  private readonly housing = inject(HousingService);
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

  readonly uploading = signal(false);
  readonly uploadError = signal<ApiError | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);

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
    activateLease: false
  });

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

  readonly uploadForm = this.formBuilder.group({
    documentType: 'NATIONAL_ID_FRONT'
  });

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
  submitLabel(): string {
    if (this.verifying()) {
      return 'Submitting...';
    }

    if (!this.verifyForm.controls.approved.value) {
      return 'Reject tenant';
    }

    const verb = this.currentSnapshot() ? 'Re-verify' : 'Approve';

    if (!this.verifyForm.controls.issueLease.value) {
      return `${verb} and reserve room`;
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

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError.set(null);

    if (!file) {
      this.selectedFile.set(null);
      return;
    }

    const problem = validateFile(file, { maxSizeMB: TENANT_DOCUMENT_MAX_MB, allowedTypes: TENANT_DOCUMENT_TYPES });
    if (problem) {
      this.fileError.set(problem);
      this.selectedFile.set(null);
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
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

    const issuingLease = approved && value.issueLease;
    if (issuingLease && this.leaseForm.invalid) {
      this.leaseForm.markAllAsTouched();
      return;
    }

    if (approved && value.roomId === null) {
      this.verifyErrorTitle.set('Unable to verify tenant');
      this.verifyError.set(localError('Choose the room to reserve for this tenant.'));
      return;
    }

    // Both decisions act on documents: approving snapshots them, rejecting marks them rejected.
    if (this.selectedDocumentIds().size === 0) {
      this.verifyErrorTitle.set('Unable to verify tenant');
      this.verifyError.set(localError(
        approved ? 'Select at least one document to snapshot.' : 'Select the documents this rejection applies to.'
      ));
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
      if (issuingLease) {
        const result = await firstValueFrom(this.tenantsService.verifyAndGenerateLease(agencyId, buildingId, tenantId, {
          verification: this.verificationRequest(),
          lease: this.leaseTerms()
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
      documentIds: [...this.selectedDocumentIds()]
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

  async uploadDocument(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.uploading.set(true);
    this.uploadError.set(null);

    try {
      await firstValueFrom(this.tenantsService.landlordUploadDocument(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        file,
        this.uploadForm.getRawValue().documentType as DocumentType
      ));

      this.selectedFile.set(null);
      await this.reload();
    } catch (error) {
      this.uploadError.set(toApiError(error));
    } finally {
      this.uploading.set(false);
    }
  }

  /** Documents reachable through an active grant, and whether one is pending. */
  readonly sharedDocuments = signal<SharedDocument[]>([]);
  readonly sharedProfile = signal<SharedRenterProfile | null>(null);
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
      const page = await firstValueFrom(this.profileGrants.getAgencyGrants(Number(agencyId), { size: 100 }));
      const mine = (page.items ?? []).filter((grant) => grant.tenantId === tenantId);

      const live = mine.filter((grant) => grant.currentlyValid);

      this.sharedDocuments.set(live.flatMap((grant) => grant.documents ?? []));
      // Carried on the grant itself, so no second request and no chance of
      // rendering a profile whose consent has since lapsed.
      this.sharedProfile.set(live.find((grant) => grant.tenancyProfile)?.tenancyProfile ?? null);
      this.awaitingShare.set(mine.some((grant) => grant.status === 'PENDING'));
    } catch {
      this.sharedDocuments.set([]);
      this.sharedProfile.set(null);
      this.awaitingShare.set(false);
    }
  }

  profileName(profile: SharedRenterProfile): string {
    return [profile.officialFirstName, profile.officialMiddleName, profile.officialLastName]
      .filter(Boolean).join(' ') || '—';
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
    this.selectedDocumentIds.set(new Set(this.snapshotableDocuments(tenant).map((document) => document.id)));

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
  private snapshotableDocuments(tenant: TenantFullDetail): TenantDocumentPreview[] {
    const documents = (tenant.documents ?? []).filter((document) => document.isCurrentVersion !== false);
    const submitted = documents.filter((document) => document.status === 'SUBMITTED');

    return submitted.length > 0 ? submitted : documents.filter((document) => document.status === 'ARCHIVED');
  }

  /**
   * Reads what a lease for this room would actually be written with. The room's
   * own columns are null whenever the building or agency sets the figure, so
   * prefilling from them showed a blank where the lease silently billed the
   * building's rent — this endpoint resolves the chain and says which level won.
   */
  private async loadRoomTerms(roomId: number | null, overwrite: boolean): Promise<void> {
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
      this.leaseError.set(localError('Verify this tenant first — a lease needs a verification snapshot.'));
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
      await this.reload();
    } catch (error) {
      this.leaseError.set(toApiError(error));
    } finally {
      this.generatingLease.set(false);
    }
  }
}
