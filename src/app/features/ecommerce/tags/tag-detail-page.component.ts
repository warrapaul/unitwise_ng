import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { CatalogAdminService } from '../catalog-admin.service';
import { ProductTag } from '../models/catalog.models';
import { ConfirmService } from '../../../shared/services/confirm.service';

/**
 * The tag's detail view. Tags are small enough that the detail view is the edit
 * form itself — but read, update, and delete all live here rather than inline on
 * the listing table (skills §28.4).
 */
@Component({
  selector: 'app-tag-detail-page',
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
    BackLinkComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.ecomTags" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading tag..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? (tag()?.name || 'Tag') : 'New tag'" [subtitle]="isEdit() ? tag()?.slug || null : 'Group products for merchandising.'">
            <ng-container actions>
              <div class="action-bar">
                @if (isEdit()) {
                  <app-permission-gate [permissions]="[Permissions.TAG_DELETE]">
                    <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove()">
                      {{ deleting() ? 'Deleting...' : 'Delete' }}
                    </button>
                  </app-permission-gate>
                }
              </div>
            </ng-container>

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Best seller">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>
              <label class="field">
                <span>Slug</span>
                <input formControlName="slug" placeholder="best-seller">
                <small class="hint">Leave empty to let the backend derive it from the name.</small>
              </label>
              <label class="field">
                <span>Description</span>
                <input formControlName="description">
              </label>
            </div>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Tag already exists' : 'Unable to save tag'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <app-permission-gate [permissions]="[Permissions.TAG_CREATE, Permissions.TAG_UPDATE]">
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : (isEdit() ? 'Save tag' : 'Create tag') }}
              </button>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomTags">Cancel</a>
            </div>
          </app-permission-gate>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .button-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TagDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly tag = signal<ProductTag | null>(null);

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    slug: '',
    description: ''
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    const tagId = this.id();
    if (!tagId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const tag = await firstValueFrom(this.catalogAdmin.getTag(Number(tagId)));
      this.tag.set(tag);
      this.form.patchValue({
        name: tag.name,
        slug: tag.slug ?? '',
        description: tag.description ?? ''
      });
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
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
    const request = {
      name: value.name,
      slug: value.slug || null,
      description: value.description || null
    };

    try {
      const tagId = this.id();
      if (tagId) {
        this.tag.set(await firstValueFrom(this.catalogAdmin.updateTag(Number(tagId), request)));
      } else {
        const created = await firstValueFrom(this.catalogAdmin.createTag(request));
        await this.router.navigateByUrl(RoutePaths.ecomTagDetail(created.id));
      }
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const tagId = this.id();
    if (!tagId || !await this.confirm.ask({
      title: `Delete the tag "${this.tag()?.name}"? Products keep their other tags.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.saveError.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.deleteTag(Number(tagId)));
      await this.router.navigateByUrl(RoutePaths.ecomTags);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
