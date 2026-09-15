import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { NotificationsService } from '../notifications.service';
import { InAppNotification } from '../models/notification.models';

type NotificationFilter = 'all' | 'unread' | 'starred';

@Component({
  selector: 'app-notification-list-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Notifications">
        <ng-container actions>
          <div class="button-row">
            @if (unreadCount() !== null) {
              <span class="status-chip status-chip--warning">{{ unreadCount() }} unread</span>
            }
            <button type="button" class="btn btn-secondary" [disabled]="markingAll()" (click)="markAllRead()">
              {{ markingAll() ? 'Marking...' : 'Mark all read' }}
            </button>
            <app-permission-gate [permissions]="[Permissions.NOTIFICATION_SEND]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.notificationsAdmin">Send broadcast</a>
            </app-permission-gate>
          </div>
        </ng-container>

        <div class="scope-tabs">
          <button type="button" class="btn btn-secondary btn-sm" [class.active]="filter() === 'all'" (click)="setFilter('all')">All</button>
          <button type="button" class="btn btn-secondary btn-sm" [class.active]="filter() === 'unread'" (click)="setFilter('unread')">Unread</button>
          <button type="button" class="btn btn-secondary btn-sm" [class.active]="filter() === 'starred'" (click)="setFilter('starred')">Starred</button>
        </div>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading notifications..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (notifications().length === 0) {
        <app-empty-state title="Nothing here" description="Notifications will appear here as they arrive." />
      } @else {
        <section class="panel notification-list">
          @for (notification of notifications(); track notification.id) {
            <article class="notification" [class.notification--unread]="!notification.isRead">
              <div class="notification__body">
                <h3>{{ notification.title || 'Notification' }}</h3>
                <p>{{ notification.body }}</p>
                <div class="notification__meta">
                  <span class="muted">{{ formatDateTime(notification.sentAt || notification.createdAt) }}</span>
                  @if (notification.notificationType) {
                    <span class="status-chip status-chip--info">{{ notification.notificationType }}</span>
                  }
                </div>
              </div>

              <div class="row-actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  [disabled]="busyId() === notification.id"
                  (click)="toggleStar(notification)"
                >
                  {{ notification.isStarred ? 'Unstar' : 'Star' }}
                </button>
                @if (!notification.isRead) {
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    [disabled]="busyId() === notification.id"
                    (click)="markRead(notification)"
                  >
                    Mark read
                  </button>
                }
              </div>
            </article>
          }
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
    .scope-tabs {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .scope-tabs .active {
      border-color: var(--primary);
      color: var(--primary-strong);
    }

    .notification-list {
      display: grid;
      gap: 0.6rem;
      padding: 1rem;
    }

    .notification {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      flex-wrap: wrap;
    }

    .notification--unread {
      border-color: var(--primary);
      background: var(--surface-2);
    }

    .notification__body {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
    }

    .notification h3 {
      margin: 0;
      font-size: 0.98rem;
    }

    .notification p {
      margin: 0;
      font-size: 0.9rem;
    }

    .notification__meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      font-size: 0.8rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly notificationsService = inject(NotificationsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notifications = signal<InAppNotification[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly filter = signal<NotificationFilter>('all');
  readonly unreadCount = signal<number | null>(null);
  readonly busyId = signal<number | null>(null);
  readonly markingAll = signal(false);
  readonly page = signal(0);
  readonly size = signal(20);

  ngOnInit(): void {
    void this.reload();
    void this.loadUnreadCount();
  }

  async setFilter(filter: NotificationFilter): Promise<void> {
    this.filter.set(filter);
    this.page.set(0);
    await this.reload();
  }

  async loadUnreadCount(): Promise<void> {
    try {
      this.unreadCount.set(await firstValueFrom(this.notificationsService.getUnreadCount()));
    } catch {
      // The badge is informational — a failure here shouldn't block the list.
      this.unreadCount.set(null);
    }
  }

  async markRead(notification: InAppNotification): Promise<void> {
    this.busyId.set(notification.id);
    this.error.set(null);

    try {
      const updated = await firstValueFrom(this.notificationsService.markRead(notification.id));
      this.notifications.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      await this.loadUnreadCount();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async toggleStar(notification: InAppNotification): Promise<void> {
    this.busyId.set(notification.id);
    this.error.set(null);

    try {
      const updated = await firstValueFrom(this.notificationsService.toggleStar(notification.id));
      this.notifications.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async markAllRead(): Promise<void> {
    this.markingAll.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.notificationsService.markAllRead());
      await this.reload();
      await this.loadUnreadCount();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.markingAll.set(false);
    }
  }

  async previousPage(): Promise<void> {
    if (this.page() <= 0) {
      return;
    }

    this.page.update((value) => value - 1);
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.page.set(pagination.page + 1);
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.size.set(size);
    this.page.set(0);
    await this.reload();
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

    const params = { page: this.page(), size: this.size() };

    try {
      const result = this.filter() === 'unread'
        ? await firstValueFrom(this.notificationsService.getUnread(params))
        : this.filter() === 'starred'
          ? await firstValueFrom(this.notificationsService.getStarred(params))
          : await firstValueFrom(this.notificationsService.getNotifications(params));

      this.notifications.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
