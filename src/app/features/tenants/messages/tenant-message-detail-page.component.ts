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
import { TenantMessageDetail } from '../models/tenant.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-tenant-message-detail-page',
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
      <app-back-link [to]="RoutePaths.tenantMessages" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading message..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (message(); as detail) {
        <app-section-card
          [title]="detail.type ? (detail.type + ' from ' + (detail.tenantName || 'tenant')) : ('Message #' + detail.id)"
          [subtitle]="detail.tenantEmail || null"
        >
          <ng-container actions>
            <div class="button-row">
              <app-permission-gate [permissions]="[Permissions.TENANT_MESSAGE_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
                </button>
              </app-permission-gate>
            </div>
          </ng-container>

          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Type</dt><dd>{{ detail.type || '-' }}</dd></div>
            <div><dt>Tenant</dt><dd>{{ detail.tenantName || detail.tenantId || '-' }}</dd></div>
            <div><dt>Phone</dt><dd class="mono">{{ detail.tenantPhone || '-' }}</dd></div>
            <div><dt>Received</dt><dd>{{ formatDateTime(detail.createdAt) }}</dd></div>
            <div><dt>Updated</dt><dd>{{ formatDateTime(detail.updatedAt) }}</dd></div>
          </dl>

          <blockquote>{{ detail.message || detail.messagePreview || '-' }}</blockquote>
        </app-section-card>

        <app-permission-gate [permissions]="[Permissions.TENANT_MESSAGE_WRITE]">
          <app-section-card title="Update">
            <form [formGroup]="form" appFormFeedback (ngSubmit)="save()">
              <div class="grid-auto">
                <label class="field">
                  <span>Type</span>
                  <select formControlName="type">
                    <option value="CONTACT">Contact</option>
                    <option value="COMPLAINT">Complaint</option>
                    <option value="SUGGESTION">Suggestion</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="NEW">New</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </label>
              </div>

              <label class="field field--wide">
                <span>Message</span>
                <textarea formControlName="message" rows="4"></textarea>
                @if (form.controls.message.invalid && form.controls.message.touched) {
                  <small class="error-text">A message is required.</small>
                }
              </label>

              @if (saveError(); as apiError) {
                <app-error-card title="Unable to update message" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : 'Save message' }}
                </button>
                <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="markResolved()">
                  Mark resolved
                </button>
              </div>
            </form>
          </app-section-card>
        </app-permission-gate>
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

    blockquote {
      margin: 0;
      padding: 0.75rem 1rem;
      border-left: 3px solid var(--primary);
      background: var(--surface-2);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      white-space: pre-wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantMessageDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<TenantMessageDetail | null>(null);
  readonly deleting = signal(false);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    type: 'CONTACT',
    status: 'NEW',
    message: ['', [Validators.required, Validators.maxLength(2000)]]
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const message = await firstValueFrom(this.tenantsService.getMessage(Number(this.id())));
      this.message.set(message);
      this.form.patchValue({
        type: message.type ?? 'CONTACT',
        status: message.status ?? 'NEW',
        message: message.message ?? ''
      });
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
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
      this.message.set(await firstValueFrom(this.tenantsService.updateMessage(Number(this.id()), {
        type: value.type as never,
        status: value.status as never,
        message: value.message
      })));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async markResolved(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);

    try {
      const updated = await firstValueFrom(this.tenantsService.updateMessageStatus(Number(this.id()), 'RESOLVED'));
      this.message.set(updated);
      this.form.patchValue({ status: updated.status ?? 'RESOLVED' });
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(message: TenantMessageDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Delete this message?',
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.tenantsService.deleteMessage(message.id));
      await this.router.navigateByUrl(RoutePaths.tenantMessages);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }


  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
