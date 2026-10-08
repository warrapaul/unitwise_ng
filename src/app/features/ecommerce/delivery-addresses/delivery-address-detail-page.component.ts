import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { AddressLike, AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';
import { CommerceService } from '../commerce.service';
import { DeliveryAddressDetail } from '../models/commerce.models';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-delivery-address-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, 
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    ErrorCardComponent,
    BackLinkComponent,
    AddressPreviewComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.deliveryAddresses" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading address..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (address(); as detail) {
        <app-section-card
          [title]="detail.addressNickname || ('Address #' + detail.id)"
          [subtitle]="detail.fullAddress || detail.addressLine1 || null"
        >
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.DELIVERY_ADDRESS_VERIFY]">
                @if (!detail.isVerified) {
                  <button type="button" class="btn btn-secondary" [disabled]="verifying()" (click)="verify()">
                    {{ verifying() ? 'Verifying...' : 'Mark verified' }}
                  </button>
                }
              </app-permission-gate>
              <a class="icon-action" [routerLink]="RoutePaths.deliveryAddressEdit(detail.id)" aria-label="Edit delivery address" title="Edit delivery address">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
              </a>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This address is in use' : 'Unable to delete the address'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <!--
            Added for them by a rider or the shop: theirs to accept or remove.
            Saved either way, so the next order can use it once confirmed.
          -->
          @if (detail.customerConfirmed === false) {
            <section class="alert alert-warning confirm-address" role="status">
              <div>
                <strong>{{ detail.origin === 'RIDER' ? 'A rider added this address for you' : 'The shop added this address for you' }}</strong>
                <p>Is it right? Confirm it to use it for your orders, or delete it.</p>
              </div>
              <div class="button-row">
                <button type="button" class="btn btn-primary btn-sm" [disabled]="confirming()" (click)="confirmAddress(detail)">
                  {{ confirming() ? 'Confirming...' : 'Yes, confirm' }}
                </button>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="deleting()" (click)="remove(detail)">Delete</button>
              </div>
            </section>
          }

          <app-address-preview [address]="asAddress(detail)" [block]="true" />

          <dl class="detail-grid">
            <div><dt>Landmark</dt><dd>{{ detail.landmark || '-' }}</dd></div>
            <div><dt>Contact phone</dt><dd class="mono">{{ detail.contactPhone || '-' }}</dd></div>
            <div><dt>Building</dt><dd>{{ detail.buildingName || '-' }}</dd></div>
            <div><dt>Unit</dt><dd>{{ detail.unitNumber || '-' }}</dd></div>
            <div><dt>Tenant residence</dt><dd>{{ detail.isTenantResidence ? 'Yes' : 'No' }}</dd></div>
            <div>
              <dt>Verified</dt>
              <dd>
                <span class="status-chip" [ngClass]="detail.isVerified ? 'status-chip--success' : 'status-chip--warning'">
                  {{ detail.isVerified ? 'Verified' : 'Unverified' }}
                </span>
              </dd>
            </div>
            <div><dt>Verified by</dt><dd>{{ detail.verifiedByName || '-' }}</dd></div>
            <div><dt>Verified at</dt><dd>{{ formatDate(detail.lastVerifiedAt) }}</dd></div>
          </dl>

          @if (detail.deliveryNote) {
            <p class="muted">{{ detail.deliveryNote }}</p>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-danger-zone label="Delete address" [busy]="deleting()" (pressed)="remove(detail)" />
      }
    </section>
  `,
  styles: [`
    .confirm-address { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.6rem 1rem; }
    .confirm-address p { margin: 0.2rem 0 0; }
    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliveryAddressDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  /**
   * The registry place where one was picked, with the street line and the
   * landmark — what a rider actually navigates by — as the note.
   */
  asAddress(detail: DeliveryAddressDetail): AddressLike {
    return {
      ...(detail.address ?? {}),
      description: [detail.addressLine1, detail.landmark].filter(Boolean).join(' — ') || null,
      latitude: detail.latitude,
      longitude: detail.longitude
    };
  }

  private readonly confirm = inject(ConfirmService);
  private readonly commerce = inject(CommerceService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);

  /** A rejected delete, shown on the page rather than replacing it (§31.2). */
  readonly actionError = signal<ApiError | null>(null);
  readonly verifying = signal(false);
  readonly address = signal<DeliveryAddressDetail | null>(null);

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.address.set(await firstValueFrom(this.commerce.getDeliveryAddress(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  readonly confirming = signal(false);

  async confirmAddress(address: DeliveryAddressDetail): Promise<void> {
    this.confirming.set(true);
    this.actionError.set(null);
    try {
      this.address.set(await firstValueFrom(this.commerce.confirmDeliveryAddress(address.id)));
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.confirming.set(false);
    }
  }

  async verify(): Promise<void> {
    this.verifying.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.commerce.verifyDeliveryAddress(Number(this.id())));
      await this.reload();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.verifying.set(false);
    }
  }

  async remove(address: DeliveryAddressDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete "${address.addressNickname || 'address #' + address.id}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.commerce.deleteDeliveryAddress(address.id));
      await this.router.navigateByUrl(RoutePaths.deliveryAddresses);
    } catch (error) {
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
    return Number.isNaN(date.getTime()) ? value : displayDateTime(date);
  }
}
