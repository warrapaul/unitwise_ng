import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatGroupComponent } from '../components/stat-group.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { StatsService } from '../stats.service';
import { CaretakerBuildingDetail, StatBlock, StatMetric } from '../models/stats.models';

/**
 * Every metric in a block, in the order the server sent them.
 *
 * The dashboards name their keys explicitly, which is right there — they are
 * curating a summary. This page is the drill-in, so it shows whatever the
 * block holds and a metric added server-side appears without a change here.
 */
function metricsOf(block: StatBlock | null | undefined): StatMetric[] {
  if (!block) {
    return [];
  }

  return Object.values(block)
    .filter((value): value is StatMetric =>
      !!value && typeof value === 'object' && 'value' in (value as object));
}

/**
 * One building, for a caretaker who covers several.
 *
 * The overview answers "how are my buildings doing"; this answers "what is
 * happening in this one". The endpoint is guarded on the building rather
 * than on the caller, so a caretaker cannot reach one they do not cover by
 * editing the URL.
 */
@Component({
  selector: 'app-caretaker-building-page',
  standalone: true,
  imports: [
    BackLinkComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    StatGroupComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.home" label="Back to dashboard" [title]="buildingName()" />

      @if (loading()) {
        <app-loading-state label="Loading this building..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (detail(); as report) {
        <div class="dash">
          @if (report.building; as building) {
            <app-section-card [title]="building.buildingName || 'This building'" class="dash__wide">
              <dl class="detail-grid">
                <div><dt>Rooms</dt><dd>{{ building.rooms ?? 0 }}</dd></div>
                <div><dt>Occupied</dt><dd>{{ building.occupied ?? 0 }}</dd></div>
                <div><dt>Vacant</dt><dd>{{ building.vacant ?? 0 }}</dd></div>
                <div><dt>Under maintenance</dt><dd>{{ building.underMaintenance ?? 0 }}</dd></div>
                <div><dt>Open requests</dt><dd>{{ building.openMaintenanceRequests ?? 0 }}</dd></div>
                <div><dt>In arrears</dt><dd>{{ building.tenantsInArrears ?? 0 }}</dd></div>
              </dl>
            </app-section-card>
          }

          @for (group of groups(); track group.title) {
            <app-stat-group [title]="group.title" [metrics]="group.metrics" />
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .dash {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr));
      gap: 1rem;
      align-items: start;
    }

    .dash__wide { grid-column: 1 / -1; }

    .dash > app-section-card,
    .dash > app-stat-group { display: block; min-width: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CaretakerBuildingPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();

  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly detail = signal<CaretakerBuildingDetail | null>(null);

  readonly buildingName = computed(() => this.detail()?.building?.buildingName ?? null);

  /** Only blocks the server actually sent, so an empty one leaves no bare card. */
  readonly groups = computed(() => {
    const report = this.detail();
    if (!report) {
      return [];
    }

    return [
      { title: 'Rooms', metrics: metricsOf(report.rooms) },
      { title: 'Tenants', metrics: metricsOf(report.tenants) },
      { title: 'Today', metrics: metricsOf(report.today) },
      { title: 'Maintenance', metrics: metricsOf(report.maintenance) },
      { title: 'Rent', metrics: metricsOf(report.rent) }
    ].filter((group) => group.metrics.length > 0);
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.detail.set(await firstValueFrom(this.stats.getCaretakerBuildingDetail(
        Number(this.agencyId()), Number(this.buildingId())
      )));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
