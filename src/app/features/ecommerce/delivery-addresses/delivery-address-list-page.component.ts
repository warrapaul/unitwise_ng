import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';
import { DeliveryAddressPreview } from '../models/commerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';

/** Below this, a grid of cards reads better than a table (§28.7). */
const COMPACT_THRESHOLD = 5;

@Component({
  selector: 'app-delivery-address-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    EntityPickerComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="title()" [subtitle]="subtitle()">
        <ng-container actions>
          <a class="btn btn-primary" [routerLink]="RoutePaths.deliveryAddressCreate">New address</a>
        </ng-container>

        <app-filter-panel (clear)="clear()" actions [form]="form">
          <app-permission-gate [permissions]="[Permissions.DELIVERY_ADDRESS_READ_ALL]">
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field">
                  <span>User ID</span>
                  <app-entity-picker [config]="pickers.user" formControlName="userId" placeholder="My addresses" />
                </label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Load</button>
                <button type="button" class="btn btn-secondary" (click)="clear()">My addresses</button>
              </div>
            </form>
          </app-permission-gate>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading addresses..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (addresses().length === 0) {
        @if (viewingSomeoneElse()) {
          <app-empty-state
            title="No addresses for that user"
            description="They have not saved one yet."
          />
        } @else {
          <app-empty-state
            title="No addresses saved"
            description="Save one and it is offered at checkout, and anywhere else this app needs to know where you are."
            actionLabel="Add address"
            [actionLink]="RoutePaths.deliveryAddressCreate"
          />
        }
      } @else if (compact()) {
        <div class="record-grid">
          @for (address of addresses(); track address.id) {
            <article class="record-card">
              <header class="record-card__head">
                <a class="record-card__title" [routerLink]="RoutePaths.deliveryAddressDetail(address.id)">
                  {{ address.addressNickname || 'Address #' + address.id }}
                </a>
                <div class="chip-row">
                  @if (address.isDefault) {
                    <span class="status-chip status-chip--info">Default</span>
                  }
                  <span class="status-chip" [ngClass]="address.isVerified ? 'status-chip--success' : 'status-chip--warning'">
                    {{ address.isVerified ? 'Verified' : 'Unverified' }}
                  </span>
                </div>
              </header>

              <!-- The list DTO carries the composed line, not the parts. -->
              <p>{{ address.fullAddress || address.city || 'No address details' }}</p>

              @if (address.buildingName) {
                <p class="muted">{{ address.buildingName }}{{ address.unitNumber ? ' · ' + address.unitNumber : '' }}</p>
              }

              @if (address.contactPhone) {
                <p class="muted mono">{{ address.contactPhone }}</p>
              }

              <div class="button-row">
                <app-permission-gate [permissions]="[Permissions.DELIVERY_ADDRESS_VERIFY, Permissions.DELIVERY_ADDRESS_WRITE_ALL]">
                  @if (!address.isVerified) {
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      [disabled]="verifyingId() === address.id"
                      (click)="verify(address)"
                    >
                      {{ verifyingId() === address.id ? 'Verifying...' : 'Verify' }}
                    </button>
                  }
                </app-permission-gate>
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.deliveryAddressEdit(address.id)">Edit</a>
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.deliveryAddressDetail(address.id)">Open</a>
              </div>
            </article>
          }
        </div>
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Address</th><th>Contact</th><th>Building</th><th>Verified</th><th class="actions-col">Actions</th></tr>
              </thead>
              <tbody>
                @for (address of addresses(); track address.id) {
                  <tr [appRowLink]="RoutePaths.deliveryAddressDetail(address.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.deliveryAddressDetail(address.id)">
                          {{ address.addressNickname || 'Address #' + address.id }}
                        </a>
                        <span class="muted">{{ address.fullAddress || address.city || '-' }}</span>
                      </div>
                    </td>
                    <td class="mono">{{ address.contactPhone || '-' }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ address.buildingName || '-' }}</span>
                        <span class="muted">{{ address.unitNumber || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="chip-row">
                        <span class="status-chip" [ngClass]="address.isVerified ? 'status-chip--success' : 'status-chip--warning'">
                          {{ address.isVerified ? 'Verified' : 'Unverified' }}
                        </span>
                        @if (address.isDefault) {
                          <span class="status-chip status-chip--info">Default</span>
                        }
                      </div>
                    </td>
                    <td class="actions-col">
                      <div class="row-actions">
                        <app-permission-gate [permissions]="[Permissions.DELIVERY_ADDRESS_VERIFY, Permissions.DELIVERY_ADDRESS_WRITE_ALL]">
                          @if (!address.isVerified) {
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              [disabled]="verifyingId() === address.id"
                              (click)="verify(address)"
                            >
                              {{ verifyingId() === address.id ? 'Verifying...' : 'Verify' }}
                            </button>
                          }
                        </app-permission-gate>
                      </div>
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
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliveryAddressListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly commerce = inject(CommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly addresses = signal<DeliveryAddressPreview[]>([]);
  readonly verifyingId = signal<number | null>(null);

  readonly form = this.formBuilder.group({
    userId: [null as number | null]
  });

  /** Set only when an admin has loaded somebody else's book. */
  readonly loadedUserId = signal<number | null>(null);

  readonly viewingSomeoneElse = computed(() => this.loadedUserId() !== null);

  readonly compact = computed(() => this.addresses().length <= COMPACT_THRESHOLD);

  title(): string {
    return this.viewingSomeoneElse() ? `Addresses for user #${this.loadedUserId()}` : 'My addresses';
  }

  subtitle(): string {
    return this.viewingSomeoneElse()
      ? 'Saved by that user. Verifying one confirms somebody has been there.'
      : 'Where deliveries and paperwork should find you. They belong to you, not to any one tenancy.';
  }

  ngOnInit(): void {
    void this.reload();
  }

  async search(): Promise<void> {
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.patchValue({ userId: null });
    await this.reload();
  }

  async verify(address: DeliveryAddressPreview): Promise<void> {
    this.verifyingId.set(address.id);
    this.error.set(null);

    try {
      await firstValueFrom(this.commerce.verifyDeliveryAddress(address.id));
      this.addresses.update((items) =>
        items.map((item) => (item.id === address.id ? { ...item, isVerified: true } : item))
      );
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.verifyingId.set(null);
    }
  }


  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const userId = this.form.getRawValue().userId;

    try {
      const result = userId
        ? await firstValueFrom(this.commerce.getDeliveryAddressesForUser(userId))
        : await firstValueFrom(this.commerce.getMyDeliveryAddresses());
      this.addresses.set(result);
      this.loadedUserId.set(userId ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
