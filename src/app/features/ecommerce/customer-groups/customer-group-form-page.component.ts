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
import { CatalogAdminService } from '../catalog-admin.service';

@Component({
  selector: 'app-customer-group-form-page',
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
        <app-loading-state label="Loading group..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit customer group' : 'New customer group'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Wholesale buyers">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>
              <label class="field">
                <span>Description</span>
                <input formControlName="description">
              </label>
            </div>

            @if (isEdit()) {
              <label class="checkbox-field">
                <input type="checkbox" formControlName="isActive">
                <span>Active</span>
              </label>
            }
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Group already exists' : 'Unable to save group'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create group') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.customerGroups">Cancel</a>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerGroupFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: '',
    isActive: true
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const groupId = this.id();
    if (!groupId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const group = await firstValueFrom(this.catalogAdmin.getCustomerGroup(Number(groupId)));
      this.form.patchValue({
        name: group.name,
        description: group.description ?? '',
        isActive: group.isActive ?? true
      });
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
    const groupId = this.id();

    try {
      const saved = groupId
        ? await firstValueFrom(this.catalogAdmin.updateCustomerGroup(Number(groupId), {
          name: value.name,
          description: value.description || null,
          isActive: value.isActive
        }))
        : await firstValueFrom(this.catalogAdmin.createCustomerGroup({
          name: value.name,
          description: value.description || null
        }));

      await this.router.navigateByUrl(RoutePaths.customerGroupDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
