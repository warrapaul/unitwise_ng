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
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../../tenants/tenants.service';
import { TenantPreview } from '../../tenants/models/tenant.models';
import { MaintenanceService } from '../maintenance.service';
import { FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { MaintenanceDetailBodyComponent } from '../components/maintenance-detail-body.component';
import {
  ACCESS_LABELS,
  AccessPreference,
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
    ErrorCardComponent, FieldErrorComponent, StatusChipComponent, FormFeedbackDirective, MaintenanceDetailBodyComponent],
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
            <div class="grid-auto">
              <label class="field">
                <span>Where in your home <span class="muted">(optional)</span></span>
                <input formControlName="locationInProperty" maxlength="150" placeholder="e.g. Kitchen sink">
              </label>
              <label class="field">
                <span>Getting in</span>
                <select formControlName="accessPreference">
                  @for (option of accessOptions; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
                </select>
              </label>
            </div>
            @if (followUpOf(); as earlier) {
              <p class="hint">Following up {{ earlier.requestNumber }} — “{{ earlier.title }}”.
                <button type="button" class="text-link" (click)="followUpOf.set(null)">Not a follow-up</button></p>
            }
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
            @if (form.controls.priority.value === 'EMERGENCY' || form.controls.priority.value === 'URGENT') {
              <p class="alert alert-warning" role="alert">For fire, gas, flooding or danger, call the emergency numbers on your dashboard first —
                a request here is not an emergency response.</p>
            }
            <p class="hint">You can add photos once it is sent.</p>
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
                      <app-maintenance-detail-body [request]="d" [addPhoto]="d.open ? uploadPhoto : null" />
                      @if (d.workNotes) { <p class="notes"><strong>From the caretaker:</strong> {{ d.workNotes }}</p> }
                      <div class="button-row">
                        @if (d.open) {
                          <button type="button" class="btn btn-secondary btn-sm" [disabled]="cancellingId() === d.id" (click)="cancel(d)">
                            {{ cancellingId() === d.id ? 'Cancelling...' : 'Cancel request' }}
                          </button>
                        } @else {
                          <!-- A finished request is not reopened: the problem coming back is a new request that points at it. -->
                          <button type="button" class="btn btn-secondary btn-sm" (click)="reportAgain(d)">Problem is back — report again</button>
                        }
                      </div>
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
    .requests { display: grid; gap: var(--space-2-5); margin: 0; padding: 0; list-style: none; }
    .request { border: 1px solid var(--border); border-radius: 12px; }
    .request__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4);
                     border: 0; background: none; font: inherit; color: inherit; text-align: start; cursor: pointer; }
    .request__title { display: grid; gap: var(--space-0-5); min-width: 0; }
    .request__body { display: grid; gap: var(--space-2-5); padding: 0 var(--space-4) var(--space-3); }
    .facts { display: flex; flex-wrap: wrap; gap: var(--space-1-5) var(--space-6); margin: 0; }
    .facts div { display: grid; gap: var(--space-0-5); }
    .facts dt { font-size: var(--text-xs); color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: var(--weight-semibold); }
    .notes { padding: var(--space-2) var(--space-3); border-radius: 8px; background: var(--surface-2); }
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
    locationInProperty: ['', [Validators.maxLength(150)]],
    accessPreference: 'CONTACT_FIRST' as AccessPreference,
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
        description: value.description.trim(),
        locationInProperty: value.locationInProperty.trim() || null,
        accessPreference: value.accessPreference,
        followUpOfId: this.followUpOf()?.id ?? null
      }));
      this.requests.update((list) => [created, ...list]);
      this.followUpOf.set(null);
      this.form.patchValue({ title: '', description: '', locationInProperty: '', priority: 'MEDIUM' });
      // Open it, so photos can be added straight away.
      void this.toggle(created);
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

  readonly accessOptions = (Object.keys(ACCESS_LABELS) as AccessPreference[]).map((value) => ({ value, label: ACCESS_LABELS[value] }));
  /** The earlier request a new report follows up. */
  readonly followUpOf = signal<MaintenanceDetail | null>(null);

  /** Same problem again: a new request prefilled from the old one, pointing back at it. */
  reportAgain(request: MaintenanceDetail): void {
    this.followUpOf.set(request);
    this.form.patchValue({
      tenantId: request.tenantId ?? this.form.controls.tenantId.value,
      category: request.category,
      title: request.title,
      locationInProperty: request.locationInProperty ?? '',
      description: ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Photos on an open request; the list keeps the refreshed detail. */
  readonly uploadPhoto: FileUploadSend = async ([file]) => {
    const open = this.detail();
    if (!open) {
      return false;
    }
    try {
      this.detail.set(await firstValueFrom(this.maintenance.addMyPhoto(open.id, file)));
      return true;
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
      return false;
    }
  };

  categoryLabel(category: MaintenanceCategory): string {
    return MAINTENANCE_CATEGORY_LABELS[category] ?? category;
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
