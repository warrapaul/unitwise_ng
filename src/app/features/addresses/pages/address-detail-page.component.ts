import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { AddressesService } from '../addresses.service';
import { AddressDetail } from '../models/address.models';

@Component({
  selector: 'app-address-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    PermissionGateComponent
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading address..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load address'" (retry)="reload()" />
      } @else if (address()) {
        <app-section-card [title]="addressTitle()" eyebrow="Address detail" [subtitle]="address()?.postalCode || null">
          <ng-container actions>
            <div class="detail-actions">
              <a class="btn btn-secondary" [routerLink]="RoutePaths.addressRecords">Back to addresses</a>
              <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                <a class="btn btn-primary" [routerLink]="RoutePaths.addressEdit(address()?.id || 0)">Edit</a>
              </app-permission-gate>
              <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                <button type="button" class="btn btn-danger" (click)="deleteAddress()">Delete</button>
              </app-permission-gate>
            </div>
          </ng-container>

          <div class="detail-grid">
            <div><p class="muted">City</p><strong>{{ address()?.city || '-' }}</strong></div>
            <div><p class="muted">County</p><strong>{{ address()?.county || '-' }}</strong></div>
            <div><p class="muted">Sub-county</p><strong>{{ address()?.subCounty || '-' }}</strong></div>
            <div><p class="muted">Ward</p><strong>{{ address()?.ward || '-' }}</strong></div>
            <div><p class="muted">Postal code</p><strong>{{ address()?.postalCode || '-' }}</strong></div>
            <div><p class="muted">Latitude</p><strong>{{ address()?.latitude ?? '-' }}</strong></div>
            <div><p class="muted">Longitude</p><strong>{{ address()?.longitude ?? '-' }}</strong></div>
            <div><p class="muted">Map pin</p><strong>{{ address()?.mapPin || '-' }}</strong></div>
          </div>

          <section class="detail-grid cards">
            <article class="card subcard">
              <p class="eyebrow">Audit</p>
              <p class="muted">Created by: {{ address()?.createdBy || 'N/A' }}</p>
              <p class="muted">Updated by: {{ address()?.updatedBy || 'N/A' }}</p>
              <p class="muted">Created: {{ formatDate(address()?.createdAt) }}</p>
              <p class="muted">Updated: {{ formatDate(address()?.updatedAt) }}</p>
            </article>
          </section>
        </app-section-card>
      } @else {
        <app-empty-state title="No address selected" description="Choose an address from the list to continue." />
      }
    </section>
  `,
  styles: [`
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .detail-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .cards {
      margin-top: 0.5rem;
    }

    .subcard {
      padding: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly addressesService = inject(AddressesService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly address = signal<AddressDetail | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  addressTitle(): string {
    const current = this.address();
    return current
      ? [current.subCounty, current.ward]
          .filter((value): value is string => !!value && value.trim().length > 0)
          .join(' • ') || `Address #${current.id}`
      : 'Address detail';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async deleteAddress(): Promise<void> {
    const current = this.address();
    if (!current) {
      return;
    }

    const confirmed = window.confirm('Delete this address?');
    if (!confirmed) {
      return;
    }

    await firstValueFrom(this.addressesService.deleteAddress(current.id));
    await this.router.navigateByUrl(RoutePaths.addressRecords);
  }

  private async load(): Promise<void> {
    const addressId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(addressId)) {
      this.error.set('Invalid address id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.address.set(await firstValueFrom(this.addressesService.getAddress(addressId)));
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
