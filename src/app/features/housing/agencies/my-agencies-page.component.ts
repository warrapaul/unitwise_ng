import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import { AgencyPreviewWithRole } from '../models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-my-agencies-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    RowLinkDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="My agencies">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.agencies">All agencies</a>
        </ng-container>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading your agencies..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (memberships().length === 0) {
        <app-empty-state title="No agency access" description="You are not an administrator of any agency yet." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Agency</th><th>Owner</th><th>Your role</th><th>Scope</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (membership of memberships(); track membership.id) {
                  <tr [appRowLink]="RoutePaths.agencyDetail(membership.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.agencyDetail(membership.id)">
                          {{ membership.name || ('Agency #' + membership.id) }}
                        </a>
                        <span class="muted">{{ membership.registrationNumber || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ membership.ownerName || '-' }}</span>
                        <span class="muted">{{ membership.ownerEmail || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ membership.adminRole?.roleName || '-' }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ membership.adminRole?.scope || '-' }}</span>
                        @if (membership.adminRole?.scope === 'BUILDING_LEVEL') {
                          <span class="muted">{{ (membership.assignedBuildingIds ?? []).length }} building(s)</span>
                        }
                      </div>
                    </td>
                    <td>
                      <div class="chip-row">
                        <app-status-chip [status]="membership.status" />
                        @if (membership.isEnabled === false) {
                          <span class="status-chip status-chip--danger">Access disabled</span>
                        }
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

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyAgenciesPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly housing = inject(HousingService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly memberships = signal<AgencyPreviewWithRole[]>([]);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Every agency the operator administers: a person is an admin of a
      // handful, so one generous page beats a pager nobody would use.
      const result = await firstValueFrom(this.housing.getMyAgencies({ page: 0, size: 100 }));
      this.memberships.set(result.items);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
