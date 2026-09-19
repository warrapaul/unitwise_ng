import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { LeaseAmendmentDetail } from '../models/tenant.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-amendment-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.amendments" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading amendment..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (amendment(); as detail) {
        <app-section-card
          [title]="'Amendment #' + (detail.amendmentNumber ?? detail.id)"
          [subtitle]="detail.leaseNumber || null"
        >
          <ng-container actions>
            <div class="action-bar">
              <!--
                The two sides of the proposal, kept apart on purpose. The
                landlord drafts, sends and applies; the tenant accepts or
                refuses. Nothing here lets one party do the other's part.
              -->
              <app-permission-gate [permissions]="[Permissions.LEASE_AMENDMENT_WRITE]">
                @if (detail.status === 'DRAFT') {
                  <button type="button" class="btn btn-primary" [disabled]="working()" (click)="submit()">
                    Send to tenant
                  </button>
                }
                @if (detail.status === 'DRAFT' || detail.status === 'PENDING_APPROVAL') {
                  <button type="button" class="btn btn-secondary" [disabled]="working()" (click)="withdraw()">
                    Withdraw
                  </button>
                }
                @if (detail.status === 'APPROVED') {
                  <button type="button" class="btn btn-primary" [disabled]="working()" (click)="activate()">
                    Apply to the lease
                  </button>
                }
                @if (detail.status === 'DRAFT') {
                  <button type="button" class="btn btn-secondary" (click)="toggleEdit()">
                    {{ editing() ? 'Close editor' : 'Edit' }}
                  </button>
                }
              </app-permission-gate>

              @if (detail.status === 'PENDING_APPROVAL') {
                <button type="button" class="btn btn-primary" [disabled]="working()" (click)="accept()">
                  Accept
                </button>
                <button type="button" class="btn btn-secondary" [disabled]="working()" (click)="reject()">
                  Decline
                </button>
              }
              <app-permission-gate [permissions]="[Permissions.LEASE_AMENDMENT_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
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
          <dl class="detail-grid">
            <div><dt>Type</dt><dd>{{ detail.amendmentType | humanLabel }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Effective date</dt><dd>{{ formatDate(detail.effectiveDate) }}</dd></div>
            <div><dt>New monthly rent</dt><dd>{{ detail.newMonthlyRent ?? '-' }}</dd></div>
            <div><dt>New end date</dt><dd>{{ formatDate(detail.newEndDate) }}</dd></div>
            <div>
              <dt>Lease</dt>
              <dd>
                @if (detail.leaseAgreementId) {
                  <a [routerLink]="RoutePaths.leaseDetail(detail.leaseAgreementId)">
                    {{ detail.leaseNumber || detail.leaseAgreementId }}
                  </a>
                } @else {
                  -
                }
              </dd>
            </div>
          </dl>

          <!--
            Who moved it, and when. A change to somebody's rent should say who
            proposed it and who agreed to it; the status alone said that it had
            been approved and never by whom.
          -->
          <section class="trail">
            <h3 class="trail__title">History</h3>
            <ol class="trail__list">
              <li>Drafted {{ formatDateTime(detail.createdAt) }}</li>
              @if (detail.submittedAt) {
                <li>Sent to the tenant {{ formatDateTime(detail.submittedAt) }}</li>
              }
              @if (detail.decidedAt) {
                <li>
                  {{ detail.status === 'REJECTED' ? 'Declined' : 'Accepted' }} by the tenant
                  {{ formatDateTime(detail.decidedAt) }}
                  @if (detail.rejectionReason) {
                    <p class="muted">“{{ detail.rejectionReason }}”</p>
                  }
                </li>
              }
              @if (detail.withdrawnAt) {
                <li>
                  Withdrawn by the landlord {{ formatDateTime(detail.withdrawnAt) }}
                  @if (detail.withdrawalReason) {
                    <p class="muted">“{{ detail.withdrawalReason }}”</p>
                  }
                </li>
              }
              @if (detail.activatedAt) {
                <li>
                  Applied to the lease {{ formatDateTime(detail.activatedAt) }} — the agreement was
                  reissued and awaits signature
                </li>
              }
            </ol>

            @if (detail.status === 'PENDING_APPROVAL') {
              <p class="hint">
                Waiting on the tenant. Nothing reaches the lease until they accept, and accepting
                is not the same as signing the reissued agreement.
              </p>
            }
          </section>

          @if (detail.description) {
            <p class="muted">{{ detail.description }}</p>
          }

          @if (detail.termsChanges) {
            <details>
              <summary>Terms changes</summary>
              <p>{{ detail.termsChanges }}</p>
            </details>
          }
          } @else {
  <form [formGroup]="form" appFormFeedback (ngSubmit)="save()">
              <div class="grid-auto">
                <label class="field">
                  <span>Type</span>
                  <select formControlName="amendmentType">
                    <option value="RENT_ADJUSTMENT">Rent adjustment</option>
                    <option value="LEASE_EXTENSION">Lease extension</option>
                    <option value="TERMS_UPDATE">Terms update</option>
                    <option value="OCCUPANTS_CHANGE">Occupants change</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="DRAFT">Draft</option>
                    <option value="PENDING_APPROVAL">Pending approval</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </label>
                <label class="field">
                  <span>Effective date</span>
                  <input type="date" formControlName="effectiveDate">
                  @if (form.controls.effectiveDate.invalid && form.controls.effectiveDate.touched) {
                    <small class="error-text">An effective date is required.</small>
                  }
                </label>
                <label class="field"><span>New monthly rent</span><input type="number" step="0.01" min="0" formControlName="newMonthlyRent"></label>
                <label class="field"><span>New end date</span><input type="date" formControlName="newEndDate"></label>
              </div>

              <label class="field field--wide">
                <span>Description</span>
                <textarea formControlName="description" rows="2"></textarea>
              </label>

              <label class="field field--wide">
                <span>Terms changes</span>
                <textarea formControlName="termsChanges" rows="3"></textarea>
              </label>

              @if (saveError(); as apiError) {
                <app-error-card title="Unable to save amendment" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : 'Save amendment' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">Cancel</button>
              </div>
            </form>
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    .trail {
      border-top: 1px solid var(--border);
      padding-top: 0.8rem;
    }

    .trail__title {
      margin: 0 0 0.4rem;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .trail__list {
      margin: 0;
      padding-left: 1.1rem;
      font-size: 0.92rem;
    }

    .trail__list p { margin: 0.15rem 0 0; }

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
export class AmendmentDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly amendment = signal<LeaseAmendmentDetail | null>(null);
  readonly working = signal(false);
  readonly deleting = signal(false);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    amendmentType: 'RENT_ADJUSTMENT',
    status: 'DRAFT',
    effectiveDate: ['', [Validators.required]],
    newMonthlyRent: [null as number | null, [Validators.min(0)]],
    newEndDate: '',
    description: '',
    termsChanges: ''
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const amendment = await firstValueFrom(this.tenantsService.getAmendment(Number(this.id())));
      this.amendment.set(amendment);
      this.patchForm(amendment);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Every lifecycle step goes through here.
   *
   * The server is the authority on which transitions are legal — DRAFT cannot
   * reach ACTIVE, only the tenant may accept — so this does not second-guess
   * it. A refused transition surfaces the server's own sentence, which says
   * what the rule is rather than that a button did not work.
   */
  private async step(
    action: (id: number) => Promise<LeaseAmendmentDetail>,
    success: string
  ): Promise<void> {
    const amendment = this.amendment();
    if (!amendment) {
      return;
    }

    this.working.set(true);

    try {
      this.amendment.set(await action(amendment.id));
      this.notifications.push('success', success);
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.working.set(false);
    }
  }

  submit(): Promise<void> {
    return this.step(
      (id) => firstValueFrom(this.tenantsService.submitAmendment(id)),
      'Sent to the tenant for a decision.');
  }

  async withdraw(): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Withdraw this proposal?',
      message: 'The tenant will no longer be asked to decide on it. Withdrawing rather than '
        + 'asking them to reject keeps a refusal off their record for your correction.',
      confirmLabel: 'Withdraw',
      reason: {
        // Optional, unlike a refusal: withdrawing is the landlord correcting
        // their own proposal, and there is no other party owed an explanation.
        label: 'Note (optional)',
        placeholder: 'e.g. Sent against the wrong lease',
        required: false,
        maxLength: 500
      }
    });

    if (reason === null) {
      return;
    }

    return this.step(
      (id) => firstValueFrom(this.tenantsService.withdrawAmendment(id, reason || null)),
      'Amendment withdrawn.');
  }

  async accept(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Accept this change to your tenancy?',
      message: 'The landlord will then apply it, and you will be asked to sign the revised '
        + 'agreement. Accepting the proposal is not the same as signing the document.',
      confirmLabel: 'Accept'
    })) {
      return;
    }

    return this.step(
      (id) => firstValueFrom(this.tenantsService.acceptAmendment(id)),
      'Accepted. The landlord can now apply it.');
  }

  async reject(): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Decline this change to your tenancy?',
      message: 'This is final for this proposal — the landlord would have to raise a new one. '
        + 'Your tenancy and its current terms are unaffected.',
      confirmLabel: 'Decline',
      destructive: true,
      reason: {
        label: 'Why are you declining?',
        placeholder: 'e.g. The increase is above what clause 3.4 allows on this notice',
        hint: 'The landlord will read this, and it stays on the record.',
        required: true,
        maxLength: 500
      }
    });

    if (reason === null) {
      return;
    }

    return this.step(
      (id) => firstValueFrom(this.tenantsService.rejectAmendment(id, reason)),
      'Declined. Your reason has been sent to the landlord.');
  }

  async activate(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Apply this amendment to the lease?',
      message: 'The agreement is reissued and the version it replaces is archived. The new '
        + 'version starts unsigned — the tenant accepted the proposal, and now signs the '
        + 'document that states it.',
      confirmLabel: 'Apply'
    })) {
      return;
    }

    return this.step(
      (id) => firstValueFrom(this.tenantsService.activateAmendment(id)),
      'Applied. The contract has been reissued for signature.');
  }

  async toggleEdit(): Promise<void> {
    this.editing.update((value) => !value);
    this.saveError.set(null);

    const amendment = this.amendment();
    if (this.editing() && amendment) {
      this.patchForm(amendment);
    }
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
      const updated = await firstValueFrom(this.tenantsService.updateAmendment(Number(this.id()), {
        amendmentType: value.amendmentType as never,
        status: value.status as never,
        effectiveDate: value.effectiveDate,
        newMonthlyRent: value.newMonthlyRent,
        newEndDate: value.newEndDate || null,
        description: value.description || null,
        termsChanges: value.termsChanges || null
      }));

      this.amendment.set(updated);
      this.editing.set(false);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(amendment: LeaseAmendmentDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete amendment #${amendment.amendmentNumber ?? amendment.id}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.tenantsService.deleteAmendment(amendment.id));
      await this.router.navigateByUrl(RoutePaths.amendments);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }


  /** Date and time, because "who moved it when" is answered in hours. */
  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  private patchForm(amendment: LeaseAmendmentDetail): void {
    this.form.patchValue({
      amendmentType: amendment.amendmentType ?? 'RENT_ADJUSTMENT',
      status: amendment.status ?? 'DRAFT',
      effectiveDate: amendment.effectiveDate ?? '',
      newMonthlyRent: amendment.newMonthlyRent === null || amendment.newMonthlyRent === undefined
        ? null
        : Number(amendment.newMonthlyRent),
      newEndDate: amendment.newEndDate ?? '',
      description: amendment.description ?? '',
      termsChanges: amendment.termsChanges ?? ''
    });
  }
}
