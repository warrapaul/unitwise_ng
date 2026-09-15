import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { AppManagementService } from '../app-management.service';
import { AppPlatform } from '../models/app-management.models';
import { ConfirmService } from '../../../shared/services/confirm.service';

const PLATFORMS: AppPlatform[] = ['ANDROID', 'IOS', 'WEB', 'ALL'];

@Component({
  selector: 'app-notice-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading notice..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit notice' : 'New notice'">
            <ng-container actions>
              @if (isEdit()) {
                <app-permission-gate [permissions]="[Permissions.APP_MANAGEMENT_WRITE]">
                  <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove()">
                    {{ deleting() ? 'Deleting...' : 'Delete' }}
                  </button>
                </app-permission-gate>
              }
            </ng-container>

            <div class="grid-auto">
              <label class="field">
                <span>Title</span>
                <input formControlName="title">
                @if (form.controls.title.invalid && form.controls.title.touched) {
                  <small class="error-text">A title is required.</small>
                }
              </label>

              <label class="field">
                <span>Type</span>
                <select formControlName="type">
                  <option value="INFO">Info</option>
                  <option value="DISRUPTION">Disruption</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="PROMOTION">Promotion</option>
                </select>
              </label>

              <label class="field">
                <span>Action</span>
                <select formControlName="actionType">
                  <option value="DISMISSIBLE">Dismissible</option>
                  <option value="BLOCKING">Blocking</option>
                </select>
                @if (form.controls.actionType.value === 'BLOCKING') {
                  <small class="hint">Clients cannot proceed while this notice is active.</small>
                }
              </label>

              <label class="field">
                <span>Display context</span>
                <select formControlName="displayContext">
                  <option value="GLOBAL">Global</option>
                  <option value="DASHBOARD">Dashboard</option>
                  <option value="ECOMMERCE_CART">Cart</option>
                  <option value="ECOMMERCE_CHECKOUT">Checkout</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>

              <label class="field"><span>Image URL</span><input formControlName="imageUrl"></label>
              <label class="field"><span>Starts</span><input type="datetime-local" formControlName="scheduledStart"></label>
              <label class="field"><span>Ends</span><input type="datetime-local" formControlName="scheduledEnd"></label>
              <label class="field">
                <span>Priority</span>
                <input type="number" min="0" formControlName="priority">
                <small class="hint">Higher priority notices are shown first.</small>
              </label>
              <label class="field">
                <span>Dismissal cooldown (hours)</span>
                <input type="number" min="0" formControlName="dismissalCooldownHours">
              </label>
              <label class="field">
                <span>Target roles</span>
                <input formControlName="targetRoles" placeholder="TENANT, AGENCY_ADMIN">
                <small class="hint">Leave empty to target every role.</small>
              </label>
            </div>

            <label class="field field--wide">
              <span>Body</span>
              <textarea formControlName="body" rows="4"></textarea>
              @if (form.controls.body.invalid && form.controls.body.touched) {
                <small class="error-text">A body is required.</small>
              }
            </label>

            <fieldset class="platform-select">
              <legend>Target platforms</legend>
              <div class="checkbox-grid">
                @for (platform of platforms; track platform) {
                  <label class="checkbox-field">
                    <input type="checkbox" [checked]="selectedPlatforms().has(platform)" (change)="togglePlatform(platform)">
                    <span>{{ platform }}</span>
                  </label>
                }
              </div>
            </fieldset>

            <label class="checkbox-field">
              <input type="checkbox" formControlName="isActive">
              <span>Active</span>
            </label>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save notice" [message]="apiError.message" [details]="apiError.details" />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save notice' : 'Create notice') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.appNotices">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .platform-select {
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
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoticeFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly platforms = PLATFORMS;

  readonly id = input<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly appManagement = inject(AppManagementService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly selectedPlatforms = signal<Set<AppPlatform>>(new Set<AppPlatform>(['ALL']));

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    body: ['', [Validators.required, Validators.maxLength(2000)]],
    imageUrl: '',
    type: 'INFO',
    displayContext: 'GLOBAL',
    actionType: 'DISMISSIBLE',
    isActive: true,
    scheduledStart: '',
    scheduledEnd: '',
    targetRoles: '',
    dismissalCooldownHours: [null as number | null, [Validators.min(0)]],
    priority: [null as number | null, [Validators.min(0)]]
  });

  ngOnInit(): void {
    void this.reload();
  }

  async togglePlatform(platform: AppPlatform): Promise<void> {
    this.selectedPlatforms.update((current) => {
      const next = new Set(current);
      next.has(platform) ? next.delete(platform) : next.add(platform);
      return next;
    });
  }

  async reload(): Promise<void> {
    const noticeId = this.id();
    if (!noticeId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const notice = await firstValueFrom(this.appManagement.getNotice(Number(noticeId)));
      this.form.patchValue({
        title: notice.title ?? '',
        body: notice.body ?? '',
        imageUrl: notice.imageUrl ?? '',
        type: notice.type ?? 'INFO',
        displayContext: notice.displayContext ?? 'GLOBAL',
        actionType: notice.actionType ?? 'DISMISSIBLE',
        isActive: notice.isActive ?? true,
        scheduledStart: this.toLocalInput(notice.scheduledStart),
        scheduledEnd: this.toLocalInput(notice.scheduledEnd),
        targetRoles: (notice.targetRoles ?? []).join(', '),
        dismissalCooldownHours: notice.dismissalCooldownHours ?? null,
        priority: notice.priority ?? null
      });
      this.selectedPlatforms.set(new Set(notice.targetPlatforms ?? ['ALL']));
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    const roles = value.targetRoles.split(',').map((role) => role.trim()).filter(Boolean);

    const request = {
      title: value.title,
      body: value.body,
      imageUrl: value.imageUrl || null,
      type: value.type as never,
      displayContext: value.displayContext as never,
      actionType: value.actionType as never,
      isActive: value.isActive,
      scheduledStart: value.scheduledStart || null,
      scheduledEnd: value.scheduledEnd || null,
      targetPlatforms: [...this.selectedPlatforms()],
      targetRoles: roles.length > 0 ? roles : null,
      dismissalCooldownHours: value.dismissalCooldownHours,
      priority: value.priority
    };

    try {
      const noticeId = this.id();
      if (noticeId) {
        await firstValueFrom(this.appManagement.updateNotice(Number(noticeId), request));
      } else {
        await firstValueFrom(this.appManagement.createNotice(request));
      }

      await this.router.navigateByUrl(RoutePaths.appNotices);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private toLocalInput(value?: string | null): string {
    if (!value) {
      return '';
    }

    return value.replace(' ', 'T').slice(0, 16);
  }

  async remove(): Promise<void> {
    const noticeId = this.id();
    if (!noticeId || !await this.confirm.ask({
      title: `Delete the notice "${this.form.controls.title.value}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.saveError.set(null);

    try {
      await firstValueFrom(this.appManagement.deleteNotice(Number(noticeId)));
      await this.router.navigateByUrl(RoutePaths.appNotices);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
