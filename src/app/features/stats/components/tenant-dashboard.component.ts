import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../../tenants/tenants.service';
import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';
import { TenantPreview } from '../../tenants/models/tenant.models';
import { TenantRentPanelComponent } from '../../rent/components/tenant-rent-panel.component';
import { MyTenancyOverviewComponent } from '../../tenants/tenants/my-tenancy-overview.component';
import { TenancyInvitationsComponent } from '../../tenants/tenants/tenancy-invitations.component';
import { TenancySwitcherComponent } from '../../tenants/tenants/tenancy-switcher.component';

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
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, SectionCardComponent, StatusChipComponent, TenantRentPanelComponent,
    MyTenancyOverviewComponent, TenancyInvitationsComponent, TenancySwitcherComponent],
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
                        subtitle="When an agency adds you as a tenant, your rent, home and contacts show up here.">
        <div class="button-row">
          <a class="btn btn-primary" [routerLink]="RoutePaths.renterProfile">Set up your renter profile</a>
        </div>
      </app-section-card>
      }
    } @else {
      <!--
        Only when there is a choice. Laid out as a choice — a labelled group of
        options, the one on screen marked — so it reads as "pick a tenancy",
        not as two more links.
      -->
      @if (tenancies().length > 1) {
        <app-tenancy-switcher [tenancies]="tenancies()" [selectedId]="selectedId()" hint="Choose one to see its rent, payments and home."
                              (selected)="selectedId.set($event.id)" />
      }

      @if (selectedId(); as tenantId) {
        <!-- Where they live, in one line: what the empty "Your room, rent and documents" header never said. -->
        @if (selected(); as tenancy) {
          <p class="where">
            <strong>{{ tenancy.roomName ? 'Room ' + tenancy.roomName : 'Your room' }}</strong>
            @if (tenancy.buildingName) { <span> · {{ tenancy.buildingName }}</span> }
            @if (tenancy.status) { <app-status-chip [status]="tenancy.status" /> }
          </p>
        }
        <!--
          Things to do, not places the sidebar already lists (profile and account
          are one tap away there). Leases are a section of the tenancy; messages go
          through the chat, about this tenancy.
        -->
        <nav class="quick" aria-label="Quick actions">
          <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myMaintenance" [queryParams]="{ tenantId }">Report an issue</a>
          <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myArrears">Balance &amp; statements</a>
          <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myRentPayments" [queryParams]="{ tenantId }">Payment history</a>
          <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myTenantDocuments">Documents</a>
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="chatLauncher.opening()" (click)="messageLandlord()">Message the landlord</button>
        </nav>
        <!--
          One grid for both panels (their cards are its items), in reading order: this month's bill,
          then how to pay it; the payments recorded and reported; the home; who to call; and last the
          monthly charges, already itemised on the bill. The panels set the order with CSS order, so a phone reads it top to bottom.
        -->
        <div class="dash">
          <app-tenant-rent-panel [tenantId]="tenantId" [since]="startOf(tenantId)" [moveInDate]="selected()?.moveInDate ?? null" />
          <app-my-tenancy-overview [tenantId]="tenantId" />
        </div>
      }
    }
  `,
  styles: [`
    :host { display: grid; gap: var(--space-4); }
    /* Two columns, never three: a third left holes wherever a pair had only two cards. */
    .dash { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; min-width: 0; }
    @media (max-width: 960px) { .dash { grid-template-columns: minmax(0, 1fr); } }
    .quick { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .where { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1-5); margin: 0; }
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

  private readonly tenants = inject(TenantsService);
  readonly chatLauncher = inject(ChatLauncherService);
  private readonly chat = inject(ChatService);

  messageLandlord(): void {
    const tenantId = this.selectedId();
    if (tenantId) {
      void this.chatLauncher.open(this.chat.openTenancyAsTenant(tenantId));
    }
  }

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly all = signal<TenantPreview[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly selected = computed(() => this.all().find((tenancy) => tenancy.id === this.selectedId()) ?? null);

  /**
   * The tenancies that have a home behind them. An invitation not yet answered
   * shows as the invitation above, not as a tenancy with nothing in it.
   */
  readonly tenancies = computed(() => this.all().filter((tenancy) => tenancy.status !== 'AWAITING_TENANT_ACCEPTANCE'));

  /**
   * The month the tenancy's bills start: whichever came first of moving in and the
   * tenancy being created, so a bill raised before the move-in date stays reachable.
   */
  startOf(tenantId: number): string | null {
    const tenancy = this.tenancies().find((item) => item.id === tenantId);
    const dates = [tenancy?.moveInDate, tenancy?.createdAt].filter((date): date is string => !!date).map((date) => date.slice(0, 10));
    return dates.length ? dates.sort()[0] : null;
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.all.set(await firstValueFrom(this.tenants.getMyTenantProfiles()));
      const list = this.tenancies();
      // Keep the picked one if it is still there; otherwise the one they live in, else the first.
      if (!list.some((tenancy) => tenancy.id === this.selectedId())) {
        this.selectedId.set((list.find((tenancy) => tenancy.status === 'ACTIVE') ?? list[0])?.id ?? null);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
