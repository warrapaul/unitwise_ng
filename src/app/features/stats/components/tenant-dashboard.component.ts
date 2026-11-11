import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { MyTenanciesStore } from '../../tenants/tenants/my-tenancies.store';
import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';
import { TenantRentPanelComponent } from '../../rent/components/tenant-rent-panel.component';
import { MyTenancyOverviewComponent } from '../../tenants/tenants/my-tenancy-overview.component';
import { TenancyInvitationsComponent } from '../../tenants/tenants/tenancy-invitations.component';

/**
 * The tenant's own screen, built only from their real records.
 *
 * Rent first — this month's bill and how to pay it, then the payments recorded
 * and the ones they reported — then everything else about the tenancy,
 * read-only: their home, house rules and room history, who to call, and last
 * the monthly charges (already itemised on the bill). A person with several tenancies picks one above.
 *
 * (The stats overview endpoint for tenants still returns sample data, so
 * nothing here reads from it.)
 */
@Component({
  selector: 'app-tenant-dashboard',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, SectionCardComponent, TenantRentPanelComponent,
    MyTenancyOverviewComponent, TenancyInvitationsComponent],
  template: `
    <!-- An agency's invitation waits on the tenant, so it comes before anything else. -->
    <app-tenancy-invitations />

    @if (loading()) {
      @if (!onlyIfTenant()) { <app-loading-state label="Loading your tenancy..." /> }
    } @else if (error()) {
      @if (!onlyIfTenant()) { <app-error-state [message]="error()!" (retry)="load()" /> }
    } @else if (tenancies().length === 0) {
      @if (!onlyIfTenant()) {
      <app-section-card title="No tenancy yet"
                        subtitle="When a landlord adds you as a tenant, your rent, home and contacts show up here.">
        <div class="button-row">
          <a class="btn btn-primary" [routerLink]="RoutePaths.renterProfile">Set up your tenant profile</a>
        </div>
      </app-section-card>
      }
    } @else {
      <!-- The tenancy is picked in the header (with more than one); Rent and Payments follow it. -->
      @if (selected(); as tenancy) {
        <!-- Things to do that the tab bar does not already hold: Rent, Payments and Repairs are tabs. -->
        <nav class="quick" aria-label="Shortcuts">
          <a class="quick__item" [routerLink]="RoutePaths.myMaintenanceNew" [queryParams]="{ tenantId: tenancy.id }">
            <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#nav-wrench" /></svg>Report an issue
          </a>
          <button type="button" class="quick__item" [disabled]="chatLauncher.opening()" (click)="messageLandlord()">
            <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#nav-chat" /></svg>Message landlord
          </button>
          <!-- Documents are part of My tenancy; reporting a payment is the job people come here for. -->
          <a class="quick__item" [routerLink]="RoutePaths.myRentPayments" [queryParams]="{ report: 1 }">
            <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#nav-swap" /></svg>Report a payment
          </a>
          <a class="quick__item" [routerLink]="RoutePaths.myTenantDocuments">
            <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#nav-key" /></svg>My tenancy
          </a>
        </nav>
        <!--
          In reading order: this month's bill and how to pay it, then the latest payments and who to
          call. The home, deposit and rules are on My tenancy.
        -->
        <div class="dash">
          <app-tenant-rent-panel [tenantId]="tenancy.id" [since]="store.since()" [moveInDate]="tenancy.moveInDate ?? null"
                                 [phone]="tenancy.phoneNumber ?? null" />
          <app-my-tenancy-overview [tenantId]="tenancy.id" [cards]="['pay', 'call']" />
        </div>
      }
    }
  `,
  styles: [`
    :host { display: grid; gap: var(--space-4); }
    /* Two columns, never three: a third left holes wherever a pair had only two cards. */
    .dash { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; min-width: 0; }
    @media (max-width: 960px) { .dash { grid-template-columns: minmax(0, 1fr); } }
    /* Four shortcuts, two by two on a phone and in one row when wide. */
    /* Four shortcuts: in a row when wide, two by two on a phone, one per row when the text is large. */
    .quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr)); gap: var(--space-2); }
    .quick__item { display: flex; align-items: center; gap: var(--space-2); min-height: 3rem; padding: var(--space-2) var(--space-3);
                   border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: var(--text);
                   font: inherit; font-weight: var(--weight-semibold); text-align: left; text-decoration: none; cursor: pointer; }
    .quick__item:hover { border-color: var(--primary); }
    .quick__item svg { flex: none; width: 1.25rem; height: 1.25rem; fill: none; stroke: var(--primary-strong); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  /**
   * Shown under a role that has no dashboard of its own: say nothing unless the
   * person actually has a tenancy, so a pure shopper sees no tenant prompts.
   */
  readonly onlyIfTenant = input(false);

  readonly chatLauncher = inject(ChatLauncherService);
  private readonly chat = inject(ChatService);

  messageLandlord(): void {
    const tenantId = this.selectedId();
    if (tenantId) {
      void this.chatLauncher.open(this.chat.openTenancyAsTenant(tenantId));
    }
  }

  readonly store = inject(MyTenanciesStore);
  readonly loading = this.store.loading;
  readonly error = this.store.error;
  readonly tenancies = this.store.tenancies;
  readonly selectedId = this.store.selectedId;
  readonly selected = this.store.selected;

  ngOnInit(): void {
    void this.load();
  }

  load(): Promise<void> {
    return this.store.load();
  }
}
