import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ChatService } from '../chat.service';
import { ChatCenterService } from '../chat-center.service';
import { ChatBroadcastComponent } from '../components/chat-broadcast.component';
import { ChatThread, PostingPolicy, ThreadMessage } from '../models/chat.models';

/** Whose inbox is on screen. */
type Scope = 'mine' | 'agency' | 'shop';

const STAFF_READ = ['TENANT_MESSAGE_READ', 'TENANT_MESSAGE_READ_ALL'];
const PAGE_SIZE = 30;

/**
 * Every conversation in one place: the list on the left, the open thread on
 * the right (one or the other on a phone).
 *
 * - Mine — the person's own threads: with their landlord, their building's
 *   channel, the shop.
 * - Tenants — staff: the agency's tenancy threads and building channels.
 * - Shop — shop admins: every customer conversation.
 *
 * Threads are opened from where their subject lives (a tenant's page, an
 * order) and land here at `/chat/:id`.
 */
@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    ChatBroadcastComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Chat">
        <ng-container actions>
          <div class="action-bar">
            @if (scope() === 'mine') {
              <button type="button" class="btn btn-secondary" [disabled]="opening()" (click)="contactShop()">Contact the shop</button>
            } @else if (scope() === 'agency') {
              @if (context.buildingId()) {
                <button type="button" class="btn btn-secondary" [disabled]="opening()" (click)="openChannel()">Building channel</button>
              }
              <button type="button" class="btn btn-primary" (click)="broadcastOpen.set(!broadcastOpen())">Broadcast</button>
            }
          </div>
        </ng-container>

        @if (scopes().length > 1) {
          <div class="scopes" role="group" aria-label="Inbox">
            @for (option of scopes(); track option) {
              <button type="button" class="btn btn-secondary btn-sm" [class.scopes__active]="scope() === option"
                      [attr.aria-pressed]="scope() === option" (click)="setScope(option)">{{ scopeLabel(option) }}</button>
            }
          </div>
        }

        @if (broadcastOpen() && scope() === 'agency' && context.agencyId(); as agencyId) {
          <app-chat-broadcast [agencyId]="agencyId" [buildingId]="context.buildingId()"
                              (sent)="broadcastSent($event)" (closed)="broadcastOpen.set(false)" />
        }
        @if (notice(); as text) {
          <p class="alert alert-success">{{ text }}</p>
        }
        @if (actionError(); as apiError) {
          <app-error-card title="Unable to open the conversation" [message]="apiError.message" [details]="apiError.details" />
        }
      </app-section-card>

      <div class="chat" [class.chat--open]="!!selected()">
        <aside class="chat__list panel" aria-label="Conversations">
          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading..." />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (threads().length === 0) {
            <p class="muted chat__empty">No conversations yet.</p>
          } @else {
            <ul class="threads">
              @for (thread of threads(); track thread.id) {
                <li>
                  <button type="button" class="thread" [class.thread--active]="thread.id === selected()?.id"
                          [class.thread--unread]="(thread.unreadCount ?? 0) > 0" (click)="select(thread)">
                    <span class="thread__top">
                      <span class="thread__title">{{ thread.title || typeLabel(thread) }}</span>
                      @if (thread.lastMessageAt) {
                        <span class="thread__time">{{ thread.lastMessageAt | date: 'd MMM' }}</span>
                      }
                    </span>
                    <span class="thread__bottom">
                      <span class="thread__preview">
                        @if (thread.type !== 'TENANCY') { <em>{{ typeLabel(thread) }}</em> · }{{ thread.lastMessagePreview || 'No messages yet' }}
                      </span>
                      @if ((thread.unreadCount ?? 0) > 0) {
                        <span class="thread__badge" [attr.aria-label]="thread.unreadCount + ' unread'">{{ thread.unreadCount }}</span>
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
            @if (hasMoreThreads()) {
              <button type="button" class="btn btn-secondary btn-sm chat__more" (click)="loadMoreThreads()">Load more</button>
            }
          }
        </aside>

        <section class="chat__thread panel" aria-live="polite">
          @if (selected(); as thread) {
            <header class="thread-head">
              <button type="button" class="btn btn-secondary btn-sm thread-head__back" (click)="close()">Back</button>
              <div class="thread-head__title">
                <strong>{{ thread.title || typeLabel(thread) }}</strong>
                <span class="muted">{{ typeLabel(thread) }}</span>
              </div>
              <!-- Staff decide whether tenants may post in a building's channel. -->
              @if (thread.type === 'BUILDING_CHANNEL' && scope() === 'agency') {
                <label class="policy">
                  <span class="visually-hidden">Who can post</span>
                  <select [value]="thread.postingPolicy ?? 'ADMINS_ONLY'" (change)="setPolicy(thread, $event)">
                    <option value="ADMINS_ONLY">Staff only</option>
                    <option value="ALL_MEMBERS">Everyone</option>
                  </select>
                </label>
              }
            </header>

            <div #scroller class="messages">
              @if (hasMoreMessages()) {
                <button type="button" class="btn btn-secondary btn-sm messages__earlier" [disabled]="loadingMessages()"
                        (click)="loadEarlier()">Load earlier</button>
              }
              @if (loadingMessages() && messages().length === 0) {
                <app-loading-state [compact]="true" label="Loading messages..." />
              } @else if (messagesError()) {
                <app-error-state [message]="messagesError()!" (retry)="openThread(thread)" />
              } @else if (messages().length === 0) {
                <p class="muted chat__empty">No messages yet.</p>
              }
              @for (message of messages(); track message.id) {
                <div class="message" [class.message--mine]="isMine(message)">
                  @if (!isMine(message)) {
                    <span class="message__who">{{ message.senderName || (message.fromStaff ? 'Staff' : 'Member') }}</span>
                  }
                  <p class="message__text">{{ message.content }}</p>
                  <span class="message__time">{{ message.createdAt | date: 'd MMM, HH:mm' }}</span>
                </div>
              }
            </div>

            @if (thread.canPost === false) {
              <p class="muted composer__closed">Only staff post here.</p>
            } @else {
              <form class="composer" [formGroup]="composer" (ngSubmit)="send()">
                <label class="visually-hidden" for="chat-draft">Message</label>
                <textarea id="chat-draft" formControlName="content" rows="2" maxlength="4000" placeholder="Write a message"
                          (keydown.enter)="onEnter($event)"></textarea>
                <button type="submit" class="btn btn-primary" [disabled]="sending() || composer.invalid">
                  {{ sending() ? 'Sending...' : 'Send' }}
                </button>
              </form>
              @if (sendError(); as apiError) {
                <app-error-card title="Not sent" [message]="apiError.message" [details]="apiError.details" />
              }
            }
          } @else {
            <p class="muted chat__empty">Choose a conversation.</p>
          }
        </section>
      </div>
    </section>
  `,
  styles: [`
    .scopes { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .scopes__active { border-color: var(--primary); color: var(--primary-strong); }

    .chat {
      display: grid;
      grid-template-columns: minmax(16rem, 22rem) 1fr;
      gap: 1rem;
      min-height: 60vh;
    }

    .chat__list, .chat__thread { padding: 0.5rem; min-width: 0; }
    .chat__thread { display: grid; grid-template-rows: auto 1fr auto; padding: 0; }
    .chat__empty { padding: 1rem; margin: 0; }
    .chat__more { margin: 0.5rem; }

    /* One pane at a time on a phone: the list, or the open thread. */
    @media (max-width: 800px) {
      .chat { grid-template-columns: 1fr; }
      .chat--open .chat__list { display: none; }
      .chat:not(.chat--open) .chat__thread { display: none; }
    }

    .threads { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }

    .thread {
      width: 100%;
      display: grid;
      gap: 0.15rem;
      padding: 0.6rem 0.7rem;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      text-align: left;
      font: inherit;
      cursor: pointer;
    }

    .thread:hover { background: var(--surface-2); }
    .thread--active { background: var(--primary-tint); }
    .thread--unread .thread__title { font-weight: 700; }

    .thread__top, .thread__bottom { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .thread__title, .thread__preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thread__title { font-weight: 600; }
    .thread__preview { color: var(--text-muted); font-size: 0.85rem; }
    .thread__preview em { font-style: normal; }
    .thread__time { flex: none; color: var(--text-muted); font-size: 0.75rem; }

    .thread__badge {
      flex: none;
      min-width: 1.2rem;
      height: 1.2rem;
      padding: 0 0.3rem;
      border-radius: 999px;
      background: var(--danger);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      line-height: 1.2rem;
      text-align: center;
    }

    .thread-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .thread-head__title { flex: 1; min-width: 0; display: grid; gap: 0.1rem; }
    .thread-head__title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thread-head__title .muted { font-size: 0.8rem; }
    .thread-head__back { display: none; }

    @media (max-width: 800px) {
      .thread-head__back { display: inline-flex; }
    }

    .policy select { min-height: var(--control-sm); }

    .messages {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      overflow-y: auto;
      max-height: 60vh;
    }

    .messages__earlier { align-self: center; }

    .message {
      align-self: flex-start;
      max-width: min(80%, 36rem);
      display: grid;
      gap: 0.15rem;
      padding: 0.5rem 0.75rem;
      border-radius: 12px;
      background: var(--surface-2);
    }

    .message--mine { align-self: flex-end; background: var(--primary-tint); }
    .message__who { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); }
    .message__text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .message__time { font-size: 0.7rem; color: var(--text-muted); justify-self: end; }

    .composer {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border);
    }

    .composer textarea { flex: 1; resize: vertical; min-height: 2.6rem; }
    .composer__closed { margin: 0; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPageComponent {
  readonly context = inject(ActiveContextService);
  private readonly session = inject(AuthSessionService);
  private readonly chat = inject(ChatService);
  private readonly center = inject(ChatCenterService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly scopes = computed<Scope[]>(() => {
    const scopes: Scope[] = ['mine'];
    if (this.context.agencyId() && this.context.canAny(STAFF_READ)) {
      scopes.push('agency');
    }
    if (this.context.can('CHAT_ADMIN_READ')) {
      scopes.push('shop');
    }
    return scopes;
  });

  readonly scope = signal<Scope>('mine');

  readonly threads = signal<ChatThread[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly threadPage = signal(0);
  readonly hasMoreThreads = signal(false);

  readonly selected = signal<ChatThread | null>(null);
  readonly messages = signal<ThreadMessage[]>([]);
  readonly loadingMessages = signal(false);
  readonly messagesError = signal<string | null>(null);
  private readonly messagePage = signal(0);
  readonly hasMoreMessages = signal(false);

  readonly sending = signal(false);
  readonly sendError = signal<ApiError | null>(null);
  readonly opening = signal(false);
  readonly actionError = signal<ApiError | null>(null);
  readonly broadcastOpen = signal(false);
  readonly notice = signal<string | null>(null);

  readonly composer = this.fb.group({ content: ['', [Validators.required, Validators.maxLength(4000)]] });

  constructor() {
    // Staff land on their agency's inbox; everyone else on their own.
    const scopes = this.scopes();
    this.scope.set(scopes.includes('agency') ? 'agency' : scopes.includes('shop') ? 'shop' : 'mine');

    // A thread opened elsewhere arrives in the navigation state, ready to show.
    const seeded = (this.router.getCurrentNavigation()?.extras.state ?? history.state)?.['thread'] as ChatThread | undefined;

    // The thread id lives on the child route; read it on every navigation.
    const route = inject(ActivatedRoute);
    const current = (): number | null => {
      const id = Number(route.snapshot.firstChild?.paramMap.get('threadId'));
      return Number.isFinite(id) && id > 0 ? id : null;
    };
    void this.route(current(), seeded);
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      const id = current();
      if (id !== (this.selected()?.id ?? null)) {
        const state = this.router.getCurrentNavigation()?.extras.state ?? history.state;
        void this.route(id, state?.['thread'] as ChatThread | undefined);
      }
    });

    // The agency inbox follows the switcher — after the first load, which the route does.
    let first = true;
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      untracked(() => {
        if (!first && this.scope() === 'agency') {
          void this.reload();
        }
        first = false;
      });
    });

    // Live messages: into the open thread, or onto its row in the list.
    effect(() => {
      const event = this.center.lastEvent();
      if (event) {
        untracked(() => this.onEvent(event.threadId, event.message ?? null, event.unreadCount ?? null));
      }
    });
  }

  scopeLabel(scope: Scope): string {
    return scope === 'mine' ? 'Mine' : scope === 'agency' ? 'Tenants' : 'Shop';
  }

  typeLabel(thread: ChatThread): string {
    switch (thread.type) {
      case 'BUILDING_CHANNEL': return 'Building channel';
      case 'SHOP': return thread.orderId ? `Shop · order #${thread.orderId}` : 'Shop';
      default: return 'Tenancy';
    }
  }

  isMine(message: ThreadMessage): boolean {
    return message.senderId !== null && message.senderId === this.session.currentUserId();
  }

  // --- list ---

  async setScope(scope: Scope): Promise<void> {
    if (this.scope() === scope) {
      return;
    }
    this.scope.set(scope);
    this.broadcastOpen.set(false);
    await this.reload();
  }

  async reload(): Promise<void> {
    this.threadPage.set(0);
    await this.loadThreads(false);
  }

  async loadMoreThreads(): Promise<void> {
    this.threadPage.update((page) => page + 1);
    await this.loadThreads(true);
  }

  private async loadThreads(append: boolean): Promise<void> {
    this.loading.set(!append);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.listRequest(this.scope(), this.threadPage()));
      this.threads.update((current) => append ? [...current, ...page.items] : page.items);
      this.hasMoreThreads.set(!!page.pagination && !page.pagination.isLast);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private listRequest(scope: Scope, page: number) {
    const agencyId = this.context.agencyId();
    if (scope === 'agency' && agencyId) {
      return this.chat.getAgencyThreads(agencyId, { buildingId: this.context.buildingId(), page, size: PAGE_SIZE });
    }
    return scope === 'shop'
      ? this.chat.getShopThreads({ page, size: PAGE_SIZE })
      : this.chat.getMyThreads({ page, size: PAGE_SIZE });
  }

  // --- opening ---

  select(thread: ChatThread): void {
    void this.router.navigate([RoutePaths.chatConversation(thread.id)], { state: { thread } });
  }

  close(): void {
    void this.router.navigate([RoutePaths.chat]);
  }

  /** The URL decides what is open; a seeded thread saves looking it up. */
  private async route(threadId: number | null, seeded?: ChatThread): Promise<void> {
    if (this.threads().length === 0 && !this.loading()) {
      await this.reload();
    }

    if (threadId === null) {
      this.selected.set(null);
      return;
    }

    const thread = this.threads().find((entry) => entry.id === threadId)
      ?? (seeded?.id === threadId ? seeded : null)
      ?? await this.findThread(threadId);

    // Unknown to every list we can read: still open it; the server decides access.
    await this.openThread(thread ?? { id: threadId, type: 'TENANCY', title: 'Conversation' });
  }

  /** A deep link to a thread not on the current list: look in the other inboxes. */
  private async findThread(threadId: number): Promise<ChatThread | null> {
    for (const scope of this.scopes()) {
      if (scope === this.scope()) {
        continue;
      }
      try {
        const page = await firstValueFrom(this.listRequest(scope, 0));
        const hit = page.items.find((entry) => entry.id === threadId);
        if (hit) {
          this.scope.set(scope);
          this.threads.set(page.items);
          return hit;
        }
      } catch {
        // Not readable in that inbox; try the next.
      }
    }
    return null;
  }

  async openThread(thread: ChatThread): Promise<void> {
    this.selected.set(thread);
    this.messages.set([]);
    this.messagePage.set(0);
    this.sendError.set(null);
    this.composer.reset({ content: '' });
    await this.loadMessages(false);
    await this.markRead(thread);
  }

  async loadEarlier(): Promise<void> {
    this.messagePage.update((page) => page + 1);
    await this.loadMessages(true);
  }

  private async loadMessages(earlier: boolean): Promise<void> {
    const thread = this.selected();
    if (!thread) {
      return;
    }

    this.loadingMessages.set(true);
    this.messagesError.set(null);
    try {
      const page = await firstValueFrom(this.chat.getMessages(thread.id, { page: this.messagePage(), size: PAGE_SIZE }));
      // Newest first from the server; oldest first on screen.
      const chronological = [...page.items].reverse();
      this.messages.update((current) => earlier ? [...chronological, ...current] : chronological);
      this.hasMoreMessages.set(!!page.pagination && !page.pagination.isLast);
      if (!earlier) {
        this.scrollToEnd();
      }
    } catch (error) {
      this.messagesError.set(extractErrorMessage(error));
    } finally {
      this.loadingMessages.set(false);
    }
  }

  private async markRead(thread: ChatThread): Promise<void> {
    const unread = this.threads().find((entry) => entry.id === thread.id)?.unreadCount ?? thread.unreadCount ?? 0;
    try {
      await firstValueFrom(this.chat.markRead(thread.id));
      this.patchThread(thread.id, { unreadCount: 0 });
      if (unread > 0) {
        this.center.threadRead(unread);
      }
    } catch {
      // Reading still works; the badge corrects itself on the next refresh.
    }
  }

  // --- sending ---

  onEnter(event: Event): void {
    const key = event as KeyboardEvent;
    if (!key.shiftKey) {
      key.preventDefault();
      void this.send();
    }
  }

  async send(): Promise<void> {
    const thread = this.selected();
    const content = this.composer.controls.content.value.trim();
    if (!thread || !content) {
      return;
    }

    this.sending.set(true);
    this.sendError.set(null);
    try {
      const message = await firstValueFrom(this.chat.send(thread.id, content));
      this.composer.reset({ content: '' });
      this.appendMessage(message);
      this.patchThread(thread.id, { lastMessagePreview: message.content, lastMessageAt: message.createdAt ?? null });
    } catch (error) {
      this.sendError.set(toApiError(error));
    } finally {
      this.sending.set(false);
    }
  }

  async setPolicy(thread: ChatThread, event: Event): Promise<void> {
    const policy = (event.target as HTMLSelectElement).value as PostingPolicy;
    try {
      const updated = await firstValueFrom(this.chat.setPostingPolicy(thread.id, policy));
      this.selected.set({ ...thread, ...updated });
      this.patchThread(thread.id, { postingPolicy: updated.postingPolicy });
    } catch (error) {
      this.actionError.set(toApiError(error));
    }
  }

  // --- starting ---

  async contactShop(): Promise<void> {
    await this.start(() => firstValueFrom(this.chat.openShopAsCustomer()));
  }

  async openChannel(): Promise<void> {
    const agencyId = this.context.agencyId();
    const buildingId = this.context.buildingId();
    if (agencyId && buildingId) {
      await this.start(() => firstValueFrom(this.chat.openBuildingChannel(agencyId, buildingId)));
    }
  }

  private async start(request: () => Promise<ChatThread>): Promise<void> {
    this.opening.set(true);
    this.actionError.set(null);
    try {
      const thread = await request();
      if (!this.threads().some((entry) => entry.id === thread.id)) {
        this.threads.update((current) => [thread, ...current]);
      }
      this.select(thread);
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.opening.set(false);
    }
  }

  broadcastSent(recipients: number): void {
    this.broadcastOpen.set(false);
    this.notice.set(`Sent to ${recipients} tenant${recipients === 1 ? '' : 's'}.`);
    void this.reload();
  }

  // --- live ---

  private onEvent(threadId: number, message: ThreadMessage | null, unreadCount: number | null): void {
    if (this.selected()?.id === threadId) {
      if (message) {
        this.appendMessage(message);
      }
      void this.markRead(this.selected()!);
    }

    const known = this.threads().some((entry) => entry.id === threadId);
    if (!known) {
      // A thread new to this list (a first message, a broadcast): fetch the list again.
      void this.reload();
      return;
    }

    const open = this.selected()?.id === threadId;
    this.threads.update((current) => {
      const row = current.find((entry) => entry.id === threadId)!;
      const updated: ChatThread = {
        ...row,
        lastMessagePreview: message?.content ?? row.lastMessagePreview,
        lastMessageAt: message?.createdAt ?? row.lastMessageAt,
        unreadCount: open ? 0 : unreadCount ?? (row.unreadCount ?? 0) + 1
      };
      // Most recent first, as the server orders them.
      return [updated, ...current.filter((entry) => entry.id !== threadId)];
    });
  }

  private appendMessage(message: ThreadMessage): void {
    if (this.messages().some((entry) => entry.id === message.id)) {
      return;
    }
    this.messages.update((current) => [...current, message]);
    this.scrollToEnd();
  }

  private patchThread(threadId: number, patch: Partial<ChatThread>): void {
    this.threads.update((current) => current.map((entry) => entry.id === threadId ? { ...entry, ...patch } : entry));
  }

  private scrollToEnd(): void {
    queueMicrotask(() => {
      const element = this.scroller()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
