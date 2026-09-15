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
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';

@Component({
  selector: 'app-partial-payment-policy-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    EntityPickerComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading policy..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit policy' : 'New partial payment policy'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Standard 30% deposit">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field">
                <span>Min down payment (%)</span>
                <input type="number" step="0.01" min="0" max="100" formControlName="minDownPaymentPercent">
                @if (form.controls.minDownPaymentPercent.invalid && form.controls.minDownPaymentPercent.touched) {
                  <small class="error-text">Enter a percentage between 0 and 100.</small>
                }
              </label>

              <label class="field">
                <span>Balance due (days)</span>
                <input type="number" min="1" formControlName="balanceDueDays">
                @if (form.controls.balanceDueDays.invalid && form.controls.balanceDueDays.touched) {
                  <small class="error-text">Enter at least 1 day.</small>
                }
              </label>

              @if (!isEdit()) {
                <label class="field">
                  <span>Customer group ID</span>
                  <app-entity-picker [config]="pickers.customerGroup" formControlName="customerGroupId" placeholder="All customers" />
                  <small class="hint">Leave empty to apply to all customers.</small>
                </label>

                <label class="field">
                  <span>Product group ID</span>
                  <input type="number" min="1" formControlName="productGroupId">
                  <small class="hint">Leave empty to apply to all products.</small>
                </label>
              } @else {
                <label class="checkbox-field">
                  <input type="checkbox" formControlName="isActive">
                  <span>Active</span>
                </label>
              }
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Policy already exists' : 'Unable to save policy'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create policy') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.partialPaymentPolicies">Cancel</a>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PartialPaymentPolicyFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly pickers = inject(EntityPickerRegistry);

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly commerce = inject(CommerceService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: '',
    customerGroupId: [null as number | null],
    productGroupId: [null as number | null],
    minDownPaymentPercent: [null as number | null, [Validators.required, Validators.min(0), Validators.max(100)]],
    balanceDueDays: [null as number | null, [Validators.required, Validators.min(1)]],
    isActive: true
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const policyId = this.id();
    if (!policyId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const policy = await firstValueFrom(this.commerce.getPartialPaymentPolicy(Number(policyId)));
      this.form.patchValue({
        name: policy.name,
        description: policy.description ?? '',
        customerGroupId: policy.customerGroupId ?? null,
        productGroupId: policy.productGroupId ?? null,
        minDownPaymentPercent: policy.minDownPaymentPercent === null || policy.minDownPaymentPercent === undefined
          ? null
          : Number(policy.minDownPaymentPercent),
        balanceDueDays: policy.balanceDueDays ?? null,
        isActive: policy.isActive ?? true
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
    const policyId = this.id();

    try {
      if (policyId) {
        await firstValueFrom(this.commerce.updatePartialPaymentPolicy(Number(policyId), {
          name: value.name,
          description: value.description || null,
          minDownPaymentPercent: value.minDownPaymentPercent,
          balanceDueDays: value.balanceDueDays,
          isActive: value.isActive
        }));
      } else {
        await firstValueFrom(this.commerce.createPartialPaymentPolicy({
          name: value.name,
          description: value.description || null,
          customerGroupId: value.customerGroupId,
          productGroupId: value.productGroupId,
          minDownPaymentPercent: value.minDownPaymentPercent!,
          balanceDueDays: value.balanceDueDays!
        }));
      }

      await this.router.navigateByUrl(RoutePaths.partialPaymentPolicies);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
