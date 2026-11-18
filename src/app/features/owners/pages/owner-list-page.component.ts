import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { asText, downloadCsv } from '../../../shared/utils/csv-export.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatPhone } from '../../../shared/utils/format.util';
import { OwnerDialogComponent } from '../components/owner-dialog.component';
import { PAYOUT_METHOD_LABELS, PropertyOwner, commissionLabel } from '../owners.models';
import { OwnersService } from '../owners.service';

/** The people whose buildings the agency manages: who they are, which buildings, and what they are charged. */
@Component({
  selector: 'app-owner-list-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CardTableDirective, ContextGuardComponent, EmptyStateComponent, ErrorStateComponent,
    LoadingStateComponent, PaginationComponent, PermissionGateComponent, SectionCardComponent, OwnerDialogComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="OWNER_READ">
        @if (!context.managesForOwners() && !context.isSuperAdmin()) {
          <app-empty-state title="This agency owns its buildings"
                           description="Owners, commission and owner statements are for agencies that manage buildings on behalf of landlords. Ask Unitwise support to switch the agency if that is how you work." />
        } @else {
          <app-section-card title="Owners" subtitle="The landlords whose buildings you manage">
            <button type="button" actions class="btn btn-secondary" [disabled]="items().length === 0" (click)="exportCsv()">Export CSV</button>
            <app-permission-gate actions [permissions]="['OWNER_WRITE']">
              <button type="button" class="btn btn-primary" (click)="adding.set(true)">Add owner</button>
            </app-permission-gate>

            <form class="search-row" (submit)="$event.preventDefault(); applySearch()">
              <label class="field grow"><span class="visually-hidden">Find an owner</span>
                <input type="search" [formControl]="search" placeholder="Find by name, phone or email"></label>
              <button type="submit" class="btn btn-secondary">Search</button>
            </form>

            @if (loading()) {
              <app-loading-state [compact]="true" label="Loading owners…" />
            } @else if (error()) {
              <app-error-state [message]="error()!" (retry)="reload()" />
            } @else if (items().length === 0) {
              <app-empty-state title="No owners yet"
                               description="Add each landlord you manage for, then give them their buildings. Their monthly statement is worked out from rent collected, expenses and your commission." />
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Owner</th><th>Buildings</th><th>Commission</th><th>Paid by</th><th>Sign-in</th></tr></thead>
                  <tbody>
                    @for (owner of items(); track owner.id) {
                      <tr>
                        <td class="card-title">
                          <div class="cell-stack">
                            <a class="text-link" [routerLink]="detail(owner.id)"><strong>{{ owner.name }}</strong></a>
                            @if (owner.phoneNumber) { <span class="muted">{{ phone(owner.phoneNumber) }}</span> }
                          </div>
                        </td>
                        <td data-label="Buildings">
                          @if (owner.buildings.length) { {{ buildingNames(owner) }} } @else { <span class="muted">None yet</span> }
                        </td>
                        <td data-label="Commission">{{ commission(owner) }}</td>
                        <td data-label="Paid by">{{ owner.payoutMethod ? methods[owner.payoutMethod] : '—' }}</td>
                        <td data-label="Sign-in">
                          @if (owner.portalAccess) { <span class="status-chip status-chip--success">Can sign in</span> }
                          @else { <span class="muted">Not invited</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (pagination(); as page) {
                <app-pagination [pagination]="page" [size]="page.size" [shown]="items().length" [total]="page.totalElements"
                                noun="owners" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
              }
            }
          </app-section-card>
        }
      </app-context-guard>
    </section>

    @if (adding()) {
      <app-owner-dialog [agencyId]="context.agencyId()!" (saved)="created($event)" (closed)="adding.set(false)" />
    }
  `,
  styles: [`
    .search-row { display: flex; gap: var(--space-2); align-items: end; margin-bottom: var(--space-3); }
    .search-row .grow { flex: 1; }
    .search-row input { max-width: none; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerListPageComponent {
  readonly context = inject(ActiveContextService);
  private readonly owners = inject(OwnersService);
  private readonly toasts = inject(NotificationService);
  private readonly router = inject(Router);

  readonly methods = PAYOUT_METHOD_LABELS;
  readonly search = inject(NonNullableFormBuilder).control('');
  readonly items = signal<PropertyOwner[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly adding = signal(false);
  private readonly page = signal({ page: 0, size: 20 });

  constructor() {
    effect(() => {
      this.context.agencyId();
      untracked(() => void this.reload());
    });
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.owners.search(agencyId, { ...this.page(), search: this.search.value.trim() || null }));
      this.items.set(result.items);
      this.pagination.set(result.pagination ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  applySearch(): void {
    this.page.update((p) => ({ ...p, page: 0 }));
    void this.reload();
  }

  go(page: number): void {
    this.page.update((p) => ({ ...p, page: Math.max(0, page) }));
    void this.reload();
  }

  resize(size: number): void {
    this.page.set({ page: 0, size });
    void this.reload();
  }

  created(owner: PropertyOwner): void {
    this.adding.set(false);
    this.toasts.push('success', `${owner.name} added. Now give them their buildings.`);
    void this.router.navigateByUrl(this.detail(owner.id));
  }

  exportCsv(): void {
    downloadCsv('owners', this.items(), [
      { header: 'Name', value: (o) => o.name },
      { header: 'Phone', value: (o) => asText(o.phoneNumber) },
      { header: 'Email', value: (o) => o.email },
      { header: 'Buildings', value: (o) => this.buildingNames(o) },
      { header: 'Commission', value: (o) => this.commission(o) },
      { header: 'Paid by', value: (o) => o.payoutMethod ? this.methods[o.payoutMethod] : '' },
      { header: 'Account', value: (o) => asText(o.payoutAccount) },
      { header: 'Can sign in', value: (o) => o.portalAccess }
    ]);
  }

  detail(id: number): string {
    return RoutePaths.ownerDetail(id);
  }

  buildingNames(owner: PropertyOwner): string {
    return owner.buildings.map((b) => b.name).join(', ');
  }

  commission(owner: PropertyOwner): string {
    return commissionLabel(owner.commissionType, owner.commissionValue);
  }

  phone(value: string): string {
    return formatPhone(value);
  }
}
