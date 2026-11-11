import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MyTenanciesStore } from '../../tenants/tenants/my-tenancies.store';
import { MyTenancyOverviewComponent } from '../../tenants/tenants/my-tenancy-overview.component';
import { TenantRentPanelComponent } from '../components/tenant-rent-panel.component';

/**
 * The tenant's Rent and Payments tabs: the same rent panel Home shows, opened wider. Rent is what
 * is owed, month by month (route data `view: 'rent'`); Payments is the money paid
 * (`view: 'payments'`). Both follow the tenancy picked on Home, and either can switch it.
 */
@Component({
  selector: 'app-my-arrears-page',
  standalone: true,
  imports: [LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, TenantRentPanelComponent, MyTenancyOverviewComponent],
  template: `
    <section class="stack">
      @if (store.loading()) {
        <app-loading-state label="Loading your tenancy..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error()!" (retry)="store.load()" />
      } @else if (store.tenancies().length === 0) {
        <app-empty-state title="No tenancy yet" description="When a landlord adds you as a tenant, your rent shows up here."
                         actionLabel="Set up your tenant profile" [actionLink]="RoutePaths.renterProfile" />
      } @else {
        @if (store.selected(); as tenancy) {
          <div class="panel">
            <app-tenant-rent-panel [tenantId]="tenancy.id" [view]="view" [openReport]="openReport" [since]="store.since()" [moveInDate]="tenancy.moveInDate ?? null"
                                   [phone]="tenancy.phoneNumber ?? null" />
            <!-- How to pay sits beside the bill on Rent too: the PayBill or bank details are needed right here. -->
            @if (view === 'rent') { <app-my-tenancy-overview [tenantId]="tenancy.id" [cards]="['pay']" /> }
          </div>
        }
      }
    </section>
  `,
  styles: [`.panel { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyArrearsPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly store = inject(MyTenanciesStore);
  private readonly route = inject(ActivatedRoute);

  readonly view: 'rent' | 'payments' = this.route.snapshot.data['view'] === 'payments' ? 'payments' : 'rent';
  /** From Home's "Report a payment": open the form as soon as the bill is in. */
  readonly openReport = this.route.snapshot.queryParamMap.get('report') === '1';

  ngOnInit(): void {
    // Old links carry ?tenantId= from Home's buttons: honour it.
    const tenantId = Number(this.route.snapshot.queryParamMap.get('tenantId'));
    if (tenantId) {
      this.store.select(tenantId);
    }
    void this.store.load();
  }
}
