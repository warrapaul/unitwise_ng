import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { AppManagementService } from '../app-management.service';
import { AppPlatform, VersionConfig } from '../models/app-management.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-version-config-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Version configuration">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.appNotices">App notices</a>
        </ng-container>

        <p class="hint">Clients below the minimum version are forced to update before they can continue.</p>
      </app-section-card>

      <app-permission-gate [permissions]="[Permissions.APP_MANAGEMENT_WRITE]">
        <app-section-card [title]="editingPlatform() ? ('Edit ' + editingPlatform()) : 'Add or update a platform'">
          <ng-container actions>
            @if (editingPlatform()) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="cancelEdit()">Cancel edit</button>
            }
          </ng-container>

          <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <div class="grid-auto">
              <label class="field">
                <span>Platform</span>
                <select formControlName="platform">
                  <option value="ANDROID">Android</option>
                  <option value="IOS">iOS</option>
                  <option value="WEB">Web</option>
                  <option value="ALL">All</option>
                </select>
              </label>

              <label class="field">
                <span>Minimum version</span>
                <input formControlName="minimumVersion" placeholder="1.4.0">
                @if (form.controls.minimumVersion.invalid && form.controls.minimumVersion.touched) {
                  <small class="error-text">A minimum version is required.</small>
                }
              </label>

              <label class="field">
                <span>Latest version</span>
                <input formControlName="latestVersion" placeholder="1.6.2">
                @if (form.controls.latestVersion.invalid && form.controls.latestVersion.touched) {
                  <small class="error-text">A latest version is required.</small>
                }
              </label>

              <label class="field"><span>Store URL</span><input formControlName="storeUrl"></label>
            </div>

            <label class="field field--wide">
              <span>Force update message</span>
              <textarea formControlName="forceUpdateMessage" rows="2"></textarea>
            </label>

            <label class="field field--wide">
              <span>Soft update message</span>
              <textarea formControlName="softUpdateMessage" rows="2"></textarea>
            </label>

            @if (saveError(); as apiError) {
              <app-error-card title="Unable to save configuration" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Save configuration' }}
              </button>
            </div>
          </form>
        </app-section-card>
      </app-permission-gate>

      @if (loading()) {
        <app-loading-state label="Loading configurations..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (configs().length === 0) {
        <app-empty-state title="No version configuration" description="Add a configuration so clients know when to update." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Platform</th><th>Minimum</th><th>Latest</th><th>Store</th><th>Status</th><th class="actions-col">Actions</th></tr>
              </thead>
              <tbody>
                @for (config of configs(); track config.id) {
                  <tr>
                    <td><strong>{{ config.platform | humanLabel }}</strong></td>
                    <td class="mono">{{ config.minimumVersion || '-' }}</td>
                    <td class="mono">{{ config.latestVersion || '-' }}</td>
                    <td>
                      @if (config.storeUrl) {
                        <a [href]="config.storeUrl" target="_blank" rel="noopener">Open</a>
                      } @else {
                        -
                      }
                    </td>
                    <td>
                      <app-status-chip [status]="config.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td class="actions-col">
                      <app-permission-gate [permissions]="[Permissions.APP_MANAGEMENT_WRITE]">
                        <div class="row-actions">
                          <button
                            type="button"
                            class="icon-action"
                            aria-label="Edit version config"
                            title="Edit version config"
                            (click)="startEdit(config)"
                          ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></button>
                          <button
                            type="button"
                            class="icon-action icon-action--danger"
                            aria-label="Delete version config"
                            title="Delete version config"
                            [disabled]="busyPlatform() === config.platform"
                            (click)="remove(config)"
                          ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                        </div>
                      </app-permission-gate>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
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

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionConfigPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly appManagement = inject(AppManagementService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly configs = signal<VersionConfig[]>([]);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly editingPlatform = signal<AppPlatform | null>(null);
  readonly busyPlatform = signal<AppPlatform | null | undefined>(null);

  readonly form = this.formBuilder.group({
    platform: 'ANDROID',
    minimumVersion: ['', [Validators.required]],
    latestVersion: ['', [Validators.required]],
    storeUrl: '',
    forceUpdateMessage: '',
    softUpdateMessage: ''
  });

  ngOnInit(): void {
    void this.reload();
  }

  startEdit(config: VersionConfig): void {
    this.editingPlatform.set(config.platform ?? null);
    this.saveError.set(null);
    this.form.patchValue({
      platform: config.platform ?? 'ANDROID',
      minimumVersion: config.minimumVersion ?? '',
      latestVersion: config.latestVersion ?? '',
      storeUrl: config.storeUrl ?? '',
      forceUpdateMessage: config.forceUpdateMessage ?? '',
      softUpdateMessage: config.softUpdateMessage ?? ''
    });
  }

  async cancelEdit(): Promise<void> {
    this.editingPlatform.set(null);
    this.saveError.set(null);
    this.form.reset({
      platform: 'ANDROID',
      minimumVersion: '',
      latestVersion: '',
      storeUrl: '',
      forceUpdateMessage: '',
      softUpdateMessage: ''
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      await firstValueFrom(this.appManagement.saveVersionConfig({
        platform: value.platform as AppPlatform,
        minimumVersion: value.minimumVersion,
        latestVersion: value.latestVersion,
        storeUrl: value.storeUrl || null,
        forceUpdateMessage: value.forceUpdateMessage || null,
        softUpdateMessage: value.softUpdateMessage || null
      }));

      this.cancelEdit();
      await this.reload();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(config: VersionConfig): Promise<void> {
    if (!config.platform || !await this.confirm.ask({
      title: `Delete the ${config.platform} version configuration?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.busyPlatform.set(config.platform);
    this.error.set(null);

    try {
      await firstValueFrom(this.appManagement.deleteVersionConfig(config.platform));
      this.configs.update((items) => items.filter((item) => item.id !== config.id));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyPlatform.set(null);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.configs.set(await firstValueFrom(this.appManagement.getVersionConfigs()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
