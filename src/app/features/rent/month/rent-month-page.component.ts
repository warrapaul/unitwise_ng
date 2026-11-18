import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { HousingService } from '../../housing/housing.service';
import { BuildingPreview } from '../../housing/models/housing.models';
import { ArrearsPageComponent } from '../arrears/arrears-page.component';
import { AgencyRoomsPageComponent } from '../payments/agency-rooms-page.component';

/**
 * Rent this month: the one page for "how is this month's rent going, and what do I do next".
 *
 * With a building chosen, it is that building's month — create the bills, record readings,
 * confirm, then every room by floor with its actions. With all buildings, it is every room in one
 * list, and the buildings themselves one tap from their month's steps. Both views offer the same
 * actions on a room: open its month, record a payment, remind, bill now, add a tenant, export.
 */
@Component({
  selector: 'app-rent-month-page',
  standalone: true,
  imports: [RouterLink, ArrearsPageComponent, AgencyRoomsPageComponent],
  template: `
    <section class="stack">
      <header class="page-head">
        <div class="page-head__title">
          <h1>Rent this month</h1>
          <p>{{ context.buildingId() !== null ? (context.active().buildingName || 'This building') : 'All buildings' }}</p>
        </div>
        @if (context.buildingId() !== null && canSeeAll()) {
          <button type="button" class="btn btn-secondary" (click)="allBuildings()">See all buildings</button>
        }
      </header>

      @if (context.buildingId() !== null) {
        <app-arrears-page [month]="month()" [created]="created()" />
      } @else {
        @if (buildings().length > 0) {
          <!-- The month's steps — bills, readings, confirming — are done one building at a time. -->
          <section class="panel buildings" aria-labelledby="month-buildings">
            <div class="buildings__head">
              <h2 id="month-buildings">Bills, readings and confirming</h2>
              <p class="muted">Done one building at a time. <a [routerLink]="RoutePaths.rentOverview">See every building's steps</a></p>
            </div>
            <ul class="buildings__list">
              @for (building of buildings(); track building.id) {
                <li>
                  <span class="buildings__name">{{ building.name }}</span>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="open(building)">Work on this building</button>
                </li>
              }
            </ul>
          </section>
        }
        <app-agency-rooms-page />
      }
    </section>
  `,
  styles: [`
    .buildings { display: grid; gap: var(--space-3); padding: var(--space-4); }
    .buildings__head h2 { margin: 0; font-size: var(--font-subsection); }
    .buildings__head p { margin: var(--space-0-5) 0 0; }
    .buildings__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .buildings__list li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .buildings__name { font-weight: var(--weight-semibold); min-width: 0; overflow-wrap: anywhere; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentMonthPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly housing = inject(HousingService);

  /** From the query string: `?month=2026-10&created=1`, handed to the building view. */
  readonly month = input<string | undefined>(undefined);
  readonly created = input<string | undefined>(undefined);

  readonly buildings = signal<BuildingPreview[]>([]);

  constructor() {
    effect(() => {
      const agencyId = this.context.agencyId();
      const all = this.context.buildingId() === null;
      untracked(() => void this.loadBuildings(all ? agencyId : null));
    });
  }

  /** Staff limited to one building have no "all" to go back to. */
  canSeeAll(): boolean {
    const allowed = this.context.restrictedToBuildingIds();
    return !allowed || allowed.size > 1;
  }

  open(building: BuildingPreview): void {
    this.context.selectBuilding(building.id, building.name);
  }

  allBuildings(): void {
    this.context.clearBuilding();
  }

  private async loadBuildings(agencyId: number | null): Promise<void> {
    if (agencyId === null) {
      this.buildings.set([]);
      return;
    }
    try {
      const page = await firstValueFrom(this.housing.getBuildingsForAgency(agencyId, { page: 0, size: 100 }));
      const allowed = this.context.restrictedToBuildingIds();
      this.buildings.set(page.items.filter((building) => !allowed || allowed.has(building.id)));
    } catch {
      this.buildings.set([]);
    }
  }
}
