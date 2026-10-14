import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { BuildingLinkDialogComponent, BuildingLinkFn } from '../../geo/components/building-link-dialog.component';
import { GeoBuildingPreview } from '../../geo/models/geo.models';
import { DoorDetailsComponent } from '../../geo/components/door-details.component';
import { DoorDetailsDialogComponent, DoorDetailsSaveFn } from '../../geo/components/door-details-dialog.component';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';
import { NotificationService } from '../../../core/services/notification.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { DeliveryAddressDetail } from '../models/commerce.models';
import { EcommerceService } from '../ecommerce.service';
import { CustomerAddressDialogComponent } from './customer-address-dialog.component';

/**
 * A customer's delivery addresses, for staff: what is on file, whether the
 * customer confirmed it and whether anyone has verified it on the ground, with
 * add, edit (the map pin included) and verify where the operator may.
 */
import { GeoContextComponent } from '../../geo/components/geo-context.component';
@Component({
  selector: 'app-customer-addresses',
  standalone: true,
  imports: [GeoContextComponent, BuildingLinkDialogComponent, DoorDetailsComponent, DoorDetailsDialogComponent, SectionCardComponent, PermissionGateComponent, AddressPreviewComponent, CustomerAddressDialogComponent],
  template: `
    <app-section-card title="Addresses" [subtitle]="addresses().length ? null : 'None on file yet.'">
      <ng-container actions>
        <app-permission-gate [permissions]="['DELIVERY_ADDRESS_WRITE_ALL']">
          <button type="button" class="btn btn-primary btn-sm" (click)="open(null)">Add address</button>
        </app-permission-gate>
      </ng-container>

      @if (loadError()) {
        <p class="error-text">{{ loadError() }}</p>
      }
      @if (addresses().length > 0) {
        <ul class="addresses">
          @for (address of addresses(); track address.id) {
            <li class="address">
              <div class="address__head">
                <strong>{{ address.addressNickname || address.addressLine1 || ('Address #' + address.id) }}</strong>
                <span class="chips">
                  @if (address.customerConfirmed === false) {
                    <span class="status-chip status-chip--warning">Awaiting the customer</span>
                  }
                  <span class="status-chip" [class.status-chip--success]="address.isVerified" [class.status-chip--neutral]="!address.isVerified">
                    {{ address.isVerified ? 'Verified' : 'Not verified' }}
                  </span>
                  @if (address.isDefault) { <span class="status-chip status-chip--info">Default</span> }
                </span>
              </div>
              <app-address-preview [address]="previewOf(address)" [block]="true" />
              <span class="muted">
                {{ address.contactPhone || 'No contact phone' }}
                @if (!hasPin(address)) { · No map pin yet }
              </span>
              <app-geo-context [geo]="address.geo" [latitude]="address.latitude" [longitude]="address.longitude"
                               [canLink]="canLink()" (linkCandidate)="startLink(address, $event)" />
              <app-door-details [door]="address.door" />
              <div class="address__actions">
                <app-permission-gate [permissions]="['DELIVERY_ADDRESS_WRITE_ALL']">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="open(address)">
                    {{ hasPin(address) ? 'Edit' : 'Edit / add pin' }}
                  </button>
                </app-permission-gate>
                <app-permission-gate [permissions]="['DELIVERY_ADDRESS_WRITE_ALL']">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="editingDoor.set(address)">
                    {{ address.door ? 'Edit door details' : 'Add door details' }}
                  </button>
                </app-permission-gate>
                @if (canLink()) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="startLink(address, null)">
                    {{ address.geo?.building ? 'Change building' : 'Link to a building' }}
                  </button>
                }
                @if (!address.isVerified) {
                  <app-permission-gate [permissions]="['DELIVERY_ADDRESS_VERIFY']">
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="verifyingId() === address.id" (click)="verify(address)">
                      {{ verifyingId() === address.id ? 'Verifying...' : 'Mark verified' }}
                    </button>
                  </app-permission-gate>
                }
              </div>
            </li>
          }
        </ul>
      }
    </app-section-card>

    @if (editingDoor(); as address) {
      <app-door-details-dialog [door]="address.door" [buildingName]="address.geo?.building?.name" [save]="saveDoor"
                               (saved)="editingDoor.set(null)" (closed)="editingDoor.set(null)"
                               (chooseBuilding)="editingDoor.set(null); startLink(address, null)" />
    }

    @if (linking(); as state) {
      <app-building-link-dialog [start]="pinOf(state.address)" [initialUnit]="state.address.unitNumber ?? null"
                                [suggested]="state.suggested" [link]="linkAddress"
                                (linked)="linking.set(null)" (closed)="linking.set(null)" />
    }

    @if (editing(); as state) {
      <app-customer-address-dialog [customerId]="customerId()" [address]="state.address" [customerPhone]="customerPhone()"
                                   (saved)="onSaved($event)" (closed)="editing.set(null)" />
    }
  `,
  styles: [`
    :host { display: contents; }
    .addresses { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
    .address { display: grid; gap: 0.35rem; padding: 0.7rem 0.85rem; border: 1px solid var(--border); border-radius: 12px; }
    .address__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.4rem 0.75rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .address__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerAddressesComponent {
  readonly customerId = input.required<number>();
  readonly customerPhone = input<string | null>(null);
  /** Already in hand (from a lookup): shown without another read. */
  readonly initial = input<DeliveryAddressDetail[] | null>(null);

  private readonly ecommerce = inject(EcommerceService);
  private readonly notifications = inject(NotificationService);

  readonly addresses = signal<DeliveryAddressDetail[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly editing = signal<{ address: DeliveryAddressDetail | null } | null>(null);
  readonly verifyingId = signal<number | null>(null);
  readonly linking = signal<{ address: DeliveryAddressDetail; suggested: GeoBuildingPreview | null } | null>(null);
  private readonly context = inject(ActiveContextService);
  /** Riders and the desk: they write addresses and can see buildings. */
  readonly canLink = computed(() => this.context.can('DELIVERY_ADDRESS_WRITE_ALL') && this.context.can('GEO_BUILDING_READ'));

  startLink(address: DeliveryAddressDetail, candidate: GeoBuildingPreview | null): void {
    this.linking.set({ address, suggested: candidate ? { ...candidate } : null });
  }

  pinOf(address: DeliveryAddressDetail): { lat: number; lng: number } | null {
    return address.latitude != null && address.longitude != null
      ? { lat: Number(address.latitude), lng: Number(address.longitude) }
      : null;
  }

  readonly editingDoor = signal<DeliveryAddressDetail | null>(null);

  readonly saveDoor: DoorDetailsSaveFn = async (request) => {
    const address = this.editingDoor();
    if (!address) {
      return;
    }
    const updated = await firstValueFrom(this.ecommerce.saveEcomCustomerAddressDoor(this.customerId(), address.id, request));
    this.addresses.update((list) => list.map((item) => item.id === updated.id ? updated : item));
    this.notifications.push('success', 'Door details saved.');
  };

  readonly linkAddress: BuildingLinkFn = async (geoBuildingId, unitNumber) => {
    const state = this.linking();
    if (!state) {
      return;
    }
    const updated = await firstValueFrom(this.ecommerce.linkEcomCustomerAddressBuilding(
      this.customerId(), state.address.id, { geoBuildingId, unitNumber }));
    this.addresses.update((list) => list.map((item) => item.id === updated.id ? updated : item));
    this.notifications.push('success', 'Building linked.');
  };

  constructor() {
    effect(() => {
      const id = this.customerId();
      const given = this.initial();
      untracked(() => given ? this.addresses.set(given) : void this.load(id));
    });
  }

  private async load(id: number): Promise<void> {
    this.loadError.set(null);
    try {
      this.addresses.set(await firstValueFrom(this.ecommerce.getEcomCustomerAddresses(id)));
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    }
  }

  open(address: DeliveryAddressDetail | null): void {
    this.editing.set({ address });
  }

  onSaved(saved: DeliveryAddressDetail): void {
    this.editing.set(null);
    this.addresses.update((list) => list.some((item) => item.id === saved.id)
      ? list.map((item) => item.id === saved.id ? saved : item)
      : [...list, saved]);
    this.notifications.push('success', 'Address saved.');
  }

  async verify(address: DeliveryAddressDetail): Promise<void> {
    this.verifyingId.set(address.id);
    try {
      const updated = await firstValueFrom(this.ecommerce.verifyEcomCustomerAddress(this.customerId(), address.id));
      this.addresses.update((list) => list.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.verifyingId.set(null);
    }
  }

  hasPin(address: DeliveryAddressDetail): boolean {
    return address.latitude !== null && address.latitude !== undefined && address.longitude !== null && address.longitude !== undefined;
  }

  previewOf(address: DeliveryAddressDetail) {
    return {
      ...(address.address ?? {}),
      description: [address.addressLine1, address.landmark].filter(Boolean).join(' — ') || null,
      latitude: address.latitude,
      longitude: address.longitude
    };
  }
}
