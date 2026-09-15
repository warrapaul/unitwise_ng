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
            <div class="button-row">
              <app-permission-gate [permissions]="[Permissions.LEASE_AMENDMENT_WRITE]">
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">
                  {{ editing() ? 'Close editor' : 'Edit' }}
                </button>
              </app-permission-gate>
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
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly amendment = signal<LeaseAmendmentDetail | null>(null);
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
