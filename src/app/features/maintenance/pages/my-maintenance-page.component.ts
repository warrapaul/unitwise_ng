import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { NotificationService } from '../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { MaintenanceDetailBodyComponent } from '../components/maintenance-detail-body.component';
import { MAINTENANCE_CATEGORY_LABELS, MaintenanceCategory, MaintenanceDetail, MaintenancePreview } from '../maintenance.models';
import { MaintenanceService } from '../maintenance.service';

/**
 * The tenant's repairs: what is open, then what is closed, newest first. Reporting one is its own
 * page (Report an issue). A request opens in place: its details, photos and history.
 */
@Component({
  selector: 'app-my-maintenance-page',
  standalone: true,
  imports: [RouterLink, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, StatusChipComponent,
    MaintenanceDetailBodyComponent],
  template: `
    <section class="stack">
      <div class="toolbar">
        <a class="btn btn-primary" [routerLink]="RoutePaths.myMaintenanceNew">Report an issue</a>
      </div>

      @if (loading()) {
        <app-loading-state label="Loading your requests..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (requests().length === 0) {
        <app-empty-state title="No repairs yet" description="Something broken at home? Report it and follow its progress here."
                         actionLabel="Report an issue" [actionLink]="RoutePaths.myMaintenanceNew" />
      } @else {
        @for (group of groups(); track group.title) {
          @if (group.items.length > 0) {
            <app-section-card [title]="group.title">
              <ul class="requests">
                @for (request of group.items; track request.id) {
                  <li class="request">
                    <button type="button" class="request__head" (click)="toggle(request)" [attr.aria-expanded]="openId() === request.id">
                      <span class="request__title">
                        <strong>{{ request.title }}</strong>
                        <span class="muted">{{ categoryLabel(request.category) }}</span>
                        <span class="muted">{{ date(request.createdAt) }}</span>
                      </span>
                      <app-status-chip [status]="request.status" />
                      <svg class="chev" [class.chev--open]="openId() === request.id" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
                    </button>
                    @if (openId() === request.id) {
                      @if (detail(); as d) {
                        <div class="request__body">
                          @if (d.requestNumber) {
                            <p class="ref">Reference <span class="mono">{{ d.requestNumber }}</span>
                              <button type="button" class="btn btn-secondary btn-sm" (click)="copy(d.requestNumber)">Copy</button></p>
                          }
                          <app-maintenance-detail-body [request]="d" [addPhoto]="d.open ? uploadPhoto : null" />
                          @if (d.workNotes) { <p class="notes"><strong>Reply:</strong> {{ d.workNotes }}</p> }
                          <div class="button-row">
                            @if (d.open) {
                              <button type="button" class="btn btn-secondary btn-sm" [disabled]="cancellingId() === d.id" (click)="cancel(d)">
                                {{ cancellingId() === d.id ? 'Cancelling...' : 'Cancel request' }}
                              </button>
                            } @else {
                              <!-- A finished request is not reopened: the problem coming back is a new request that points at it. -->
                              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myMaintenanceNew" [queryParams]="{ followUp: d.id }">Problem is back — report again</a>
                            }
                          </div>
                        </div>
                      } @else {
                        <app-loading-state [compact]="true" label="Loading..." />
                      }
                    }
                  </li>
                }
              </ul>
            </app-section-card>
          }
        }
      }
    </section>
  `,
  styles: [`
    .toolbar { display: flex; justify-content: flex-end; }
    @media (max-width: 700px) { .toolbar .btn { width: 100%; justify-content: center; } }
    .requests { display: grid; gap: var(--space-2-5); margin: 0; padding: 0; list-style: none; }
    .request { border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .request__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); width: 100%; min-height: 3rem; padding: var(--space-3) var(--space-4);
                     border: 0; background: none; font: inherit; color: inherit; text-align: start; cursor: pointer; }
    .request__title { display: grid; gap: var(--space-0-5); min-width: 0; margin-right: auto; }
    .chev { flex: none; width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2; color: var(--text-muted); transition: transform 0.15s; }
    .chev--open { transform: rotate(90deg); }
    .request__body { display: grid; gap: var(--space-2-5); padding: 0 var(--space-4) var(--space-3); }
    .ref { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .notes { padding: var(--space-2) var(--space-3); border-radius: var(--radius-xs); background: var(--surface-2); }
    .request__body .btn { justify-self: start; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyMaintenancePageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly maintenance = inject(MaintenanceService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly requests = signal<MaintenancePreview[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly openId = signal<number | null>(null);
  readonly detail = signal<MaintenanceDetail | null>(null);
  readonly cancellingId = signal<number | null>(null);

  /** Open requests above closed ones, each newest first. */
  readonly groups = computed(() => {
    const newest = [...this.requests()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return [
      { title: 'Open', items: newest.filter((request) => request.open !== false && request.status !== 'COMPLETED' && request.status !== 'CANCELLED') },
      { title: 'Closed', items: newest.filter((request) => !(request.open !== false && request.status !== 'COMPLETED' && request.status !== 'CANCELLED')) }
    ];
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const requests = await firstValueFrom(this.maintenance.getMine({ page: 0, size: 50 }));
      this.requests.set(requests.items);
      // Back from Report an issue: the new request, opened.
      const opened = Number(this.route.snapshot.queryParamMap.get('opened'));
      const request = requests.items.find((item) => item.id === opened);
      if (request) {
        void this.toggle(request);
        void this.router.navigate([], { queryParams: { opened: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }


  async toggle(request: MaintenancePreview): Promise<void> {
    if (this.openId() === request.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(request.id);
    this.detail.set(null);
    try {
      this.detail.set(await firstValueFrom(this.maintenance.getMineById(request.id)));
    } catch (error) {
      this.openId.set(null);
      this.notifications.push('error', extractErrorMessage(error));
    }
  }

  async cancel(request: MaintenanceDetail): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: `Cancel “${request.title}”?`,
      message: 'Your landlord sees your reason. Report it again if the problem comes back.',
      confirmLabel: 'Cancel request',
      destructive: true,
      reason: { label: 'Why', required: true, placeholder: 'e.g. Fixed it myself', maxLength: 500 }
    });
    if (reason === null) {
      return;
    }
    this.cancellingId.set(request.id);
    try {
      const updated = await firstValueFrom(this.maintenance.cancelMine(request.id, reason));
      this.detail.set(updated);
      this.requests.update((list) => list.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.cancellingId.set(null);
    }
  }

  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.notifications.push('success', 'Reference copied.');
    } catch {
      this.notifications.push('error', 'Could not copy — select it instead.');
    }
  }

  /** Photos on an open request; the list keeps the refreshed detail. */
  readonly uploadPhoto: FileUploadSend = async ([file]) => {
    const open = this.detail();
    if (!open) {
      return false;
    }
    try {
      this.detail.set(await firstValueFrom(this.maintenance.addMyPhoto(open.id, file)));
      return true;
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
      return false;
    }
  };

  categoryLabel(category: MaintenanceCategory): string {
    return MAINTENANCE_CATEGORY_LABELS[category] ?? category;
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
