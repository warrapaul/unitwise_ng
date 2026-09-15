import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { AccessControlService } from '../access-control.service';
import { PermissionResponse } from '../models/access-control.models';

@Component({
  selector: 'app-permission-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Permissions">
        <ng-container actions>
          <span class="muted">{{ permissions().length }} discovered</span>
        </ng-container>

        <p class="hint">Permissions are auto-discovered from backend controllers on startup and cannot be edited here.</p>

        <label class="field">
          <span>Filter</span>
          <input [formControl]="filter" placeholder="Permission name or category">
        </label>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading permissions..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (visiblePermissions().length === 0) {
        <app-empty-state title="No permissions found" description="Try a different filter." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>Category</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                @for (permission of visiblePermissions(); track permission.id) {
                  <tr>
                    <td><strong>{{ permission.name }}</strong></td>
                    <td>{{ permission.category || '-' }}</td>
                    <td>{{ permission.roleScope || '-' }}</td>
                    <td>
                      <span class="status-chip" [ngClass]="permission.enabled ? 'status-chip--success' : 'status-chip--danger'">
                        {{ permission.enabled ? 'Enabled' : 'Disabled' }}
                      </span>
                    </td>
                    <td class="description-col">{{ permission.description || '-' }}</td>
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

    .table-scroll {
      overflow: auto;
    }

    .description-col {
      white-space: normal;
      min-width: 240px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PermissionListPageComponent implements OnInit {
  private readonly accessControl = inject(AccessControlService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly permissions = signal<PermissionResponse[]>([]);

  readonly filter = new FormControl('', { nonNullable: true });
  private readonly filterValue = toSignal(this.filter.valueChanges, { initialValue: '' });

  readonly visiblePermissions = computed(() => {
    const term = this.filterValue().trim().toLowerCase();
    const sorted = [...this.permissions()].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) {
      return sorted;
    }

    return sorted.filter((permission) =>
      permission.name.toLowerCase().includes(term)
      || (permission.category ?? '').toLowerCase().includes(term)
      || (permission.description ?? '').toLowerCase().includes(term)
    );
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.permissions.set(await firstValueFrom(this.accessControl.getPermissions()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
