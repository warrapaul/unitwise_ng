import { MoreMenuComponent } from '../../../shared/components/more-menu/more-menu.component';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { roomTitle } from '../../../shared/utils/format.util';
import { PageTitleService } from '../../../core/services/page-title.service';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { leaseRef } from '../../../shared/pipes/lease-ref.pipe';
import { ChangeDetectionStrategy, effect, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { NotificationService } from '../../../core/services/notification.service';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ContextSwitcherComponent } from '../../../shared/components/context-switcher/context-switcher.component';
import { TenantsService } from '../tenants.service';
import {
  LeaseSignature, LeaseDetail } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ContractsService } from '../../contracts/contracts.service';
import { ConfirmService } from '../../../shared/services/confirm.service';

import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { todayIso } from '../../../shared/utils/date.util';
@Component({
  selector: 'app-lease-detail-page',
  standalone: true,
  imports: [MoreMenuComponent, PhoneMenuComponent, DateDisplayDirective, CardTableDirective, MoneyPipe, DangerZoneComponent, 
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    ContextSwitcherComponent,
    RowLinkDirective,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    UnitPipe,
    StatusChipComponent,
    DialogComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.leases" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading lease..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (lease(); as detail) {
        <!-- Who and where lead; the lease number is reference, underneath. -->
        <app-section-card
          [title]="detail.tenantName || 'Lease'"
          [subtitle]="leaseSubtitle(detail)"
        >
          <ng-container actions>
            <div class="action-bar">
              @if (canDownloadPdf()) {
                <button type="button" class="btn btn-secondary" [disabled]="downloading()" (click)="downloadPdf()">
                  <svg class="btn__icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-download" /></svg>
                  {{ downloading() ? 'Preparing...' : 'Download PDF' }}
                </button>
              }
              <!--
                Both options, together. Offering only "Sign" made refusal
                indistinguishable from inaction: a tenant who objected to an
                amended contract had nothing to press, and the lease sat
                waiting as though they simply had not got round to it.
              -->
              @if (canDecide()) {
                <button type="button" class="btn btn-primary" [disabled]="signing()" (click)="sign()">
                  {{ signing() ? 'Signing...' : 'Sign this version' }}
                </button>
                <button type="button" class="btn btn-secondary" [disabled]="declining()" (click)="decline()">
                  {{ declining() ? 'Sending...' : 'Decline' }}
                </button>
              }
              <app-permission-gate [permissions]="[Permissions.LEASE_AGREEMENT_WRITE]">
                <!--
                  The step between the tenant submitting their details and the
                  lease going out for signature. The first render tolerated the
                  values nobody had been asked for yet; this one puts them in.
                -->
                <!-- A tenant with no account cannot sign in the app: staff record the paper copy. -->
                @if (canRecordPaper()) {
                  <button type="button" class="btn btn-secondary" (click)="paperOpen.set(true)">Record paper signature</button>
                }
                <!--
                  Both of the statuses a lease can be activated from. Naming
                  them beats excluding the two it cannot, which silently
                  included anything added to the enum later.
                -->
                <!--
                  Activating records the move-in (and the agency's signature, when a manual draft
                  has none — an issued lease is signed by the agency already). Offered until the
                  move-in is recorded, including on a lease the tenant signed first.
                -->
                @if ((detail.status === 'DRAFT' || detail.status === 'PENDING_SIGNATURE' || detail.status === 'ACTIVE') && !detail.moveInRecorded) {
                  <button type="button" class="btn btn-secondary" (click)="toggleActivation()">
                    {{ showActivation() ? 'Close' : activationLabel(detail) }}
                  </button>
                }
                <!-- The rest of what can be done to a lease, out of the way of the main action. -->
                <app-more-menu>
                  <button type="button" (click)="toggleRenewal()">{{ showRenewal() ? 'Close renewal' : 'Renew lease' }}</button>
                  <a [routerLink]="RoutePaths.amendments" [queryParams]="{ leaseAgreementId: detail.id, new: 1 }">Amend lease</a>
                  @if (canRefreshContract()) {
                    <button type="button" [disabled]="refreshing()" (click)="refreshContract()">{{ refreshing() ? 'Updating...' : 'Update contract text' }}</button>
                  }
                  <button type="button" (click)="share(detail)">Share link</button>
                  @if (detail.status === 'ACTIVE') {
                    <button type="button" class="danger" [disabled]="terminating()" (click)="terminate(detail)">Terminate lease</button>
                  }
                </app-more-menu>
              </app-permission-gate>
            </div>
          </ng-container>

          @if (detail.status === 'TERMINATED') {
            <p class="alert alert-warning">
              Terminated@if (detail.terminatedOn) { on {{ formatDate(detail.terminatedOn) }}}@if (detail.terminationReason) {: “{{ detail.terminationReason }}”}.
              It can no longer be edited.
            </p>
          }

          <p class="lease-status"><app-status-chip [status]="detail.status" /> <span class="muted">{{ detail.leaseType | humanLabel }}</span></p>

          <h3 class="group-title">Parties</h3>
          <dl class="detail-grid">
            <div><dt>Tenant</dt><dd>
              @if (tenantLink(detail); as link) { <a [routerLink]="link">{{ detail.tenantName }}</a> } @else { {{ detail.tenantName || '-' }} }
            </dd></div>
            <div><dt>Phone</dt><dd>@if (detail.tenantPhone) { <app-phone-menu [phone]="detail.tenantPhone" /> } @else { - }</dd></div>
            <div><dt>Email</dt><dd>@if (detail.tenantEmail) { <a class="wrap-anywhere" [href]="'mailto:' + detail.tenantEmail">{{ detail.tenantEmail }}</a> } @else { - }</dd></div>
          </dl>

          <h3 class="group-title">Property</h3>
          <dl class="detail-grid">
            <div><dt>Room</dt><dd>{{ roomTitle(detail.roomName || (detail.roomNumber != null ? '' + detail.roomNumber : '')) || '-' }}</dd></div>
            <div><dt>Building</dt><dd>{{ detail.buildingName || '-' }}</dd></div>
          </dl>

          <h3 class="group-title">Terms</h3>
          <dl class="detail-grid">
            <div><dt>Start date</dt><dd>{{ formatDate(detail.startDate) }}</dd></div>
            <div><dt>End date</dt><dd>{{ detail.endDate ? formatDate(detail.endDate) : 'Ongoing (month to month)' }}</dd></div>
            <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent | money }}</dd></div>
            <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit | money }}</dd></div>
            <div><dt>Rent due</dt><dd>{{ dueDay(detail.paymentDueDay) }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFeeAmount ? (detail.lateFeeAmount | money) : 'None' }}</dd></div>
            <div><dt>Grace period</dt><dd>{{ detail.gracePeriodDays ? (detail.gracePeriodDays | unit: 'days') + ' after the due date' : 'None' }}</dd></div>
            <div>
              <dt>Previous lease</dt>
              <dd>
                @if (detail.previousLeaseId) {
                  <a [routerLink]="RoutePaths.leaseDetail(detail.previousLeaseId)">
                    {{ detail.previousLeaseNumber || detail.previousLeaseId }}
                  </a>
                } @else {
                  None
                }
              </dd>
            </div>
          </dl>

          <!-- Both name the version: "Signed" alone was true of a document since replaced. -->
          <h3 class="group-title">Signatures</h3>
          <dl class="detail-grid">
            <div>
              <dt>Landlord signature</dt>
              <dd>{{ signatureLabel(detail.landlordSignature) }}</dd>
            </div>
            <div>
              <dt>Tenant signature</dt>
              <dd>
                {{ signatureLabel(detail.tenantSignature) }}
                @if (detail.tenantSignature?.decision === 'DECLINED' && detail.tenantSignature?.declineReason) {
                  <p class="muted">“{{ detail.tenantSignature?.declineReason }}”</p>
                }
              </dd>
            </div>
          </dl>

          @if (contractHtml(); as contract) {
            <!--
              Open, not collapsed behind a summary. This is the actual document
              with this tenancy's own values in it — not the sample-value
              preview the template editor shows — and on a lease page it is the
              thing worth reading, not a footnote.
            -->
            <!-- Collapsed: the figures above are what is usually checked; the document opens on demand. -->
            <details class="contract-panel disclosure">
              <summary class="contract-panel__head">
                <h3>Contract document</h3>
                @if (canRefreshContract()) {
                  <span class="status-chip status-chip--warning">Can still change</span>
                } @else {
                  <span class="status-chip status-chip--success" title="Signed, so this text can no longer change">Final</span>
                }
              </summary>

              <p class="hint">
                @if (canRefreshContract()) {
                  Built from the details entered so far. Anything the tenant has since submitted
                  is not in it until you rebuild the contract.
                } @else {
                  The document as it stood when this lease was issued. It is fixed — later changes
                  to the template or to the property do not reach it.
                }
              </p>

              <!--
                Server-rendered and server-sanitized: the document was frozen onto
                the lease at generation with its values already substituted, so the
                client neither resolves variables nor trusts unsanitized author HTML.
              -->
              <article class="contract-doc" [innerHTML]="contract"></article>
            </details>
          }

          @if (detail.notes) {
            <p class="muted">{{ detail.notes }}</p>
          }
        </app-section-card>

        <!-- Side by side on a wide screen; one column on a narrow one (styles.scss .card-pair). -->
        <div class="card-pair">
        @if (showActivation()) {
          <app-section-card [title]="activationLabel(detail)">
            <p class="hint">Activation applies to the building you are working in.</p>

            <app-context-switcher />

            <!--
              Not a <form>: no NgForm is in scope, so submitting reloaded the
              app rather than activating anything.
            -->
            <div>

              @if (activationError(); as apiError) {
                <app-error-card title="Unable to activate lease" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="activating() || !context.hasBuilding()"
                  (click)="activate(detail)"
                >
                  {{ activating() ? 'Saving...' : activationLabel(detail) }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleActivation()">Cancel</button>
              </div>
            </div>
          </app-section-card>
        }

        @if (showRenewal()) {
          <app-section-card title="Renew lease">
            <form [formGroup]="renewalForm" appFormFeedback (ngSubmit)="renew()">
              <div class="grid-auto">
                <label class="field">
                  <span>New start date</span>
                  <input type="date" formControlName="newStartDate">
                  @if (renewalForm.controls.newStartDate.invalid && renewalForm.controls.newStartDate.touched) {
                    <small class="error-text">A start date is required.</small>
                  }
                </label>
                <label class="field"><span>New end date</span><input type="date" formControlName="newEndDate"></label>
                <label class="field"><span>New monthly rent</span><input type="number" step="0.01" min="0" formControlName="newMonthlyRent" inputmode="decimal"></label>
                <label class="field"><span>New security deposit</span><input type="number" step="0.01" min="0" formControlName="newSecurityDeposit" inputmode="decimal"></label>
                <label class="field">
                  <span>Payment due day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay" inputmode="numeric">
                  @if (renewalForm.controls.paymentDueDay.invalid && renewalForm.controls.paymentDueDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field"><span>Late fee</span><input type="number" step="0.01" min="0" formControlName="lateFeeAmount" inputmode="decimal"></label>
                <label class="field"><span>Grace period (days)</span><input type="number" min="0" formControlName="gracePeriodDays" inputmode="numeric"></label>
                <label class="field">
                  <span>Lease type</span>
                  <select formControlName="leaseType">
                    <option value="FIXED_TERM">Fixed term</option>
                    <option value="MONTH_TO_MONTH">Month to month</option>
                    <option value="COMMERCIAL">Commercial</option>
                  </select>
                </label>
              </div>

              <label class="field field--wide">
                <span>Special terms</span>
                <textarea formControlName="specialTerms" rows="3"></textarea>
              </label>

              @if (renewError(); as apiError) {
                <app-error-card title="Unable to renew lease" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="renewing()">
                  {{ renewing() ? 'Renewing...' : 'Create renewal' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleRenewal()">Cancel</button>
              </div>
            </form>
          </app-section-card>
        }
        </div>

        <app-section-card title="Amendments">
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.LEASE_AMENDMENT_CREATE]">
              <a
                class="btn btn-secondary btn-sm"
                [routerLink]="RoutePaths.amendments"
                [queryParams]="{ leaseAgreementId: detail.id }"
              >
                Manage amendments
              </a>
            </app-permission-gate>
          </ng-container>

          <!--
            Not a footnote on the agreement any more. Applying one reissues the
            whole document from the template and archives the version before
            it, and because the tenant agreed to different words, their
            signature is cleared and has to be given again.
          -->
          <p class="hint">Applying an amendment creates a new version of the lease. The tenant signs it again.</p>

          @if ((detail.amendments ?? []).length === 0) {
            <p class="muted">No amendments recorded.</p>
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead>
                  <tr><th>Change</th><th>From</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (amendment of detail.amendments ?? []; track amendment.id) {
                    <tr [appRowLink]="RoutePaths.amendmentDetail(amendment.id)">
                      <td>
                        <a class="record-link__primary" [routerLink]="RoutePaths.amendmentDetail(amendment.id)">
                          {{ amendment.amendmentType | humanLabel }}
                        </a>
                      </td>
                      <td>{{ formatDate(amendment.effectiveDate) }}</td>
                      <td><app-status-chip [status]="amendment.status" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.LEASE_AGREEMENT_DELETE]">
          <!-- Only a draft can be deleted (the server refuses the rest): a signed lease is ended with Terminate. -->
          @if (detail.status === 'DRAFT') {
            <app-danger-zone label="Delete lease" message="Removes this lease and its versions. This cannot be undone." [busy]="deleting()" (pressed)="remove(detail)" />
          }
        </app-permission-gate>
      }
    </section>

    @if (paperOpen() && lease(); as detail) {
      <app-dialog title="Record paper signature" [subtitle]="detail.tenantName || null" (closed)="paperOpen.set(false)">
        <form id="paper-signature" class="stack" [formGroup]="paperForm" (ngSubmit)="recordPaper(detail)">
          <label class="field">
            <span>Date on the signed copy</span>
            <input type="date" formControlName="signedOn">
          </label>
          <label class="field">
            <span>Note</span>
            <input formControlName="note">
          </label>
          @if (paperError(); as apiError) {
            <app-error-card title="Not recorded" [message]="apiError.message" [details]="apiError.details" />
          }
        </form>
        <div dialog-actions>
          <button type="submit" form="paper-signature" class="btn btn-primary" [disabled]="paperSaving()">
            {{ paperSaving() ? 'Recording...' : 'Record signature' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="paperOpen.set(false)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .group-title { margin: var(--space-2) 0 0; font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
    .lease-status { margin: 0; display: flex; gap: var(--space-2); align-items: center; }
    .btn__icon { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; }
    .contract-panel {
      border-top: 1px solid var(--border);
      padding-top: var(--space-4);
    }

    /* A disclosure that looks like one: a full-width row with a chevron and a hover state. */
    .contract-panel__head { min-height: 2.75rem; cursor: pointer; }
    .contract-panel__head:hover { background: var(--surface-2, #f4f5f2); }
    .contract-panel__head {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-wrap: wrap;
    }

    .contract-panel__head h3 { margin: 0; font-size: var(--text-base); }

    form {
      display: grid;
      gap: var(--space-5);
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    details p {
      margin: var(--space-2) 0 0;
      white-space: pre-wrap;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaseDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly contracts = inject(ContractsService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly context = inject(ActiveContextService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly downloading = signal(false);

  /**
   * The rendered contract, trusted because the server sanitized it against the
   * jsoup allowlist before freezing it onto the lease.
   */
  readonly contractHtml = computed<SafeHtml | null>(() => {
    const terms = this.lease()?.contractDocument;
    return terms ? this.sanitizer.bypassSecurityTrustHtml(terms) : null;
  });

  /** Whoever is preparing the lease, as opposed to the tenant receiving it. */
  private readonly canManageLease = computed(() =>
    this.context.can(PermissionConstants.LEASE_AGREEMENT_WRITE));

  /**
   * Offered to anyone who can open the lease. The lease carries its own agency
   * and building now, so an admin takes the scoped route; a tenant, who has no
   * agency selected anywhere, takes the route authorized by owning the lease.
   *
   * Not while it is a draft, though — the server refuses a tenant's download
   * of one, and rightly: a draft is still being prepared and is not theirs to
   * act on. Staff keep it, because checking the document before issuing it is
   * the whole reason a draft exists.
   */
  readonly canDownloadPdf = computed(() =>
    this.lease() !== null && (this.canManageLease() || this.lease()?.status !== 'DRAFT'));

  /** Null when the ids are absent, which is the signal to use the tenant route. */
  private readonly pdfScope = computed(() => {
    const lease = this.lease();
    const agencyId = lease?.agencyId ?? this.context.agencyId();
    const buildingId = lease?.buildingId ?? this.context.buildingId();

    return agencyId !== null && agencyId !== undefined && buildingId !== null && buildingId !== undefined
      ? { agencyId, buildingId }
      : null;
  });
  readonly lease = signal<LeaseDetail | null>(null);
  private readonly pageTitles = inject(PageTitleService);
  /** The app bar names whose lease and which room, not "Lease detail". */
  private readonly namesTitle = effect(() => {
    const lease = this.lease();
    if (lease) {
      const room = lease.roomName || (lease.roomNumber != null ? String(lease.roomNumber) : '');
      this.pageTitles.set([lease.tenantName, room ? roomTitle(room) : ''].filter(Boolean).join(' · ') || 'Lease');
    }
  });

  /** Only while the document can still change — the server refuses after that. */
  readonly canRefreshContract = computed(() => {
    const status = this.lease()?.status;
    return status === 'DRAFT' || status === 'PENDING_SIGNATURE';
  });

  /**
   * The tenant may act while the version in force is one they have not
   * already signed. A previous version they signed does not count — that
   * agreement was given to different wording.
   */
  readonly canDecide = computed(() => {
    const lease = this.lease();
    if (!lease || (lease.status !== 'PENDING_SIGNATURE' && lease.status !== 'ACTIVE')) {
      return false;
    }
    // Signing is the tenant's own act: offered only on their "My lease" page.
    // The agency signs separately; this endpoint refuses anyone else (403).
    return this.mine && lease.tenantSignature?.decision !== 'SIGNED';
  });

  private readonly mine = inject(ActivatedRoute).snapshot.data['mine'] === true;

  /** Staff, a live contract, and no tenant signature on it yet. The server refuses a claimed account. */
  readonly canRecordPaper = computed(() => {
    const lease = this.lease();
    return !this.mine
      && !!lease
      && (lease.status === 'DRAFT' || lease.status === 'PENDING_SIGNATURE')
      && lease.tenantSignature?.decision !== 'SIGNED'
      && this.context.can('LEASE_AGREEMENT_WRITE');
  });

  readonly paperOpen = signal(false);
  readonly paperSaving = signal(false);
  readonly paperError = signal<ApiError | null>(null);
  readonly paperForm = inject(NonNullableFormBuilder).group({ signedOn: todayIso(), note: '' });

  async recordPaper(lease: LeaseDetail): Promise<void> {
    const value = this.paperForm.getRawValue();
    this.paperSaving.set(true);
    this.paperError.set(null);
    try {
      this.lease.set(await firstValueFrom(this.tenantsService.recordPaperSignature(lease.id, {
        signedOn: value.signedOn || null,
        note: value.note.trim() || null
      })));
      this.paperOpen.set(false);
    } catch (error) {
      this.paperError.set(toApiError(error));
    } finally {
      this.paperSaving.set(false);
    }
  }

  readonly declining = signal(false);
  readonly refreshing = signal(false);
  readonly signing = signal(false);
  readonly activating = signal(false);
  readonly deleting = signal(false);

  readonly showActivation = signal(false);
  readonly activationError = signal<ApiError | null>(null);

  readonly showRenewal = signal(false);
  readonly renewing = signal(false);
  readonly renewError = signal<ApiError | null>(null);

  readonly renewalForm = this.formBuilder.group({
    newStartDate: ['', [Validators.required]],
    newEndDate: '',
    newMonthlyRent: [null as number | null, [Validators.min(0)]],
    newSecurityDeposit: [null as number | null, [Validators.min(0)]],
    paymentDueDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
    lateFeeAmount: [null as number | null, [Validators.min(0)]],
    gracePeriodDays: [null as number | null, [Validators.min(0)]],
    leaseType: 'FIXED_TERM',
    specialTerms: ''
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.lease.set(await firstValueFrom(this.tenantsService.getLease(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Re-renders the stored document. Strict, so a missing required value comes
   * back as a refusal naming it — which is the point: better here than at
   * signature, and better than a contract with a gap in it.
   */
  async refreshContract(): Promise<void> {
    const lease = this.lease();
    if (!lease) {
      return;
    }

    this.refreshing.set(true);

    try {
      this.lease.set(await firstValueFrom(this.tenantsService.refreshLeaseContract(lease.id)));
      this.notifications.push('success', 'The contract has been rebuilt from the latest details.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.refreshing.set(false);
    }
  }

  /** Names the version, so "signed" can never be read as "signed this one". */
  readonly roomTitle = roomTitle;
  readonly terminating = signal(false);

  /** Ends it early, with a reason the record keeps. The tenant stays until a move-out is recorded. */
  async terminate(lease: LeaseDetail): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Terminate this lease?',
      message: `The lease ends today and ${lease.tenantName || 'the tenant'} is moved out of ${lease.roomName ? roomTitle(lease.roomName) : 'the room'}, which becomes vacant. Rent already billed stays owed.`,
      confirmLabel: 'Terminate lease',
      destructive: true,
      reason: { label: 'Why is it ending?', required: true }
    });
    if (reason === null) {
      return;
    }
    this.terminating.set(true);
    try {
      this.lease.set(await firstValueFrom(this.tenantsService.terminateLease(lease.id, { reason })));
      this.notifications.push('success', 'Lease terminated and the tenant moved out.');
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.terminating.set(false);
    }
  }

  /** The phone's share sheet where there is one; otherwise the link is copied. */
  async share(lease: LeaseDetail): Promise<void> {
    const url = location.href;
    const title = `Lease · ${lease.tenantName ?? ''}`.trim();
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.notifications.push('success', 'Link copied.');
    } catch {
      // Cancelled by the user, or not allowed here: nothing to say.
    }
  }

  /** "Room 2-1 · Acacia Court · LA-0042": where, then the reference. */
  leaseSubtitle(lease: LeaseDetail): string {
    const room = roomTitle(lease.roomName || (lease.roomNumber != null ? String(lease.roomNumber) : ''));
    return [room, lease.buildingName, lease.leaseNumber ? leaseRef(lease.leaseNumber) : null].filter(Boolean).join(' · ');
  }

  tenantLink(lease: LeaseDetail): string | null {
    return !this.mine && lease.agencyId && lease.buildingId && lease.tenantId
      ? RoutePaths.tenantDetail(lease.agencyId, lease.buildingId, lease.tenantId) : null;
  }

  /** "5th of each month". */
  dueDay(day: number | null | undefined): string {
    if (!day) {
      return '-';
    }
    const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
    return `${day}${suffix} of each month`;
  }

  signatureLabel(signature: LeaseSignature | null | undefined): string {
    if (!signature) {
      return 'Not yet signed';
    }

    const when = this.formatDate(signature.at);
    const version = signature.documentVersion ? ` · v${signature.documentVersion}` : '';
    if (signature.decision === 'DECLINED') {
      return `Declined ${when}${version}`;
    }
    return signature.signedOffline
      ? `Signed on paper ${when}${version}`
      : `Signed ${when}${version}`;
  }

  /**
   * Refusing needs a reason, and the server enforces that too — a rejection
   * with no reason tells the landlord only that something is wrong.
   */
  async decline(): Promise<void> {
    const lease = this.lease();
    if (!lease) {
      return;
    }

    const reason = await this.confirm.askForReason({
      title: 'Decline this version of the agreement?',
      message: 'Your tenancy continues and nothing is cancelled. The landlord is told you object '
        + 'and why, and this version cannot become active while your refusal stands.',
      confirmLabel: 'Send my objection',
      reason: {
        label: 'Why are you declining?',
        placeholder: 'e.g. The rent stated in clause 3.1 is not what we agreed',
        hint: 'The landlord will read this.',
        required: true,
        maxLength: 500
      }
    });

    if (reason === null) {
      return;
    }

    this.declining.set(true);

    try {
      this.lease.set(await firstValueFrom(this.tenantsService.tenantDeclineLease(lease.id, reason)));
      this.notifications.push('success', 'Your objection has been recorded and sent to the landlord.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.declining.set(false);
    }
  }

  /**
   * "Activate" only while the agency has yet to sign. An issued lease is signed by the agency
   * already, and an active one is signed by both, so what is left is only the move-in.
   */
  activationLabel(lease: LeaseDetail): string {
    return lease.status === 'ACTIVE' || lease.landlordSignature?.decision === 'SIGNED'
      ? 'Record move-in'
      : 'Activate lease';
  }

  toggleActivation(): void {
    this.showActivation.update((value) => !value);
    this.activationError.set(null);
  }

  async toggleRenewal(): Promise<void> {
    this.showRenewal.update((value) => !value);
    this.renewError.set(null);
  }

  /**
   * Streams the server-rendered PDF. Rendered server-side so the agency's copy
   * and the tenant's are the same bytes — a browser print would differ per
   * browser and per OS, which is not acceptable for a signed document.
   */
  async downloadPdf(): Promise<void> {
    const lease = this.lease();
    if (!lease) {
      return;
    }

    this.downloading.set(true);

    try {
      const blob = await firstValueFrom(this.contracts.downloadLeasePdf(lease.id, this.pdfScope()));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${lease.leaseNumber || 'lease-' + lease.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }

  async sign(): Promise<void> {
    this.signing.set(true);
    this.error.set(null);

    try {
      this.lease.set(await firstValueFrom(this.tenantsService.tenantSignLease(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.signing.set(false);
    }
  }

  async activate(lease: LeaseDetail): Promise<void> {
    const agencyId = this.context.agencyId();
    const buildingId = this.context.buildingId();
    if (agencyId === null || buildingId === null) {
      return;
    }

    this.activating.set(true);
    this.activationError.set(null);

    try {
      this.lease.set(await firstValueFrom(
        this.tenantsService.activateLease(agencyId, buildingId, lease.id)
      ));
      this.showActivation.set(false);
    } catch (error) {
      this.activationError.set(toApiError(error));
    } finally {
      this.activating.set(false);
    }
  }

  async renew(): Promise<void> {
    if (this.renewalForm.invalid) {
      this.renewalForm.markAllAsTouched();
      return;
    }

    this.renewing.set(true);
    this.renewError.set(null);

    const value = this.renewalForm.getRawValue();

    try {
      const renewed = await firstValueFrom(this.tenantsService.renewLease(Number(this.id()), {
        newStartDate: value.newStartDate,
        newEndDate: value.newEndDate || null,
        newMonthlyRent: value.newMonthlyRent,
        newSecurityDeposit: value.newSecurityDeposit,
        paymentDueDay: value.paymentDueDay,
        lateFeeAmount: value.lateFeeAmount,
        gracePeriodDays: value.gracePeriodDays,
        leaseType: value.leaseType as never,
        specialTerms: value.specialTerms || null
      }));

      await this.router.navigateByUrl(RoutePaths.leaseDetail(renewed.id));
    } catch (error) {
      this.renewError.set(toApiError(error));
    } finally {
      this.renewing.set(false);
    }
  }

  async remove(lease: LeaseDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete ${lease.leaseNumber ? leaseRef(lease.leaseNumber) : 'this lease'}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.tenantsService.deleteLease(lease.id));
      await this.router.navigateByUrl(RoutePaths.leases);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }



  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDateTime(date);
  }
}
