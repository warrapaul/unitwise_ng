import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../../housing/housing.service';
import { BuildingPreview } from '../../housing/models/housing.models';
import { PropertyOwner } from '../owners.models';
import { OwnersService } from '../owners.service';

/** Ticks which of the agency's buildings belong to this owner; a building already someone else's says whose. */
@Component({
  selector: 'app-owner-buildings-dialog',
  standalone: true,
  imports: [DialogComponent, ErrorCardComponent, LoadingStateComponent],
  template: `
    <app-dialog title="Their buildings" [subtitle]="owner().name" width="34rem" (closed)="closed.emit()">
      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading buildings…" />
      } @else {
        <ul class="picks">
          @for (building of buildings(); track building.id) {
            <li>
              <label class="pick">
                <input type="checkbox" [checked]="chosen().has(building.id)" (change)="toggle(building.id)">
                <span class="pick__text">
                  <strong>{{ building.name }}</strong>
                  @if (otherOwner(building.id); as other) {
                    <span class="muted">{{ chosen().has(building.id) ? 'Moves here from ' + other : other + "'s" }}</span>
                  }
                </span>
              </label>
            </li>
          } @empty {
            <li class="muted">The agency has no buildings yet.</li>
          }
        </ul>
      }
      @if (error(); as apiError) {
        <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
      }
      <div dialog-actions>
        <button type="button" class="btn btn-primary" [disabled]="saving() || loading()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .picks { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
    .pick { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; }
    .pick:has(input:checked) { border-color: var(--primary); }
    .pick__text { display: grid; gap: 2px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerBuildingsDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly owner = input.required<PropertyOwner>();
  readonly saved = output<PropertyOwner>();
  readonly closed = output<void>();

  private readonly owners = inject(OwnersService);
  private readonly housing = inject(HousingService);

  readonly buildings = signal<BuildingPreview[]>([]);
  readonly chosen = signal<ReadonlySet<number>>(new Set());
  private readonly ownerOf = signal<ReadonlyMap<number, string>>(new Map());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly otherOwner = (buildingId: number): string | null => this.ownerOf().get(buildingId) ?? null;

  async ngOnInit(): Promise<void> {
    this.chosen.set(new Set(this.owner().buildings.map((b) => b.id)));
    try {
      const [buildings, owners] = await Promise.all([
        firstValueFrom(this.housing.getBuildingsForAgency(this.agencyId(), { page: 0, size: 200 })),
        firstValueFrom(this.owners.search(this.agencyId(), { page: 0, size: 200 }))
      ]);
      this.buildings.set(buildings.items);
      const map = new Map<number, string>();
      for (const other of owners.items.filter((o) => o.id !== this.owner().id)) {
        for (const building of other.buildings) {
          map.set(building.id, other.name);
        }
      }
      this.ownerOf.set(map);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  toggle(id: number): void {
    this.chosen.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      this.saved.emit(await firstValueFrom(this.owners.setBuildings(this.agencyId(), this.owner().id, [...this.chosen()])));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
