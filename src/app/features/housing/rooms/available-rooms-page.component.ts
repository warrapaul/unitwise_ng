import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { HousingService } from '../housing.service';
import { AvailableRoomSearchParams, RoomPreview } from '../models/housing.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';

@Component({
  selector: 'app-available-rooms-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    EntityPickerComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-section-card title="Available rooms">
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Building name</span><input formControlName="buildingName"></label>
              <label class="field">
                <span>Building</span>
                <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
              </label>
              <label class="field">
                <span>Agency</span>
                <app-entity-picker [config]="pickers.agency" formControlName="agencyId" placeholder="Any agency" />
              </label>
              <label class="field"><span>Min rent</span><input type="number" step="0.01" min="0" formControlName="minRent"></label>
              <label class="field"><span>Max rent</span><input type="number" step="0.01" min="0" formControlName="maxRent"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading rooms..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (rooms().length === 0) {
        <app-empty-state title="No available rooms" description="Try a wider rent range or clear the filters." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Room</th><th>Rent</th><th>Deposit</th><th>Amenities</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (room of rooms(); track room.id) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ room.name || ('Room ' + room.roomNumber) }}</strong>
                        <span class="muted">{{ room.description || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ room.monthlyRent ?? '-' }}</td>
                    <td>{{ room.securityDeposit ?? '-' }}</td>
                    <td>{{ (room.amenities ?? []).join(', ') || '-' }}</td>
                    <td>
                      <span class="status-chip" [ngClass]="room.status === 'VACANT' ? 'status-chip--success' : 'status-chip--neutral'">
                        {{ room.status | humanLabel }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="rooms().length"
            [total]="pagination()?.totalElements ?? rooms().length"
            noun="rooms"
            [pagination]="pagination()!"
            [size]="pagination()!.size"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AvailableRoomsPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly rooms = signal<RoomPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly form = this.formBuilder.group({
    buildingName: '',
    buildingId: [null as number | null],
    agencyId: [null as number | null],
    minRent: [null as number | null],
    maxRent: [null as number | null],
    page: 0,
    size: 20,
    sort: 'monthlyRent',
    direction: 'asc' as 'asc' | 'desc'
  });

  ngOnInit(): void {
    void this.reload();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      buildingName: '',
      buildingId: null,
      agencyId: null,
      minRent: null,
      maxRent: null,
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'monthlyRent',
      direction: 'asc'
    });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(
        this.housing.getAvailableRooms(this.form.getRawValue() as AvailableRoomSearchParams)
      );
      this.rooms.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
