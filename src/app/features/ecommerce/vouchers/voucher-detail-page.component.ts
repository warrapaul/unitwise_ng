import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';
import { Voucher, VoucherValidation } from '../models/commerce.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-voucher-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, 
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    ErrorCardComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.vouchers" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading voucher..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (voucher(); as detail) {
        <app-section-card [title]="detail.code" [subtitle]="detail.name">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.VOUCHER_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.voucherEdit(detail.id)">Edit</a>
              </app-permission-gate>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This voucher is in use' : 'Unable to delete the voucher'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <dl class="detail-grid">
            <div><dt>Discount</dt><dd>{{ detail.discountType | humanLabel }} — {{ detail.discountValue }}</dd></div>
            <div><dt>Min order</dt><dd>{{ detail.minOrderAmount ?? '-' }}</dd></div>
            <div><dt>Max discount</dt><dd>{{ detail.maxDiscountAmount ?? '-' }}</dd></div>
            <div><dt>Valid from</dt><dd>{{ formatDate(detail.validFrom) }}</dd></div>
            <div><dt>Valid until</dt><dd>{{ formatDate(detail.validUntil) }}</dd></div>
            <div><dt>Redemptions</dt><dd>{{ detail.usageCount ?? 0 }}{{ detail.maxUses ? ' / ' + detail.maxUses : '' }}</dd></div>
            <div><dt>Per-user limit</dt><dd>{{ detail.maxUsesPerUser ?? '-' }}</dd></div>
            <div><dt>User specific</dt><dd>{{ detail.isUserSpecific ? 'Yes' : 'No' }}</dd></div>
            <div><dt>Product restrictions</dt><dd>{{ detail.hasProductRestrictions ? 'Yes' : 'No' }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
          </dl>

          @if (detail.description) {
            <p>{{ detail.description }}</p>
          }
        </app-section-card>

        <app-section-card title="Test redemption">
          <form [formGroup]="validateForm" appFormFeedback (ngSubmit)="validate()">
            <div class="grid-auto">
              <label class="field">
                <span>Order subtotal</span>
                <input type="number" step="0.01" min="0" formControlName="orderSubtotal">
                @if (validateForm.controls.orderSubtotal.invalid && validateForm.controls.orderSubtotal.touched) {
                  <small class="error-text">Enter a subtotal to test against.</small>
                }
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-secondary" [disabled]="validating()">
                {{ validating() ? 'Checking...' : 'Check' }}
              </button>
            </div>
          </form>

          @if (validation(); as result) {
            <section class="alert" [class.alert-success]="result.isValid" [class.alert-error]="!result.isValid" role="status">
              @if (result.isValid) {
                <strong>Valid</strong>
                <p>Discount applied: {{ result.discountAmount ?? 0 }}</p>
              } @else {
                <strong>Not valid</strong>
                <p>{{ result.error || 'This voucher cannot be applied to that subtotal.' }}</p>
              }
            </section>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.VOUCHER_DELETE]">
          <app-danger-zone label="Delete voucher" [busy]="deleting()" (pressed)="remove(detail)" />
        </app-permission-gate>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VoucherDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly commerce = inject(CommerceService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);

  /** A rejected delete, shown on the page rather than replacing it (§31.2). */
  readonly actionError = signal<ApiError | null>(null);
  readonly voucher = signal<Voucher | null>(null);

  readonly validating = signal(false);
  readonly validation = signal<VoucherValidation | null>(null);

  readonly validateForm = this.formBuilder.group({
    orderSubtotal: [null as number | null, [Validators.required, Validators.min(0)]]
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // The stats endpoint returns the same shape enriched with usage counters.
      this.voucher.set(await firstValueFrom(this.commerce.getVoucherStatistics(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async validate(): Promise<void> {
    if (this.validateForm.invalid) {
      this.validateForm.markAllAsTouched();
      return;
    }

    const code = this.voucher()?.code;
    if (!code) {
      return;
    }

    this.validating.set(true);
    this.validation.set(null);

    try {
      const result = await firstValueFrom(
        this.commerce.validateVoucher(code, this.validateForm.getRawValue().orderSubtotal!)
      );
      this.validation.set(result);
    } catch (error) {
      this.validation.set({ isValid: false, error: extractErrorMessage(error) });
    } finally {
      this.validating.set(false);
    }
  }

  async remove(voucher: Voucher): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete voucher ${voucher.code}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.commerce.deleteVoucher(voucher.id));
      await this.router.navigateByUrl(RoutePaths.vouchers);
    } catch (error) {
      // Not `error`: that renders the error-state which replaces the voucher
      // with a "retry the load" button, losing the page the operator is on.
      this.actionError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
