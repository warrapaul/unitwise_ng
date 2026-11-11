import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ProfileGrantsService } from '../../tenants/profile-grants/profile-grants.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { MoreMenuComponent } from '../../../shared/components/more-menu/more-menu.component';
import { NgTemplateOutlet } from '@angular/common';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { NotificationsService } from '../notifications.service';
import { NotificationCenterService } from '../notification-center.service';
import { notificationLink } from '../notification-links';
import { RealtimeService } from '../../../core/services/realtime.service';
import { InAppNotification, NotificationCategory } from '../models/notification.models';

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
    PermissionGateComponent,
    MoreMenuComponent,
    NgTemplateOutlet
  ],
  template: `
    <section class="stack">
      <!-- One row of filters and the one bulk action; the page title is in the header. -->
      <div class="toolbar">
        <div class="scope-tabs" role="group" aria-label="Show">
          @for (option of choices(); track option.key) {
            <button type="button" class="chip" [class.active]="choice() === option.key" [attr.aria-pressed]="choice() === option.key"
                    (click)="choose(option.key)">{{ option.label }}@if (option.key === 'unread' && center.unread() > 0) { ({{ center.unread() }}) }</button>
          }
        </div>
        <div class="toolbar__end">
          <button type="button" class="btn-text" [disabled]="markingAll() || center.unread() === 0" (click)="markAllRead()">
            {{ markingAll() ? 'Marking...' : 'Mark all read' }}
          </button>
          <app-permission-gate [permissions]="[Permissions.NOTIFICATION_SEND]">
            <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.notificationsAdmin">Send broadcast</a>
          </app-permission-gate>
        </div>
      </div>

      @if (loading()) {
        <app-loading-state label="Loading notifications..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (notifications().length === 0) {
        <app-empty-state [title]="choice() === 'unread' ? 'All caught up' : 'Nothing here'"
                         [description]="choice() === 'unread' ? 'Nothing unread.' : 'Notifications appear here as they arrive.'" />
      } @else {
        @for (group of groups(); track group.label) {
          <section class="group">
            <h2 class="group__title">{{ group.label }}</h2>
            <ul class="notification-list">
              @for (notification of group.items; track notification.id) {
                <li class="notification" [class.notification--unread]="!notification.isRead" [class.notification--ask]="isPendingRequest(notification)">
                  <!-- The whole card opens it, and opening reads it. -->
                  @if (linkFor(notification); as target) {
                    <a class="notification__main" [routerLink]="target" (click)="opened(notification)">
                      <ng-container *ngTemplateOutlet="content; context: { $implicit: notification }" />
                      <svg class="chev" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
                    </a>
                  } @else {
                    <button type="button" class="notification__main" (click)="opened(notification)">
                      <ng-container *ngTemplateOutlet="content; context: { $implicit: notification }" />
                    </button>
                  }
                  <app-more-menu [label]="'⋯'" class="notification__menu">
                    @if (!notification.isRead) {
                      <button type="button" [disabled]="busyId() === notification.id" (click)="markRead(notification)">Mark read</button>
                    }
                    <button type="button" [disabled]="busyId() === notification.id" (click)="toggleStar(notification)">{{ notification.isStarred ? 'Unstar' : 'Star' }}</button>
                  </app-more-menu>
                  @if (earlier(notification).length > 0) {
                    <div class="notification__earlier">
                      <button type="button" class="btn-text" (click)="expandedId.set(expandedId() === notification.id ? null : notification.id)"
                              [attr.aria-expanded]="expandedId() === notification.id">
                        {{ expandedId() === notification.id ? 'Hide' : 'Show' }} {{ earlier(notification).length }} earlier update{{ earlier(notification).length === 1 ? '' : 's' }}
                      </button>
                      @if (expandedId() === notification.id) {
                        <ul>
                          @for (old of earlier(notification); track old.id) {
                            <li><strong>{{ old.title }}</strong> <span class="muted">· {{ when(old.sentAt || old.createdAt) }}</span></li>
                          }
                        </ul>
                      }
                    </div>
                  }
                  <!-- A sharing request is answered here, without a trip to the profile. -->
                  @if (isPendingRequest(notification)) {
                    <div class="notification__answer">
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="answering() === notification.entityId" (click)="answer(notification, true)">Accept</button>
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="answering() === notification.entityId" (click)="answer(notification, false)">Decline</button>
                    </div>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <ng-template #content let-notification>
          <span class="notification__body">
            <span class="notification__title">
              @if (!notification.isRead) { <span class="dot" aria-label="Unread"></span> }
              {{ notification.title || 'Notification' }}
              @if (notification.isStarred) { <span class="star" aria-label="Starred">★</span> }
            </span>
            @if (notification.body) { <span class="notification__text">{{ notification.body }}</span> }
            <span class="muted notification__time">{{ when(notification.sentAt || notification.createdAt) }}</span>
          </span>
        </ng-template>

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
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
    .toolbar__end { display: flex; align-items: center; gap: var(--space-3); margin-left: auto; }
    .scope-tabs { display: flex; gap: var(--space-1-5); flex-wrap: wrap; }
    .chip { min-height: 2.5rem; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface);
            font: inherit; font-size: var(--text-md); color: var(--text); cursor: pointer; }
    .chip.active { border-color: var(--primary); background: var(--surface-2); color: var(--primary-strong); font-weight: var(--weight-semibold); }
    .btn-text { padding: 0; border: 0; background: none; font: inherit; font-weight: var(--weight-semibold); color: var(--primary-strong); cursor: pointer; }
    .btn-text:disabled { color: var(--text-muted); cursor: default; }
    .group { display: grid; gap: var(--space-2); }
    .group__title { margin: 0; font-size: var(--font-section-label); font-weight: var(--weight-semibold); color: var(--text-muted); }
    .notification-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .notification { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--space-1); padding-right: var(--space-2); border: 1px solid var(--border);
                    border-radius: var(--radius-md); background: var(--surface); }
    .notification--unread { border-color: var(--primary); }
    .notification--ask { border-color: var(--warning-border, var(--primary)); background: var(--warning-tint); }
    .notification__earlier { flex-basis: 100%; padding: 0 var(--space-4) var(--space-3); font-size: var(--text-md); }
    .notification__earlier ul { margin: var(--space-2) 0 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }
    .notification__answer { flex-basis: 100%; display: flex; gap: var(--space-2); padding: 0 var(--space-4) var(--space-3); }
    .notification__main { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4);
                          border: 0; background: none; font: inherit; color: inherit; text-align: left; text-decoration: none; cursor: pointer; }
    .notification__body { flex: 1; display: grid; gap: var(--space-1); min-width: 0; }
    .notification__title { display: flex; align-items: center; gap: var(--space-1-5); font-weight: var(--weight-regular, 400); }
    .notification--unread .notification__title { font-weight: var(--weight-bold); }
    .notification__text { font-size: var(--text-md); color: var(--text); overflow-wrap: anywhere; }
    .notification__time { font-size: var(--text-sm); }
    .dot { flex: none; width: 0.55rem; height: 0.55rem; border-radius: 50%; background: var(--primary); }
    .star { color: var(--warning, #b7791f); }
    .chev { flex: none; width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2; color: var(--text-muted); }
    .notification app-more-menu { margin-top: var(--space-2); }
    .notification app-more-menu ::ng-deep summary { min-height: 2.5rem; padding: 0 var(--space-2-5); }
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
  readonly category = signal<NotificationCategory | null>(null);
  private readonly context = inject(ActiveContextService);

  /**
   * One set of filters: everything, unread, then what it is about. Starred is kept for staff
   * working a queue; for a tenant it adds nothing. Orders only where there is a shop to have them.
   */
  readonly choices = computed(() => {
    const role = this.context.active().roleName;
    const tenant = role === 'TENANT';
    const list: { key: string; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }];
    if (!tenant) {
      list.push({ key: 'starred', label: 'Starred' });
    }
    list.push({ key: 'PAYMENTS', label: 'Payments' }, { key: 'TENANCY', label: 'Tenancy' }, { key: 'MAINTENANCE', label: tenant ? 'Repairs' : 'Maintenance' });
    if (role !== 'CARETAKER' && role !== 'AGENCY_ADMIN') {
      list.push({ key: 'ORDERS', label: 'Orders' });
    }
    list.push({ key: 'SYSTEM', label: 'Messages' });
    return list;
  });

  readonly choice = computed(() => this.category() ?? this.filter());

  async choose(key: string): Promise<void> {
    if (key === 'all' || key === 'unread' || key === 'starred') {
      this.category.set(null);
      await this.setFilter(key as NotificationFilter);
    } else {
      this.filter.set('all');
      await this.setCategory(key as NotificationCategory);
    }
  }

  /**
   * One card per repair: its updates (received, started, completed) fold under the latest, so a
   * single request does not fill the list. Everything else stays one card per notification.
   */
  private readonly threads = computed(() => {
    const byRequest = new Map<string, InAppNotification[]>();
    const cards: InAppNotification[] = [];
    for (const n of this.notifications()) {
      const key = n.entityType === 'MAINTENANCE_REQUEST' && n.entityId ? `repair-${n.entityId}` : null;
      if (key && byRequest.has(key)) {
        byRequest.get(key)!.push(n);
        continue;
      }
      if (key) {
        byRequest.set(key, []);
      }
      cards.push(n);
    }
    const earlier = new Map(cards.map((n) => [n.id, n.entityType === 'MAINTENANCE_REQUEST' && n.entityId
      ? byRequest.get(`repair-${n.entityId}`) ?? [] : []]));
    return { cards, earlier };
  });
  readonly expandedId = signal<number | null>(null);

  earlier(n: InAppNotification): InAppNotification[] {
    return this.threads().earlier.get(n.id) ?? [];
  }

  /** Today, then everything earlier, newest first within each. */
  readonly groups = computed(() => {
    const today = new Date().toDateString();
    const items = this.threads().cards;
    const isToday = (n: InAppNotification) => new Date(n.sentAt || n.createdAt || 0).toDateString() === today;
    return [
      { label: 'Today', items: items.filter(isToday) },
      { label: 'Earlier', items: items.filter((n) => !isToday(n)) }
    ].filter((group) => group.items.length > 0);
  });

  /** "5 min ago", "3 h ago", then the date: when it came matters more than the exact minute. */
  when(value?: string | null): string {
    if (!value) {
      return '';
    }
    const at = new Date(value);
    const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
    if (Number.isNaN(minutes)) {
      return value;
    }
    if (minutes < 1) {
      return 'Just now';
    }
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    if (minutes < 24 * 60 && at.toDateString() === new Date().toDateString()) {
      return `${Math.floor(minutes / 60)} h ago`;
    }
    return this.formatDateTime(value);
  }
  readonly center = inject(NotificationCenterService);
  private readonly realtime = inject(RealtimeService);

  constructor() {
    // A push while the inbox is open lands in it, not only in a toast.
    effect(() => {
      if (this.realtime.lastNotification()) {
        untracked(() => void this.reload());
      }
    });
  }

  private readonly router = inject(Router);

  /** Parsed, so a link carrying a query (`?report=12`) is not escaped into the path. */
  linkFor(notification: InAppNotification): UrlTree | null {
    const link = notificationLink(notification);
    return link ? this.router.parseUrl(link) : null;
  }

  /** Followed a notification's link: it counts as read. */
  opened(notification: InAppNotification): void {
    if (!notification.isRead) {
      void this.markRead(notification);
    }
  }
  readonly busyId = signal<number | null>(null);
  readonly markingAll = signal(false);
  readonly page = signal(0);
  readonly size = signal(20);

  ngOnInit(): void {
    void this.reload();
    void this.center.refresh();
  }

  async setFilter(filter: NotificationFilter): Promise<void> {
    this.filter.set(filter);
    this.page.set(0);
    await this.reload();
  }

  async setCategory(category: NotificationCategory | null): Promise<void> {
    this.category.set(category);
    this.page.set(0);
    await this.reload();
  }

  private readonly grants = inject(ProfileGrantsService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);
  /** Sharing requests still waiting on this person, by grant id. */
  private readonly pendingGrants = signal<ReadonlySet<number>>(new Set());
  readonly answering = signal<number | null>(null);

  isPendingRequest(notification: InAppNotification): boolean {
    return notification.notificationType === 'TENANCY_PROFILE_ACCESS_REQUESTED'
      && !!notification.entityId && this.pendingGrants().has(notification.entityId);
  }

  private async loadPendingGrants(): Promise<void> {
    if (!this.notifications().some((n) => n.notificationType === 'TENANCY_PROFILE_ACCESS_REQUESTED')) {
      return;
    }
    try {
      const page = await firstValueFrom(this.grants.getMyGrants({ size: 100 }));
      this.pendingGrants.set(new Set((page.items ?? []).filter((grant) => grant.status === 'PENDING').map((grant) => grant.id)));
    } catch {
      // Without the list the card still opens Sharing, where the request can be answered.
    }
  }

  async answer(notification: InAppNotification, accept: boolean): Promise<void> {
    const grantId = notification.entityId!;
    if (!await this.confirm.ask(accept
      ? { title: 'Share your tenant profile?', message: 'They will see your tenant profile and its documents. You can stop sharing at any time.', confirmLabel: 'Share' }
      : { title: 'Decline this request?', message: 'They are told you declined. You can still share later.', confirmLabel: 'Decline' })) {
      return;
    }
    this.answering.set(grantId);
    try {
      await firstValueFrom(accept
        ? this.grants.approveGrant(grantId, { scopes: ['PROFILE', 'DOCUMENTS'] })
        : this.grants.declineGrant(grantId));
      this.pendingGrants.update((set) => new Set([...set].filter((id) => id !== grantId)));
      if (!notification.isRead) {
        void this.markRead(notification);
      }
      this.toasts.push('success', accept ? 'Shared.' : 'Declined.');
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.answering.set(null);
    }
  }

  async markRead(notification: InAppNotification): Promise<void> {
    this.busyId.set(notification.id);
    this.error.set(null);

    try {
      const updated = await firstValueFrom(this.notificationsService.markRead(notification.id));
      this.notifications.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      this.center.markedRead();
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
      this.center.markedAllRead();
      await this.reload();
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
    return Number.isNaN(date.getTime()) ? value : displayDateTime(date);
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    // Starred has no category filter on the server: it is a short, hand-picked list.
    const params = { page: this.page(), size: this.size(), category: this.category() ?? undefined };

    try {
      const result = this.filter() === 'unread'
        ? await firstValueFrom(this.notificationsService.getUnread(params))
        : this.filter() === 'starred'
          ? await firstValueFrom(this.notificationsService.getStarred(params))
          : await firstValueFrom(this.notificationsService.getNotifications(params));

      this.notifications.set(result.items);
      void this.loadPendingGrants();
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
