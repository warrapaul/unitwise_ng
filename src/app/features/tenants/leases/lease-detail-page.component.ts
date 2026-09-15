import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
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
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ContextSwitcherComponent } from '../../../shared/components/context-switcher/context-switcher.component';
import { TenantsService } from '../tenants.service';
import { LeaseDetail } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ContractsService } from '../../contracts/contracts.service';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-lease-detail-page',
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
    ContextSwitcherComponent,
    RowLinkDirective,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    UnitPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.leases" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading lease..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (lease(); as detail) {
        <app-section-card
          [title]="detail.leaseNumber || ('Lease #' + detail.id)"
          [subtitle]="detail.tenantName || null"
        >
          <ng-container actions>
            <div class="button-row">
              @if (canDownloadPdf()) {
                <button type="button" class="btn btn-secondary" [disabled]="downloading()" (click)="downloadPdf()">
                  {{ downloading() ? 'Preparing...' : 'Download PDF' }}
                </button>
              }
              @if (detail.status === 'PENDING_SIGNATURE' && !detail.tenantSignedAt) {
                <button type="button" class="btn btn-primary" [disabled]="signing()" (click)="sign()">
                  {{ signing() ? 'Signing...' : 'Sign as tenant' }}
                </button>
              }
              <app-permission-gate [permissions]="[Permissions.LEASE_AGREEMENT_WRITE]">
                @if (detail.status !== 'ACTIVE' && detail.status !== 'TERMINATED') {
                  <button type="button" class="btn btn-secondary" (click)="toggleActivation()">
                    {{ showActivation() ? 'Close activation' : 'Activate' }}
                  </button>
                }
                <button type="button" class="btn btn-secondary" (click)="toggleRenewal()">
                  {{ showRenewal() ? 'Close renewal' : 'Renew' }}
                </button>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.LEASE_AGREEMENT_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
                </button>
              </app-permission-gate>
            </div>
          </ng-container>

          @if (detail.status === 'TERMINATED') {
            <p class="hint">This lease is terminated and can no longer be edited.</p>
          }

          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Type</dt><dd>{{ detail.leaseType | humanLabel }}</dd></div>
            <div><dt>Tenant</dt><dd>{{ detail.tenantName || '-' }}</dd></div>
            <div><dt>Tenant email</dt><dd>{{ detail.tenantEmail || '-' }}</dd></div>
            <div><dt>Tenant phone</dt><dd class="mono">{{ detail.tenantPhone || '-' }}</dd></div>
            <div><dt>Room</dt><dd>{{ detail.roomName || detail.roomNumber || '-' }}</dd></div>
            <div><dt>Building</dt><dd>{{ detail.buildingName || '-' }}</dd></div>
            <div><dt>Start date</dt><dd>{{ formatDate(detail.startDate) }}</dd></div>
            <div><dt>End date</dt><dd>{{ formatDate(detail.endDate) }}</dd></div>
            <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent ?? '-' }}</dd></div>
            <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit ?? '-' }}</dd></div>
            <div><dt>Payment due day</dt><dd>{{ detail.paymentDueDay ?? '-' }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFeeAmount ?? '-' }}</dd></div>
            <div><dt>Grace period</dt><dd>{{ detail.gracePeriodDays | unit: 'days' }}</dd></div>
            <div><dt>Landlord signed</dt><dd>{{ formatDateTime(detail.signedAt) }}</dd></div>
            <div><dt>Tenant signed</dt><dd>{{ formatDateTime(detail.tenantSignedAt) }}</dd></div>
            <div>
              <dt>Previous lease</dt>
              <dd>
                @if (detail.previousLeaseId) {
                  <a [routerLink]="RoutePaths.leaseDetail(detail.previousLeaseId)">
                    {{ detail.previousLeaseNumber || detail.previousLeaseId }}
                  </a>
                } @else {
                  -
                }
              </dd>
            </div>
          </dl>

          @if (contractHtml(); as contract) {
            <details>
              <summary>Contract document</summary>
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

        @if (showActivation()) {
          <app-section-card title="Activate lease">
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
                  {{ activating() ? 'Activating...' : 'Activate lease' }}
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
                <label class="field"><span>New monthly rent</span><input type="number" step="0.01" min="0" formControlName="newMonthlyRent"></label>
                <label class="field"><span>New security deposit</span><input type="number" step="0.01" min="0" formControlName="newSecurityDeposit"></label>
                <label class="field">
                  <span>Payment due day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay">
                  @if (renewalForm.controls.paymentDueDay.invalid && renewalForm.controls.paymentDueDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field"><span>Late fee</span><input type="number" step="0.01" min="0" formControlName="lateFeeAmount"></label>
                <label class="field"><span>Grace period (days)</span><input type="number" min="0" formControlName="gracePeriodDays"></label>
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

          @if ((detail.amendments ?? []).length === 0) {
            <p class="muted">No amendments recorded.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>#</th><th>Type</th><th>Effective</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (amendment of detail.amendments ?? []; track amendment.id) {
                    <tr [appRowLink]="RoutePaths.amendmentDetail(amendment.id)">
                      <td>
                        <a class="record-link__primary" [routerLink]="RoutePaths.amendmentDetail(amendment.id)">
                          {{ amendment.amendmentNumber ?? amendment.id }}
                        </a>
                      </td>
                      <td>{{ amendment.amendmentType | humanLabel }}</td>
                      <td>{{ formatDate(amendment.effectiveDate) }}</td>
                      <td><span class="status-chip" [ngClass]="amendmentStatusClass(amendment.status)">{{ amendment.status | humanLabel }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
      }
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

    details p {
      margin: 0.5rem 0 0;
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

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly downloading = signal(false);

  /**
   * The rendered contract, trusted because the server sanitized it against the
   * jsoup allowlist before freezing it onto the lease.
   */
  readonly contractHtml = computed<SafeHtml | null>(() => {
    const terms = this.lease()?.termsAndConditions;
    return terms ? this.sanitizer.bypassSecurityTrustHtml(terms) : null;
  });

  /**
   * Offered to anyone who can open the lease. The lease carries its own agency
   * and building now, so an admin takes the scoped route; a tenant, who has no
   * agency selected anywhere, takes the route authorized by owning the lease.
   */
  readonly canDownloadPdf = computed(() => this.lease() !== null);

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
      title: `Delete ${lease.leaseNumber || 'this lease'}?`,
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


  amendmentStatusClass(status?: string | null): string {
    switch (status) {
      case 'ACTIVE':
      case 'APPROVED':
        return 'status-chip--success';
      case 'REJECTED':
        return 'status-chip--danger';
      case 'PENDING_APPROVAL':
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

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
