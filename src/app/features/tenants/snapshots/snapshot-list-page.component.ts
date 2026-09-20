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
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { VerificationSnapshotPreview, VerificationSnapshotSearchParams } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-snapshot-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    EntityPickerComponent,
    RouterLink,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Verification snapshots">
        <p class="hint">A snapshot freezes a tenant's identity details and documents at the moment of verification.</p>

        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>First name</span><input formControlName="firstName"></label>
              <label class="field"><span>Last name</span><input formControlName="lastName"></label>
              <label class="field"><span>Email</span><input formControlName="email"></label>
              <label class="field"><span>Phone</span><input formControlName="phoneNumber"></label>
              <label class="field"><span>Verified by</span><input formControlName="verifiedByName"></label>
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="snapshotType">
                  <option value="">Any</option>
                  <option value="INITIAL_VERIFICATION">Initial verification</option>
                  <option value="LEASE_RENEWAL">Lease renewal</option>
                  <option value="LEASE_AMENDMENT">Lease amendment</option>
                </select>
              </label>
              <label class="field">
                <span>Currency</span>
                <select formControlName="isCurrent">
                  <option value="">Any</option>
                  <option value="true">Current only</option>
                  <option value="false">Superseded only</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading snapshots..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (snapshots().length === 0) {
        <app-empty-state title="No snapshots" description="Snapshots appear once a landlord verifies a tenant." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="lastName"
                      label="Tenant"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Contact</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="snapshotType"
                      label="Type"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="verifiedByName"
                      label="Verified by"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="snapshotDate"
                      label="Snapshot date"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                @for (snapshot of snapshots(); track snapshot.id) {
                  <tr [appRowLink]="detailLink(snapshot)">
                    <td>
                      <div class="cell-stack">
                        @if (detailLink(snapshot); as link) {
                          <a class="record-link__primary" [routerLink]="link">{{ fullName(snapshot) }}</a>
                        } @else {
                          <strong>{{ fullName(snapshot) }}</strong>
                        }
                        <span class="muted mono">{{ snapshot.nationalIdNumber || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ snapshot.email || '-' }}</span>
                        <span class="muted">{{ snapshot.phoneNumber || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ snapshot.snapshotType || '-' }}</td>
                    <td>{{ snapshot.verifiedByName || '-' }}</td>
                    <td>{{ formatDateTime(snapshot.snapshotDate) }}</td>
                    <td>
                      <span class="status-chip" [ngClass]="snapshot.isCurrent ? 'status-chip--success' : 'status-chip--neutral'">
                        {{ snapshot.isCurrent ? 'Current' : 'Superseded' }}
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
export class SnapshotListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly context = inject(ActiveContextService);

  /**
   * The snapshot detail route is agency/building/tenant scoped, so a row only
   * links once a context is selected — otherwise there is no valid URL to build.
   */
  detailLink(snapshot: VerificationSnapshotPreview): string | null {
    const agencyId = this.context.agencyId();
    const buildingId = this.context.buildingId();
    if (agencyId === null || buildingId === null || snapshot.tenantId == null) {
      return null;
    }

    return RoutePaths.verificationSnapshotDetail(agencyId, buildingId, snapshot.tenantId, snapshot.id);
  }

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('snapshotDate', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly snapshots = signal<VerificationSnapshotPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly form = this.formBuilder.group({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    verifiedByName: '',
    tenantId: [null as number | null],
    snapshotType: '',
    isCurrent: '',
    page: 0,
    size: 20,
    sort: 'snapshotDate',
    direction: 'desc' as 'asc' | 'desc'
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
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      verifiedByName: '',
      tenantId: null,
      snapshotType: '',
      isCurrent: '',
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'snapshotDate',
      direction: 'desc'
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

  fullName(snapshot: VerificationSnapshotPreview): string {
    return [snapshot.firstName, snapshot.middleName, snapshot.lastName].filter(Boolean).join(' ')
      || `Snapshot #${snapshot.id}`;
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as VerificationSnapshotSearchParams;

    try {
      const result = params.snapshotType
        ? await firstValueFrom(this.tenantsService.getSnapshotsByType(String(params.snapshotType), params))
        : await firstValueFrom(this.tenantsService.searchSnapshots(params));
      this.snapshots.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
