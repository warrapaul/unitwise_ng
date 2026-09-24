import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { VerificationSnapshotDetail } from '../models/tenant.models';
import { RoomLinkComponent } from '../../../shared/components/room-link/room-link.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { DatePipe } from '@angular/common';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ProfileGrantsService } from '../profile-grants/profile-grants.service';
import { SnapshotAccessGrant } from '../models/profile-grant.models';

@Component({
  selector: 'app-snapshot-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, 
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    RoomLinkComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    DatePipe,
    EntityPickerComponent,
    FieldErrorComponent,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.tenantDetail(agencyId(), buildingId(), tenantId())" label="Back to tenant" />
      @if (loading()) {
        <app-loading-state label="Loading snapshot..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (snapshot(); as detail) {
        <app-section-card [title]="fullName(detail)" [subtitle]="detail.snapshotType || null">
          <ng-container actions>
            <div class="action-bar">
              <button type="button" class="btn btn-secondary" [disabled]="checkingIntegrity()" (click)="checkIntegrity()">
                {{ checkingIntegrity() ? 'Checking...' : 'Verify integrity' }}
              </button>
              <app-permission-gate [permissions]="[Permissions.VERIFICATION_SNAPSHOT_WRITE_ALL, Permissions.VERIFICATION_SNAPSHOT_WRITE]">
                @if (detail.isCurrent) {
                  <button type="button" class="btn btn-secondary" [disabled]="marking()" (click)="markNotCurrent()">
                    {{ marking() ? 'Updating...' : 'Mark not current' }}
                  </button>
                }
              </app-permission-gate>
            </div>
          </ng-container>

          @if (integrityResult() !== null) {
            <section
              class="alert"
              [class.alert-success]="integrityResult()"
              [class.alert-error]="!integrityResult()"
              role="status"
            >
              <strong>{{ integrityResult() ? 'Integrity verified' : 'Integrity check failed' }}</strong>
              <p>
                {{ integrityResult()
                  ? 'The stored hash matches the snapshot contents.'
                  : 'The stored hash does not match the snapshot contents.' }}
              </p>
            </section>
          }

          <dl class="detail-grid">
            <div>
              <dt>Currency</dt>
              <dd>
                <span class="status-chip" [ngClass]="detail.isCurrent ? 'status-chip--success' : 'status-chip--neutral'">
                  {{ detail.isCurrent ? 'Current' : 'Superseded' }}
                </span>
              </dd>
            </div>
            <div>
              <dt>Room reserved</dt>
              <dd>
                @if (detail.roomId) {
                  <app-room-link
                    [agencyId]="agencyId()"
                    [buildingId]="buildingId()"
                    [roomId]="detail.roomId"
                    [roomNumber]="detail.roomNumber"
                    [roomName]="detail.roomName"
                  />
                } @else {
                  -
                }
              </dd>
            </div>
            <div><dt>Snapshot date</dt><dd>{{ formatDateTime(detail.snapshotDate) }}</dd></div>
            <div><dt>Verified by</dt><dd>{{ detail.verifiedByName || '-' }}</dd></div>
            <div><dt>Tenant type</dt><dd>{{ detail.tenantType | humanLabel }}</dd></div>
            <div><dt>Email</dt><dd>{{ detail.email || '-' }}</dd></div>
            <div><dt>Phone</dt><dd class="mono">{{ detail.phoneNumber || '-' }}</dd></div>
            <div><dt>National ID</dt><dd class="mono">{{ detail.nationalIdNumber || '-' }}</dd></div>
            <div><dt>Contact person</dt><dd>{{ detail.contactPerson || '-' }}</dd></div>
            <div><dt>Emergency contact</dt><dd>{{ detail.emergencyContactName || '-' }}</dd></div>
            <div><dt>Emergency phone</dt><dd class="mono">{{ detail.emergencyContactPhone || '-' }}</dd></div>
            <div><dt>Hash</dt><dd class="mono truncate">{{ detail.snapshotHash || '-' }}</dd></div>
            <div><dt>IPFS CID</dt><dd class="mono truncate">{{ detail.ipfsCid || '-' }}</dd></div>
          </dl>

          @if (detail.verificationNotes) {
            <p class="muted">{{ detail.verificationNotes }}</p>
          }
        </app-section-card>

        <app-section-card title="Snapshotted documents">
          @if ((detail.documentReferences ?? []).length === 0) {
            <p class="muted">No documents were captured in this snapshot.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Document</th><th>Type</th></tr>
                </thead>
                <tbody>
                  @for (reference of detail.documentReferences ?? []; track reference.id) {
                    <tr [appRowLink]="reference.documentId ? RoutePaths.tenantDocumentDetail(agencyId(), buildingId(), tenantId(), reference.documentId) : null">
                      <td>
                        @if (reference.documentId) {
                          <a [routerLink]="RoutePaths.tenantDocumentDetail(agencyId(), buildingId(), tenantId(), reference.documentId)">
                            {{ reference.fileName || ('Document #' + reference.documentId) }}
                          </a>
                        } @else {
                          {{ reference.fileName || '-' }}
                        }
                      </td>
                      <td>{{ reference.documentType | humanLabel }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <app-permission-gate [permissions]="[Permissions.VERIFICATION_SNAPSHOT_WRITE_ALL, Permissions.VERIFICATION_SNAPSHOT_WRITE]">
          <app-section-card title="Anchor to IPFS">
            <form [formGroup]="ipfsForm" appFormFeedback (ngSubmit)="saveIpfsCid()">
              <div class="grid-auto">
                <label class="field">
                  <span>IPFS CID</span>
                  <input formControlName="ipfsCid" placeholder="bafy...">
                  @if (ipfsForm.controls.ipfsCid.invalid && ipfsForm.controls.ipfsCid.touched) {
                    <small class="error-text">A CID is required.</small>
                  }
                </label>
              </div>

              @if (ipfsError(); as apiError) {
                <app-error-card title="Unable to save CID" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="savingIpfs()">
                  {{ savingIpfs() ? 'Saving...' : 'Save CID' }}
                </button>
              </div>
            </form>
          </app-section-card>
        </app-permission-gate>

        <!--
          Sealing closes the files, never the record. A sealed snapshot keeps
          its date, its verifier and the details captured at the time readable,
          because a lease that cannot show it was verified is worth nothing in
          a dispute.

          It is not an action anyone takes: the backend seals a snapshot a
          month after the tenancy ends. So there is no seal button here — only
          the state, and the way back in.

          Re-opening is granted to a named person, never to an agency, and both
          a reason and an expiry are required — an unexplained or unbounded
          unseal is indistinguishable from never having sealed it.
        -->
        <app-permission-gate [permissions]="[Permissions.SNAPSHOT_UNSEAL]">
          <app-section-card
            title="Sealed access"
            [subtitle]="detail.accessState === 'SEALED'
              ? 'The documents are closed. Re-open them for one person, for a stated reason.'
              : 'Sealing happens on its own a month after the tenancy ends. Nobody triggers it.'"
          >
            <ng-container actions>
              @if (detail.accessState === 'SEALED') {
                <span class="status-chip status-chip--neutral">Sealed</span>
              }
              <button type="button" class="btn btn-secondary" (click)="toggleGrantForm()">
                {{ granting() ? 'Cancel' : 'Grant access' }}
              </button>
            </ng-container>

            @if (detail.sealedAt) {
              <p class="muted">
                Sealed automatically on {{ detail.sealedAt | date: 'd MMM y' }}{{ detail.sealedReason ? ' — ' + detail.sealedReason : '' }}
              </p>
            }

            @if (granting()) {
              <form class="stack" [formGroup]="grantForm" appFormFeedback (ngSubmit)="grantAccess()">
                <div class="grid-auto">
                  <label class="field">
                    <span>Who</span>
                    <app-entity-picker
                      [config]="pickers.user"
                      formControlName="grantedToUserId"
                      placeholder="Search for the person"
                    />
                    <app-field-error [control]="grantForm.controls.grantedToUserId" label="Person" />
                    <small class="hint">A named individual, not an agency. You cannot grant this to yourself.</small>
                  </label>

                  <label class="field">
                    <span>Access ends</span>
                    <input type="date" formControlName="expiresAt" [min]="tomorrow">
                    <app-field-error [control]="grantForm.controls.expiresAt" label="Expiry" />
                  </label>
                </div>

                <label class="field field--wide">
                  <span>Why</span>
                  <textarea
                    formControlName="reason"
                    rows="2"
                    placeholder="Deposit dispute ref DR-2026-041; tenant contests deduction for damages."
                  ></textarea>
                  <app-field-error [control]="grantForm.controls.reason" label="Reason" />
                </label>

                @if (grantError(); as apiError) {
                  <app-error-card title="Unable to grant access" [message]="apiError.message" [details]="apiError.details" />
                }

                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="savingGrant()">
                    {{ savingGrant() ? 'Granting...' : 'Grant access' }}
                  </button>
                  <button type="button" class="btn btn-secondary" (click)="toggleGrantForm()">Cancel</button>
                </div>
              </form>
            }

            @if (loadingGrants()) {
              <app-loading-state label="Loading grants..." [compact]="true" />
            } @else if (grants().length === 0) {
              <p class="muted">Nobody has been let in.</p>
            } @else {
              <ul class="grants">
                @for (grant of grants(); track grant.id) {
                  <li class="grant">
                    <div class="grant__body">
                      <p class="grant__who">
                        {{ grant.grantedToName || 'User #' + grant.grantedToUserId }}
                        @if (grant.currentlyValid) {
                          <span class="status-chip status-chip--success">Open now</span>
                        } @else {
                          <span class="status-chip status-chip--neutral">{{ grant.status | humanLabel }}</span>
                        }
                      </p>
                      <p class="muted">{{ grant.reason }}</p>
                      <p class="muted">
                        By {{ grant.grantedByName || 'an administrator' }}@if (grant.expiresAt) {<span>
                        · until {{ grant.expiresAt | date: 'd MMM y' }}</span>}
                      </p>
                    </div>

                    @if (grant.currentlyValid) {
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        [disabled]="savingGrant()"
                        (click)="revokeGrant(grant)"
                      >Withdraw</button>
                    }
                  </li>
                }
              </ul>
            }
          </app-section-card>
        </app-permission-gate>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.VERIFICATION_SNAPSHOT_DELETE_ALL, Permissions.VERIFICATION_SNAPSHOT_DELETE]">
          <app-danger-zone label="Delete snapshot" [busy]="deleting()" (pressed)="remove()" />
        </app-permission-gate>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .truncate {
      overflow-wrap: anywhere;
    }

    .grants { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }

    .grant {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    .grant__body { display: grid; gap: 0.2rem; min-width: 0; flex: 1; }

    .grant__who {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin: 0;
      font-weight: 700;
    }

    .grant__body p { margin: 0; }

    p {
      margin: 0;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SnapshotDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly tenantId = input.required<string>();
  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly profileGrants = inject(ProfileGrantsService);
  private readonly router = inject(Router);
  readonly pickers = inject(EntityPickerRegistry);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly snapshot = signal<VerificationSnapshotDetail | null>(null);

  readonly deleting = signal(false);
  readonly marking = signal(false);
  readonly checkingIntegrity = signal(false);
  readonly integrityResult = signal<boolean | null>(null);

  readonly savingIpfs = signal(false);
  readonly ipfsError = signal<ApiError | null>(null);

  readonly ipfsForm = this.formBuilder.group({
    ipfsCid: ['', [Validators.required]]
  });

  readonly grants = signal<SnapshotAccessGrant[]>([]);
  readonly loadingGrants = signal(false);
  readonly granting = signal(false);
  readonly savingGrant = signal(false);
  readonly grantError = signal<ApiError | null>(null);

  /** A date input needs a floor; today would already be past by evening. */
  readonly tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  /** Reason and expiry are both required — the backend refuses either missing. */
  readonly grantForm = this.formBuilder.group({
    grantedToUserId: [null as number | null, [Validators.required]],
    reason: ['', [Validators.required, Validators.maxLength(1000)]],
    expiresAt: ['', [Validators.required]]
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
    void this.loadGrants();
  }

  /**
   * The audit view, loaded separately from the snapshot: a caller without
   * SNAPSHOT_UNSEAL gets a 403 here, which must not take the page with it.
   */
  private async loadGrants(): Promise<void> {
    this.loadingGrants.set(true);

    try {
      this.grants.set(await firstValueFrom(this.profileGrants.getSnapshotGrants(Number(this.id()))));
    } catch {
      this.grants.set([]);
    } finally {
      this.loadingGrants.set(false);
    }
  }

  toggleGrantForm(): void {
    this.grantError.set(null);
    this.grantForm.reset({ grantedToUserId: null, reason: '', expiresAt: '' });
    this.granting.update((open) => !open);
  }

  async grantAccess(): Promise<void> {
    if (this.grantForm.invalid) {
      this.grantForm.markAllAsTouched();
      return;
    }

    const value = this.grantForm.getRawValue();

    if (!await this.confirm.ask({
      title: 'Re-open this snapshot?',
      message: 'The person you name will be able to read the documents until the expiry, and '
        + 'every time they open them is counted against your name.',
      confirmLabel: 'Grant access'
    })) {
      return;
    }

    this.savingGrant.set(true);
    this.grantError.set(null);

    try {
      await firstValueFrom(this.profileGrants.grantSnapshotAccess(Number(this.id()), {
        grantedToUserId: value.grantedToUserId!,
        reason: value.reason.trim(),
        // A date input gives a day, not an instant; access runs to its end.
        expiresAt: `${value.expiresAt}T23:59:59`
      }));

      this.granting.set(false);
      await this.loadGrants();
    } catch (error) {
      this.grantError.set(toApiError(error));
    } finally {
      this.savingGrant.set(false);
    }
  }

  async revokeGrant(grant: SnapshotAccessGrant): Promise<void> {
    if (!await this.confirm.ask({
      title: `Withdraw ${grant.grantedToName || 'this access'}?`,
      message: 'They lose access immediately. What they already read cannot be recalled.',
      confirmLabel: 'Withdraw',
      destructive: true
    })) {
      return;
    }

    this.savingGrant.set(true);

    try {
      await firstValueFrom(this.profileGrants.revokeSnapshotAccess(grant.id));
      await this.loadGrants();
    } catch (error) {
      this.grantError.set(toApiError(error));
    } finally {
      this.savingGrant.set(false);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const snapshot = await firstValueFrom(this.tenantsService.getSnapshot(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        Number(this.id())
      ));
      this.snapshot.set(snapshot);
      this.ipfsForm.patchValue({ ipfsCid: snapshot.ipfsCid ?? '' });
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async checkIntegrity(): Promise<void> {
    this.checkingIntegrity.set(true);
    this.integrityResult.set(null);
    this.error.set(null);

    try {
      this.integrityResult.set(await firstValueFrom(this.tenantsService.verifySnapshotIntegrity(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        Number(this.id())
      )));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.checkingIntegrity.set(false);
    }
  }

  async markNotCurrent(): Promise<void> {
    if (!await this.confirm.ask({ title: 'Mark this snapshot as no longer current?' })) {
      return;
    }

    this.marking.set(true);
    this.error.set(null);

    try {
      this.snapshot.set(await firstValueFrom(this.tenantsService.markSnapshotNotCurrent(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        Number(this.id())
      )));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.marking.set(false);
    }
  }

  async saveIpfsCid(): Promise<void> {
    if (this.ipfsForm.invalid) {
      this.ipfsForm.markAllAsTouched();
      return;
    }

    this.savingIpfs.set(true);
    this.ipfsError.set(null);

    try {
      this.snapshot.set(await firstValueFrom(this.tenantsService.setSnapshotIpfsCid(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        Number(this.id()),
        this.ipfsForm.getRawValue().ipfsCid
      )));
    } catch (error) {
      this.ipfsError.set(toApiError(error));
    } finally {
      this.savingIpfs.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Delete this verification snapshot?',
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.tenantsService.deleteSnapshot(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.tenantId()),
        Number(this.id())
      ));
      await this.router.navigateByUrl(RoutePaths.tenantDetail(this.agencyId(), this.buildingId(), this.tenantId()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }

  fullName(snapshot: VerificationSnapshotDetail): string {
    return [snapshot.firstName, snapshot.middleName, snapshot.lastName].filter(Boolean).join(' ')
      || `Snapshot #${snapshot.id}`;
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
