import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../../tenants/tenants.service';
import { TenantPreview } from '../../tenants/models/tenant.models';
import { MaintenanceService } from '../maintenance.service';
import {
  MAINTENANCE_CATEGORY_LABELS,
  MaintenanceCategory,
  MaintenanceDetail,
  MaintenancePreview,
  MaintenancePriority
} from '../maintenance.models';

/**
 * The tenant's repairs: report one, and see where each stands.
 *
 * Reported against the room they live in — the backend fills it in from the
 * tenancy — so the form asks only what is wrong and how urgent it is.
 */
@Component({
  selector: 'app-my-maintenance-page',
  standalone: true,
  imports: [ReactiveFormsModule, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent,
    ErrorCardComponent, FieldErrorComponent, StatusChipComponent, FormFeedbackDirective, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-section-card title="Report an issue">
        @if (tenancies().length === 0 && !loading()) {
          <p class="muted">Repairs can be reported once you have a tenancy.</p>
        } @else {
          <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <div class="grid-auto">
              @if (tenancies().length > 1) {
                <label class="field">
                  <span>Home</span>
                  <select formControlName="tenantId">
                    @for (tenancy of tenancies(); track tenancy.id) {
                      <option [ngValue]="tenancy.id">{{ tenancy.roomName ? 'Room ' + tenancy.roomName : 'Room' }} · {{ tenancy.buildingName }}</option>
                    }
                  </select>
                </label>
              }
              <label class="field">
                <span>What kind of problem</span>
                <select formControlName="category">
                  @for (option of categories; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
                </select>
              </label>
              <label class="field">
                <span>How urgent</span>
                <select formControlName="priority">
                  <option value="MEDIUM">Normal</option>
                  <option value="HIGH">Soon — it is getting worse</option>
                  <option value="URGENT">Urgent — I can't use part of the house</option>
                  <option value="EMERGENCY">Emergency — danger or flooding</option>
                </select>
              </label>
            </div>
            <label class="field">
              <span>In a few words</span>
              <input formControlName="title" maxlength="255" placeholder="e.g. Kitchen sink is leaking">
              <app-field-error [control]="form.controls.title" label="A short title" />
            </label>
            <label class="field">
              <span>Details</span>
              <textarea formControlName="description" rows="3" placeholder="Where it is, since when, anything you have tried"></textarea>
              <app-field-error [control]="form.controls.description" label="Details" />
            </label>
            @if (form.controls.priority.value === 'EMERGENCY') {
              <p class="alert alert-warning" role="alert">For fire, gas or flooding, call the emergency numbers on your dashboard first.</p>
            }
            @if (submitError(); as apiError) {
              <app-error-card title="Not sent" [message]="apiError.message" [details]="apiError.details" />
            }
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Sending...' : 'Send to the caretaker' }}</button>
            </div>
          </form>
        }
      </app-section-card>

      <app-section-card title="My requests">
        @if (loading()) {
          <app-loading-state [compact]="true" label="Loading your requests..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else if (requests().length === 0) {
          <app-empty-state title="No requests yet" description="Anything you report shows here with its progress." />
        } @else {
          <ul class="requests">
            @for (request of requests(); track request.id) {
              <li class="request">
                <button type="button" class="request__head" (click)="toggle(request)" [attr.aria-expanded]="openId() === request.id">
                  <span class="request__title">
                    <strong>{{ request.title }}</strong>
                    <span class="muted">{{ categoryLabel(request.category) }} · {{ date(request.createdAt) }}@if (request.requestNumber) { · {{ request.requestNumber }} }</span>
                  </span>
                  <app-status-chip [status]="request.status" />
                </button>
                @if (openId() === request.id) {
                  @if (detail(); as d) {
                    <div class="request__body">
                      @if (d.description) { <p>{{ d.description }}</p> }
                      <dl class="facts">
                        <div><dt>Urgency</dt><dd>{{ d.priority | humanLabel }}</dd></div>
                        @if (d.scheduledDate) { <div><dt>Visit planned</dt><dd>{{ date(d.scheduledDate) }}</dd></div> }
                        @if (d.completedDate) { <div><dt>Done</dt><dd>{{ date(d.completedDate) }}</dd></div> }
                      </dl>
                      @if (d.workNotes) { <p class="notes"><strong>From the caretaker:</strong> {{ d.workNotes }}</p> }
                      @if (d.open) {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="cancellingId() === d.id" (click)="cancel(d)">
                          {{ cancellingId() === d.id ? 'Cancelling...' : 'Cancel request' }}
                        </button>
                      }
                    </div>
                  } @else {
                    <app-loading-state [compact]="true" label="Loading..." />
                  }
                }
              </li>
            }
          </ul>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .requests { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
    .request { border: 1px solid var(--border); border-radius: 12px; }
    .request__head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; width: 100%; padding: 0.7rem 0.9rem;
                     border: 0; background: none; font: inherit; color: inherit; text-align: start; cursor: pointer; }
    .request__title { display: grid; gap: 0.1rem; min-width: 0; }
    .request__body { display: grid; gap: 0.6rem; padding: 0 0.9rem 0.8rem; }
    .facts { display: flex; flex-wrap: wrap; gap: 0.4rem 1.5rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; }
    .facts dt { font-size: 0.75rem; color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: 600; }
    .notes { padding: 0.5rem 0.7rem; border-radius: 8px; background: var(--surface-2); }
    .request__body .btn { justify-self: start; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyMaintenancePageComponent implements OnInit {
  /** `?tenantId=` from the dashboard's "Report an issue": the tenancy it was pressed on. */
  readonly tenantId = input<string | undefined>(undefined);

  private readonly maintenance = inject(MaintenanceService);
  private readonly tenants = inject(TenantsService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly categories = (Object.keys(MAINTENANCE_CATEGORY_LABELS) as MaintenanceCategory[])
    .map((value) => ({ value, label: MAINTENANCE_CATEGORY_LABELS[value] }));

  private readonly allTenancies = signal<TenantPreview[]>([]);
  readonly tenancies = computed(() => this.allTenancies().filter((tenancy) => tenancy.status !== 'AWAITING_TENANT_ACCEPTANCE'));

  readonly requests = signal<MaintenancePreview[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly submitError = signal<ApiError | null>(null);
  readonly openId = signal<number | null>(null);
  readonly detail = signal<MaintenanceDetail | null>(null);
  readonly cancellingId = signal<number | null>(null);

  readonly form = this.fb.group({
    tenantId: [0, [Validators.required, Validators.min(1)]],
    category: 'PLUMBING' as MaintenanceCategory,
    priority: 'MEDIUM' as MaintenancePriority,
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.required]]
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [tenancies, requests] = await Promise.all([
        firstValueFrom(this.tenants.getMyTenantProfiles()),
        firstValueFrom(this.maintenance.getMine({ page: 0, size: 50 }))
      ]);
      this.allTenancies.set(tenancies);
      this.requests.set(requests.items);
      const wanted = Number(this.tenantId());
      const list = this.tenancies();
      const chosen = list.find((tenancy) => tenancy.id === wanted) ?? list.find((tenancy) => tenancy.status === 'ACTIVE') ?? list[0];
      if (chosen && !this.form.controls.tenantId.value) {
        this.form.controls.tenantId.setValue(chosen.id);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.submitError.set(null);
    try {
      const created = await firstValueFrom(this.maintenance.report({
        tenantId: value.tenantId,
        category: value.category,
        priority: value.priority,
        title: value.title.trim(),
        description: value.description.trim()
      }));
      this.requests.update((list) => [created, ...list]);
      this.form.patchValue({ title: '', description: '', priority: 'MEDIUM' });
      this.form.markAsUntouched();
      this.notifications.push('success', 'Sent — the caretaker has been told.');
    } catch (error) {
      this.submitError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(request: MaintenancePreview): Promise<void> {
    if (this.openId() === request.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(request.id);
    this.detail.set(null);
    try {
      this.detail.set(await firstValueFrom(this.maintenance.getMineById(request.id)));
    } catch (error) {
      this.openId.set(null);
      this.notifications.push('error', extractErrorMessage(error));
    }
  }

  async cancel(request: MaintenanceDetail): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: `Cancel “${request.title}”?`,
      message: 'The caretaker sees your reason. Report it again if the problem comes back.',
      confirmLabel: 'Cancel request',
      destructive: true,
      reason: { label: 'Why', required: true, placeholder: 'e.g. Fixed it myself', maxLength: 500 }
    });
    if (reason === null) {
      return;
    }
    this.cancellingId.set(request.id);
    try {
      const updated = await firstValueFrom(this.maintenance.cancelMine(request.id, reason));
      this.detail.set(updated);
      this.requests.update((list) => list.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.cancellingId.set(null);
    }
  }

  categoryLabel(category: MaintenanceCategory): string {
    return MAINTENANCE_CATEGORY_LABELS[category] ?? category;
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
