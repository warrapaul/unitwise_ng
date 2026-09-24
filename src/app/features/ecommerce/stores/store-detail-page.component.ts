import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { StoreDetail } from '../models/ecommerce.models';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-store-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, RouterLink, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent,
    PermissionGateComponent,
    ErrorCardComponent,
    BackLinkComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="'/admin/ecommerce/stores'" label="Back to stores" />
      @if (loading()) {
        <app-loading-state label="Loading store..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load store'" (retry)="reload()" />
      } @else if (store()) {
        <app-section-card [title]="store()?.name || 'Store detail'" [subtitle]="store()?.code || null">
          <ng-container actions>
            <div class="detail-actions">
              <app-permission-gate [permissions]="[Permissions.STORE_WRITE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomStoreEdit(store()?.id || 0)">Edit store</a>
              </app-permission-gate>
              <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This store is in use' : 'Unable to delete the store'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Overview</p>
              <div class="meta-grid">
                <div><span class="muted">Town</span><strong>{{ store()?.town || '-' }}</strong></div>
                <div><span class="muted">City</span><strong>{{ store()?.city || '-' }}</strong></div>
                <div><span class="muted">County</span><strong>{{ store()?.county || '-' }}</strong></div>
                <div><span class="muted">Status</span><strong>{{ store()?.isActive ? 'Active' : 'Inactive' }}</strong></div>
              </div>
            </article>

            <article class="panel subcard">
              <p class="eyebrow">Contact</p>
              <div class="stack compact">
                <div><span class="muted">Phone</span><strong>{{ store()?.contactPhone || '-' }}</strong></div>
                <div><span class="muted">Hours</span><strong>{{ store()?.operatingHours || '-' }}</strong></div>
                <div><span class="muted">Landmark</span><strong>{{ store()?.landmark || '-' }}</strong></div>
              </div>
            </article>
          </div>

          <article class="panel subcard">
            <p class="eyebrow">Location</p>
            <div class="meta-grid">
              <div><span class="muted">Address</span><strong>{{ store()?.addressLine1 || '-' }}</strong></div>
              <div><span class="muted">Latitude</span><strong>{{ store()?.latitude ?? '-' }}</strong></div>
              <div><span class="muted">Longitude</span><strong>{{ store()?.longitude ?? '-' }}</strong></div>
            </div>
          </article>

          @if (store()?.pickupInstructions) {
            <article class="panel subcard">
              <p class="eyebrow">Pickup instructions</p>
              <p class="muted description">{{ store()?.pickupInstructions }}</p>
            </article>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.STORE_DELETE]">
          <app-danger-zone label="Delete store" [busy]="deleting()" (pressed)="remove()" />
        </app-permission-gate>
      } @else {
        <app-empty-state title="No store selected" description="Choose a store from the list to view its detail." />
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
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .subcard {
      padding: 1rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .meta-grid div,
    .stack.compact div {
      display: grid;
      gap: 0.15rem;
    }

    .description {
      white-space: pre-wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StoreDetailPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;
  readonly deleting = signal(false);

  /** A rejected delete, shown on the page rather than replacing it (§31.2). */
  readonly actionError = signal<ApiError | null>(null);

  readonly RoutePaths = RoutePaths;
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly store = signal<StoreDetail | null>(null);

  async ngOnInit(): Promise<void> {
    void this.load();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    const storeId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(storeId)) {
      this.error.set('Invalid store id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.store.set(await firstValueFrom(this.ecommerceService.getStore(storeId)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }


  async remove(): Promise<void> {
    const store = this.store();
    if (!store || !await this.confirm.ask({
      title: `Delete the store "${store.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.ecommerceService.deleteStore(store.id));
      await this.router.navigateByUrl(RoutePaths.ecomStores);
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
