import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { AccessControlService } from '../access-control.service';
import { PermissionResponse } from '../models/access-control.models';

interface PermissionGroup {
  category: string;
  permissions: PermissionResponse[];
}

@Component({
  selector: 'app-role-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading role..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit role' : 'New role'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="AGENCY_ADMIN">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required and must be 3-50 characters.</small>
                }
              </label>

              <label class="field">
                <span>Description</span>
                <input formControlName="description" placeholder="What this role is for">
                @if (form.controls.description.invalid && form.controls.description.touched) {
                  <small class="error-text">Description cannot exceed 255 characters.</small>
                }
              </label>
            </div>

            @if (isEdit()) {
              <label class="checkbox-field">
                <input type="checkbox" formControlName="enabled">
                <span>Enabled</span>
              </label>
            }
          </app-section-card>

          <app-section-card title="Permissions">
            <ng-container actions>
              <span class="muted">{{ selectedIds().size }} selected</span>
            </ng-container>

            @if (permissionsError()) {
              <app-error-state [message]="permissionsError()!" (retry)="loadPermissions()" />
            } @else if (permissionGroups().length === 0) {
              <p class="muted">No permissions available to assign.</p>
            } @else {
              @for (group of permissionGroups(); track group.category) {
                <fieldset class="permission-group">
                  <legend>{{ group.category }}</legend>
                  <div class="permission-grid">
                    @for (permission of group.permissions; track permission.id) {
                      <label class="checkbox-field" [title]="permission.description || permission.name">
                        <input
                          type="checkbox"
                          [checked]="selectedIds().has(permission.id)"
                          (change)="togglePermission(permission.id)"
                        >
                        <span>{{ permission.name }}</span>
                      </label>
                    }
                  </div>
                </fieldset>
              }
            }
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Role already exists' : 'Unable to save role'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create role') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.roles">Cancel</a>
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

    .permission-group {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.9rem 1rem;
      margin: 0;
    }

    legend {
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0 0.35rem;
    }

    .permission-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 0.4rem 1rem;
    }

    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
    }

    .checkbox-field input {
      width: auto;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  /** Bound from the route via withComponentInputBinding(). */
  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly accessControl = inject(AccessControlService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly permissionsError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly permissions = signal<PermissionResponse[]>([]);
  readonly selectedIds = signal<Set<number>>(new Set());

  readonly isEdit = computed(() => !!this.id());

  readonly permissionGroups = computed<PermissionGroup[]>(() => {
    const groups = new Map<string, PermissionResponse[]>();

    for (const permission of this.permissions()) {
      const category = permission.category || this.deriveCategory(permission.name);
      groups.set(category, [...(groups.get(category) ?? []), permission]);
    }

    return [...groups.entries()]
      .map(([category, permissions]) => ({
        category,
        permissions: [...permissions].sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  });

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    description: ['', [Validators.maxLength(255)]],
    enabled: true
  });

  ngOnInit(): void {
    void this.loadPermissions();
    void this.reload();
  }

  async loadPermissions(): Promise<void> {
    this.permissionsError.set(null);

    try {
      this.permissions.set(await firstValueFrom(this.accessControl.getPermissions()));
    } catch (error) {
      this.permissionsError.set(toApiError(error).message);
    }
  }

  async reload(): Promise<void> {
    const roleId = this.id();
    if (!roleId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const role = await firstValueFrom(this.accessControl.getRole(Number(roleId)));
      this.form.patchValue({
        name: role.name,
        description: role.description ?? '',
        enabled: role.enabled ?? true
      });
      this.selectedIds.set(new Set((role.permissions ?? []).map((permission) => permission.id)));
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  togglePermission(permissionId: number): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      next.has(permissionId) ? next.delete(permissionId) : next.add(permissionId);
      return next;
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
    const permissionIds = [...this.selectedIds()];
    const roleId = this.id();

    try {
      // Land on the record that was just written, not the list it came from
      // (§32): the operator's next move is almost always about this one.
      const saved = roleId
        ? await firstValueFrom(this.accessControl.updateRole(Number(roleId), {
          name: value.name,
          description: value.description || undefined,
          enabled: value.enabled,
          permissionIds
        }))
        : await firstValueFrom(this.accessControl.createRole({
          name: value.name,
          description: value.description || undefined,
          permissionIds
        }));

      await this.router.navigateByUrl(RoutePaths.roleDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private deriveCategory(name: string): string {
    const [resource] = name.split('_');
    return resource || 'General';
  }
}
