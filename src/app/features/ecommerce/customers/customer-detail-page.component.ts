import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { EcomCustomerDetail, EcomCustomerSource } from '../models/ecommerce.models';
import { EcommerceService } from '../ecommerce.service';
import { CustomerAddressesComponent } from './customer-addresses.component';

const SOURCE_LABELS: Record<EcomCustomerSource, string> = {
  SELF_SERVICE: 'Signed up themselves',
  PHONE_ORDER: 'Phone order',
  ADMIN_CREATED: 'Added by staff',
  RIDER_CREATED: 'Added by a rider'
};

/**
 * One customer, for the ecommerce desk: who they are as a buyer, the desk's
 * own notes, and the two levers staff hold — pay on delivery, and blocking.
 * Nothing about tenancies or ID numbers: that is not this desk's business.
 */
@Component({
  selector: 'app-customer-detail-page',
  standalone: true,
  imports: [CustomerAddressesComponent, RouterLink, ReactiveFormsModule, BackLinkComponent, SectionCardComponent, LoadingStateComponent,
    ErrorStateComponent, ErrorCardComponent, DetailGroupComponent, PermissionGateComponent, FormFeedbackDirective],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.ecomCustomers" label="Back to customers" [title]="name()" />

      @if (loading()) {
        <app-loading-state label="Loading customer..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (customer(); as c) {
        <!-- Side by side on a wide screen; one column on a narrow one (styles.scss .card-pair). -->
        <div class="card-pair">
        <app-section-card [title]="name()" [subtitle]="c.phoneNumber || null">
          <ng-container actions>
            @if (c.status === 'ACTIVE') {
              <app-permission-gate [permissions]="['ORDER_CREATE_FOR_OTHERS']">
                <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.ecomPhoneOrder(c.id)">Phone order</a>
              </app-permission-gate>
            }
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomOrders" [queryParams]="{ customerId: c.id }">Orders</a>
          </ng-container>

          @if (c.status === 'BLOCKED') {
            <section class="alert alert-error" role="status">
              <strong>Blocked</strong>@if (c.blockedAt) { <span> since {{ date(c.blockedAt) }}</span> }
              @if (c.blockedReason) { <p>{{ c.blockedReason }}</p> }
            </section>
          }

          <div class="detail-groups">
            <app-detail-group label="Customer">
              <div class="lead"><dt>Status</dt><dd>{{ c.status === 'BLOCKED' ? 'Blocked' : 'Active' }}</dd></div>
              <div><dt>Account</dt><dd>{{ c.claimed ? 'Claimed by them' : 'Not claimed yet' }}</dd></div>
              <div><dt>Joined</dt><dd>{{ sourceLabel(c.source) }} · {{ date(c.createdAt) }}</dd></div>
              <div><dt>Email</dt><dd>{{ c.email || '-' }}</dd></div>
            </app-detail-group>
            <app-detail-group label="Orders">
              <div class="lead"><dt>Orders</dt><dd>{{ c.orderCount }}</dd></div>
              <div><dt>First</dt><dd>{{ date(c.firstOrderAt) }}</dd></div>
              <div><dt>Latest</dt><dd>{{ date(c.lastOrderAt) }}</dd></div>
              <div><dt>Pay on delivery</dt><dd>{{ c.payOnDeliveryAllowed ? 'Allowed' : 'Not allowed' }}</dd></div>
            </app-detail-group>
            <app-detail-group label="Their preferences">
              <div><dt>Delivery instructions</dt><dd>{{ c.standingDeliveryInstructions || '-' }}</dd></div>
              <div><dt>SMS offers</dt><dd>{{ c.marketingSmsConsent ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Email offers</dt><dd>{{ c.marketingEmailConsent ? 'Yes' : 'No' }}</dd></div>
            </app-detail-group>
          </div>
        </app-section-card>

        <app-customer-addresses [customerId]="c.id" [customerPhone]="c.phoneNumber || null" />
        </div>

        <app-permission-gate [permissions]="['ECOM_CUSTOMER_UPDATE']">
          <!-- Side by side on a wide screen; one column on a narrow one (styles.scss .card-pair). -->
          <div class="card-pair">
          <app-section-card title="For the desk" subtitle="Seen by staff only.">
            <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="saveDesk()">
              <label class="field field--wide">
                <span>Staff notes</span>
                <textarea formControlName="staffNotes" rows="3" placeholder="e.g. Prefers calls after 6pm; gate code 1234"></textarea>
              </label>
              <label class="checkbox-field">
                <input type="checkbox" formControlName="payOnDeliveryAllowed">
                <span>May pay on delivery</span>
              </label>
              @if (saveError(); as apiError) {
                <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
              }
              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine">{{ saving() ? 'Saving...' : 'Save' }}</button>
              </div>
            </form>
          </app-section-card>

          <!-- Blocking stops new orders; worded and last, away from the everyday edits. -->
          <app-section-card [title]="c.status === 'BLOCKED' ? 'Unblock' : 'Block'">
            <div class="block-row">
              <p class="muted">
                {{ c.status === 'BLOCKED'
                  ? 'Let them order again.'
                  : 'They can no longer place orders. Their order history stays.' }}
              </p>
              @if (c.status === 'BLOCKED') {
                <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="unblock()">Unblock</button>
              } @else {
                <button type="button" class="btn btn-danger" [disabled]="saving()" (click)="block()">Block customer</button>
              }
            </div>
          </app-section-card>
          </div>
        </app-permission-gate>
      }
    </section>
  `,
  styles: [`
    .block-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .alert p { margin: 0.35rem 0 0; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input.required<string>();

  private readonly ecommerce = inject(EcommerceService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly context = inject(ActiveContextService);

  readonly customer = signal<EcomCustomerDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.fb.group({ staffNotes: '', payOnDeliveryAllowed: true });

  readonly name = computed(() => {
    const c = this.customer();
    return c ? [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ') || c.phoneNumber || `Customer #${c.id}` : '';
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.apply(await firstValueFrom(this.ecommerce.getEcomCustomer(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async saveDesk(): Promise<void> {
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      this.apply(await firstValueFrom(this.ecommerce.updateEcomCustomer(Number(this.id()), {
        staffNotes: value.staffNotes.trim() || null,
        payOnDeliveryAllowed: value.payOnDeliveryAllowed
      })));
      this.notifications.push('success', 'Saved.');
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async block(): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: `Block ${this.name()}?`,
      message: 'They will not be able to place orders until unblocked.',
      confirmLabel: 'Block',
      destructive: true,
      reason: { label: 'Reason', required: true, placeholder: 'e.g. Refused three pay-on-delivery orders', maxLength: 500 }
    });
    if (reason === null) {
      return;
    }
    await this.run(() => this.ecommerce.blockEcomCustomer(Number(this.id()), reason));
  }

  async unblock(): Promise<void> {
    if (!await this.confirm.ask({ title: `Unblock ${this.name()}?`, confirmLabel: 'Unblock' })) {
      return;
    }
    await this.run(() => this.ecommerce.unblockEcomCustomer(Number(this.id())));
  }

  sourceLabel(source: EcomCustomerSource): string {
    return SOURCE_LABELS[source] ?? source;
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }

  private async run(action: () => ReturnType<EcommerceService['unblockEcomCustomer']>): Promise<void> {
    this.saving.set(true);
    try {
      this.apply(await firstValueFrom(action()));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private apply(customer: EcomCustomerDetail): void {
    this.customer.set(customer);
    this.form.reset({ staffNotes: customer.staffNotes ?? '', payOnDeliveryAllowed: customer.payOnDeliveryAllowed });
  }
}
