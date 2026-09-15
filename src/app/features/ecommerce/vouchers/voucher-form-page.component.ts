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
  selector: 'app-voucher-form-page',
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
        <app-loading-state label="Loading voucher..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit voucher' : 'New voucher'">

            <div class="grid-auto">
              @if (!isEdit()) {
                <label class="field">
                  <span>Code</span>
                  <input formControlName="code" placeholder="WELCOME10">
                  @if (form.controls.code.invalid && form.controls.code.touched) {
                    <small class="error-text">Code is required.</small>
                  }
                </label>
              }

              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Welcome discount">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              @if (!isEdit()) {
                <label class="field">
                  <span>Discount type</span>
                  <select formControlName="discountType">
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED_AMOUNT">Fixed amount</option>
                    <option value="FREE_DELIVERY">Free delivery</option>
                  </select>
                </label>

                <label class="field">
                  <span>Discount value</span>
                  <input type="number" step="0.01" min="0" formControlName="discountValue">
                  @if (form.controls.discountValue.invalid && form.controls.discountValue.touched) {
                    <small class="error-text">Discount value is required and cannot be negative.</small>
                  }
                </label>
              }

              <label class="field">
                <span>Min order amount</span>
                <input type="number" step="0.01" min="0" formControlName="minOrderAmount">
              </label>

              <label class="field">
                <span>Max discount amount</span>
                <input type="number" step="0.01" min="0" formControlName="maxDiscountAmount">
                <small class="hint">Caps a percentage discount. Leave empty for no cap.</small>
              </label>

              <label class="field">
                <span>Valid from</span>
                <input type="datetime-local" formControlName="validFrom">
              </label>

              <label class="field">
                <span>Valid until</span>
                <input type="datetime-local" formControlName="validUntil">
              </label>

              <label class="field">
                <span>Max uses</span>
                <input type="number" min="1" formControlName="maxUses">
                <small class="hint">Leave empty for unlimited redemptions.</small>
              </label>

              <label class="field">
                <span>Max uses per user</span>
                <input type="number" min="1" formControlName="maxUsesPerUser">
              </label>

              @if (!isEdit()) {
                <label class="field">
                  <span>Assigned user ID</span>
                  <app-entity-picker [config]="pickers.user" formControlName="assignedUserId" placeholder="Everyone" />
                  <small class="hint">Leave empty to make the voucher available to everyone.</small>
                </label>
              } @else {
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Unchanged</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
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
              [title]="apiError.status === 409 ? 'Voucher code already exists' : 'Unable to save voucher'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create voucher') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.vouchers">Cancel</a>
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
export class VoucherFormPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;

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
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: [null as number | null, [Validators.required, Validators.min(0)]],
    minOrderAmount: [null as number | null],
    maxDiscountAmount: [null as number | null],
    validFrom: '',
    validUntil: '',
    maxUses: [null as number | null],
    maxUsesPerUser: [null as number | null],
    assignedUserId: [null as number | null],
    status: ''
  });

  ngOnInit(): void {
    if (this.isEdit()) {
      // Code, type and value are immutable after creation — the backend's UpdateRequest omits them.
      this.form.controls.code.clearValidators();
      this.form.controls.code.updateValueAndValidity();
      this.form.controls.discountValue.clearValidators();
      this.form.controls.discountValue.updateValueAndValidity();
    }

    void this.reload();
  }

  async reload(): Promise<void> {
    const voucherId = this.id();
    if (!voucherId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const voucher = await firstValueFrom(this.commerce.getVoucher(Number(voucherId)));
      this.form.patchValue({
        code: voucher.code,
        name: voucher.name,
        description: voucher.description ?? '',
        discountType: voucher.discountType,
        discountValue: Number(voucher.discountValue ?? 0),
        minOrderAmount: voucher.minOrderAmount === null || voucher.minOrderAmount === undefined ? null : Number(voucher.minOrderAmount),
        maxDiscountAmount: voucher.maxDiscountAmount === null || voucher.maxDiscountAmount === undefined ? null : Number(voucher.maxDiscountAmount),
        validFrom: this.toLocalInput(voucher.validFrom),
        validUntil: this.toLocalInput(voucher.validUntil),
        maxUses: voucher.maxUses ?? null,
        maxUsesPerUser: voucher.maxUsesPerUser ?? null,
        status: voucher.status ?? ''
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
    const voucherId = this.id();

    try {
      const saved = voucherId
        ? await firstValueFrom(this.commerce.updateVoucher(Number(voucherId), {
          name: value.name,
          description: value.description || null,
          status: value.status || null,
          minOrderAmount: value.minOrderAmount,
          maxDiscountAmount: value.maxDiscountAmount,
          validFrom: value.validFrom || null,
          validUntil: value.validUntil || null,
          maxUses: value.maxUses,
          maxUsesPerUser: value.maxUsesPerUser
        }))
        : await firstValueFrom(this.commerce.createVoucher({
          code: value.code,
          name: value.name,
          description: value.description || null,
          discountType: value.discountType,
          discountValue: value.discountValue!,
          minOrderAmount: value.minOrderAmount,
          maxDiscountAmount: value.maxDiscountAmount,
          validFrom: value.validFrom || null,
          validUntil: value.validUntil || null,
          maxUses: value.maxUses,
          maxUsesPerUser: value.maxUsesPerUser,
          assignedUserId: value.assignedUserId
        }));

      await this.router.navigateByUrl(RoutePaths.voucherDetail(saved.id));
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

    // Backend sends "yyyy-MM-dd HH:mm:ss" or ISO — both trim cleanly to the datetime-local shape.
    return value.replace(' ', 'T').slice(0, 16);
  }
}
