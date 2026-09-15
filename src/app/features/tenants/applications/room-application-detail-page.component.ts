import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { TenantsService } from '../tenants.service';
import { RoomApplicationDetail } from '../models/tenant.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-room-application-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.roomApplications" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading application..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (application(); as detail) {
        <app-section-card
          [title]="detail.applicantName || ('Application #' + detail.id)"
          [subtitle]="detail.roomLabel || null"
        >
          <ng-container actions>
            <div class="button-row">
              @if (detail.status === 'PENDING') {
                <button type="button" class="btn btn-secondary" [disabled]="withdrawing()" (click)="withdraw()">
                  {{ withdrawing() ? 'Withdrawing...' : 'Withdraw' }}
                </button>
              }
            </div>
          </ng-container>

          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Applicant phone</dt><dd class="mono">{{ detail.applicantPhone || '-' }}</dd></div>
            <div><dt>Applicant email</dt><dd>{{ detail.applicantEmail || '-' }}</dd></div>
            <div><dt>User UID</dt><dd class="mono">{{ detail.userUid || '-' }}</dd></div>
            <div><dt>Building</dt><dd>{{ detail.buildingName || '-' }}</dd></div>
            <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent ?? '-' }}</dd></div>
            <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit ?? '-' }}</dd></div>
            <div><dt>Desired move-in</dt><dd>{{ formatDate(detail.desiredMoveInDate) }}</dd></div>
            <div><dt>Submitted</dt><dd>{{ formatDateTime(detail.createdAt) }}</dd></div>
            <div><dt>Reviewed</dt><dd>{{ formatDateTime(detail.reviewedAt) }}</dd></div>
          </dl>

          @if (detail.applicantMessage) {
            <p class="muted">{{ detail.applicantMessage }}</p>
          }

          @if (detail.decisionNotes) {
            <section class="alert alert-info" role="status">
              <strong>Decision notes</strong>
              <p>{{ detail.decisionNotes }}</p>
            </section>
          }
        </app-section-card>

        @if (detail.status === 'PENDING') {
          <app-permission-gate [permissions]="[Permissions.ROOM_APPLICATION_REVIEW_ALL, Permissions.ROOM_APPLICATION_REVIEW]">
            <app-section-card title="Review application">
              <form [formGroup]="decisionForm" appFormFeedback (ngSubmit)="decide()">
                <div class="grid-auto">
                  <label class="field">
                    <span>Decision</span>
                    <select formControlName="approved">
                      <option [ngValue]="true">Approve</option>
                      <option [ngValue]="false">Reject</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Deciding for</span>
                    <input
                      [value]="(context.active().agencyName || 'No agency selected')
                        + ' · ' + (detail.buildingName || 'building #' + detail.buildingId)"
                      disabled
                    >
                    <small class="hint">The building comes from the application; the agency from your workspace.</small>
                  </label>
                </div>

                <label class="field field--wide">
                  <span>Decision notes</span>
                  <textarea formControlName="decisionNotes" rows="2"></textarea>
                </label>

                @if (decisionError(); as apiError) {
                  <app-error-card title="Unable to record decision" [message]="apiError.message" [details]="apiError.details" />
                }

                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="deciding() || context.agencyId() === null">
                    {{ deciding() ? 'Submitting...' : 'Submit decision' }}
                  </button>
                </div>
              </form>
            </app-section-card>
          </app-permission-gate>
        }
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

    p {
      margin: 0;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomApplicationDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  readonly context = inject(ActiveContextService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly application = signal<RoomApplicationDetail | null>(null);
  readonly withdrawing = signal(false);

  readonly deciding = signal(false);
  readonly decisionError = signal<ApiError | null>(null);

  readonly decisionForm = this.formBuilder.group({
    approved: true,
    decisionNotes: ''
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.application.set(await firstValueFrom(this.tenantsService.getApplication(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async withdraw(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Withdraw this application?',
      confirmLabel: 'Withdraw',
      destructive: true
    })) {
      return;
    }

    this.withdrawing.set(true);
    this.error.set(null);

    try {
      this.application.set(await firstValueFrom(this.tenantsService.withdrawApplication(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.withdrawing.set(false);
    }
  }

  async decide(): Promise<void> {
    const agencyId = this.context.agencyId();
    const buildingId = this.application()?.buildingId ?? this.context.buildingId();
    if (agencyId === null || buildingId == null) {
      return;
    }

    this.deciding.set(true);
    this.decisionError.set(null);

    const value = this.decisionForm.getRawValue();

    try {
      this.application.set(await firstValueFrom(this.tenantsService.decideApplication(
        agencyId,
        buildingId,
        Number(this.id()),
        { approved: value.approved, decisionNotes: value.decisionNotes || null }
      )));
    } catch (error) {
      this.decisionError.set(toApiError(error));
    } finally {
      this.deciding.set(false);
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
