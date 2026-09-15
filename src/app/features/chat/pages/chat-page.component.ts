import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ChatService } from '../chat.service';
import { ChatMessage, Conversation } from '../models/chat.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

type ConversationScope = 'mine' | 'open' | 'claimed';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="chat-layout">
      <app-section-card title="Conversations">
        <ng-container actions>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="starting()" (click)="startConversation()">
            {{ starting() ? 'Starting...' : 'New' }}
          </button>
        </ng-container>

        <div class="scope-tabs">
          <button type="button" class="btn btn-secondary btn-sm" [class.active]="scope() === 'mine'" (click)="setScope('mine')">
            Mine
          </button>
          <app-permission-gate [permissions]="[Permissions.CHAT_ADMIN_READ]">
            <button type="button" class="btn btn-secondary btn-sm" [class.active]="scope() === 'open'" (click)="setScope('open')">
              Unclaimed
            </button>
            <button type="button" class="btn btn-secondary btn-sm" [class.active]="scope() === 'claimed'" (click)="setScope('claimed')">
              Claimed by me
            </button>
          </app-permission-gate>
        </div>

        @if (loadingConversations()) {
          <app-loading-state label="Loading conversations..." />
        } @else if (conversationsError()) {
          <app-error-state [message]="conversationsError()!" (retry)="loadConversations()" />
        } @else if (conversations().length === 0) {
          <app-empty-state title="No conversations yet" description="Messages will appear here once someone reaches out." />
        } @else {
          <ul class="conversation-list">
            @for (conversation of conversations(); track conversation.id) {
              <li>
                <button
                  type="button"
                  class="conversation"
                  [class.conversation--active]="selected()?.id === conversation.id"
                  (click)="select(conversation)"
                >
                  <span class="conversation__name">{{ conversation.userName || ('Conversation #' + conversation.id) }}</span>
                  <span class="muted">{{ formatDateTime(conversation.lastMessageAt) }}</span>
                  <span class="conversation__meta">
                    <app-status-chip [status]="conversation.status" />
                    @if ((conversation.unreadCount ?? 0) > 0) {
                      <span class="status-chip status-chip--warning">{{ conversation.unreadCount }}</span>
                    }
                  </span>
                </button>
              </li>
            }
          </ul>
        }
      </app-section-card>

      <app-section-card
        [title]="selected() ? (selected()!.userName || ('Conversation #' + selected()!.id)) : 'Select a conversation'"
        [subtitle]="selected()?.assignedAdminName || null"
      >
        <ng-container actions>
          @if (selected(); as conversation) {
            <app-permission-gate [permissions]="[Permissions.CHAT_ADMIN_WRITE]">
              <div class="button-row">
                @if (!conversation.assignedAdminId) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="claim(conversation)">Claim</button>
                } @else {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="unclaim(conversation)">Unclaim</button>
                }
                @if (conversation.status !== 'CLOSED') {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="close(conversation)">Close</button>
                }
              </div>
            </app-permission-gate>
          }
        </ng-container>

        @if (selected(); as conversation) {
          @if (loadingMessages()) {
            <app-loading-state label="Loading messages..." />
          } @else if (messagesError()) {
            <app-error-state [message]="messagesError()!" (retry)="loadMessages()" />
          } @else {
            <div class="thread">
              @for (message of messages(); track message.id) {
                <article class="bubble" [class.bubble--admin]="message.senderRole === 'ADMIN'">
                  <p>{{ message.content }}</p>
                  @if (message.attachmentUrl) {
                    <a class="bubble__attachment" [href]="message.attachmentUrl" target="_blank" rel="noopener">Attachment</a>
                  }
                  <span class="muted">{{ formatDateTime(message.createdAt) }}</span>
                </article>
              } @empty {
                <p class="muted">No messages in this conversation yet.</p>
              }
            </div>

            <form [formGroup]="messageForm" appFormFeedback (ngSubmit)="send()">
              <label class="field field--wide">
                <span>Message</span>
                <textarea formControlName="content" rows="2"></textarea>
                @if (messageForm.controls.content.invalid && messageForm.controls.content.touched) {
                  <small class="error-text">Type a message before sending.</small>
                }
              </label>

              <label class="field">
                <span>Attachment</span>
                <input type="file" (change)="onFileSelected($event)">
              </label>

              @if (sendError(); as apiError) {
                <app-error-card title="Unable to send message" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="sending()">
                  {{ sending() ? 'Sending...' : 'Send' }}
                </button>
              </div>
            </form>
          }
        } @else {
          <app-empty-state title="No conversation selected" description="Pick a conversation from the list." />
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .chat-layout {
      display: grid;
      grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
      gap: 1rem;
      align-items: start;
    }

    .scope-tabs {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .scope-tabs .active {
      border-color: var(--primary);
      color: var(--primary-strong);
    }

    .conversation-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.4rem;
      max-height: 60vh;
      overflow-y: auto;
    }

    .conversation {
      width: 100%;
      display: grid;
      gap: 0.2rem;
      text-align: left;
      padding: 0.65rem 0.75rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--surface);
      cursor: pointer;
    }

    .conversation--active {
      border-color: var(--primary);
      background: var(--surface-2);
    }

    .conversation__name {
      font-weight: 600;
      font-size: 0.92rem;
    }

    .conversation__meta {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .thread {
      display: grid;
      gap: 0.6rem;
      max-height: 50vh;
      overflow-y: auto;
      padding-right: 0.25rem;
    }

    .bubble {
      display: grid;
      gap: 0.2rem;
      padding: 0.6rem 0.8rem;
      border-radius: var(--radius-md);
      background: var(--surface-2);
      justify-self: start;
      max-width: 80%;
    }

    .bubble--admin {
      justify-self: end;
      background: var(--primary-ring);
    }

    .bubble p {
      margin: 0;
      white-space: pre-wrap;
    }

    .bubble span {
      font-size: 0.75rem;
    }

    form {
      display: grid;
      gap: 0.75rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    @media (max-width: 900px) {
      .chat-layout {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly chatService = inject(ChatService);

  readonly scope = signal<ConversationScope>('mine');
  readonly loadingConversations = signal(false);
  readonly conversationsError = signal<string | null>(null);
  readonly conversations = signal<Conversation[]>([]);
  readonly selected = signal<Conversation | null>(null);

  readonly loadingMessages = signal(false);
  readonly messagesError = signal<string | null>(null);
  readonly messages = signal<ChatMessage[]>([]);

  readonly starting = signal(false);
  readonly busy = signal(false);
  readonly sending = signal(false);
  readonly sendError = signal<ApiError | null>(null);
  readonly selectedFile = signal<File | null>(null);

  readonly messageForm = this.formBuilder.group({
    content: ['', [Validators.required, Validators.maxLength(4000)]]
  });

  ngOnInit(): void {
    void this.loadConversations();
  }

  async setScope(scope: ConversationScope): Promise<void> {
    this.scope.set(scope);
    this.selected.set(null);
    this.messages.set([]);
    await this.loadConversations();
  }

  async loadConversations(): Promise<void> {
    this.loadingConversations.set(true);
    this.conversationsError.set(null);

    try {
      const params = { page: 0, size: 50 };
      const result = this.scope() === 'open'
        ? await firstValueFrom(this.chatService.getOpenConversations(params))
        : this.scope() === 'claimed'
          ? await firstValueFrom(this.chatService.getClaimedConversations(params))
          : await firstValueFrom(this.chatService.getMyConversations(params));

      this.conversations.set(result.items);
    } catch (error) {
      this.conversationsError.set(extractErrorMessage(error));
    } finally {
      this.loadingConversations.set(false);
    }
  }

  async select(conversation: Conversation): Promise<void> {
    this.selected.set(conversation);
    await this.loadMessages();
  }

  async loadMessages(): Promise<void> {
    const conversation = this.selected();
    if (!conversation) {
      return;
    }

    this.loadingMessages.set(true);
    this.messagesError.set(null);

    try {
      const result = await firstValueFrom(this.chatService.getMessages(conversation.id, { page: 0, size: 100 }));
      // The API returns newest-first; render oldest-first so the thread reads naturally.
      this.messages.set([...result.items].reverse());
    } catch (error) {
      this.messagesError.set(extractErrorMessage(error));
    } finally {
      this.loadingMessages.set(false);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  async startConversation(): Promise<void> {
    this.starting.set(true);
    this.conversationsError.set(null);

    try {
      const conversation = await firstValueFrom(this.chatService.startConversation());
      this.conversations.update((items) => [conversation, ...items]);
      await this.select(conversation);
    } catch (error) {
      this.conversationsError.set(extractErrorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }

  async send(): Promise<void> {
    const conversation = this.selected();
    if (!conversation) {
      return;
    }

    if (this.messageForm.invalid) {
      this.messageForm.markAllAsTouched();
      return;
    }

    this.sending.set(true);
    this.sendError.set(null);

    const request = { conversationId: conversation.id, content: this.messageForm.getRawValue().content };
    const file = this.selectedFile();

    try {
      const message = file
        ? await firstValueFrom(this.chatService.sendMessageWithAttachment(conversation.id, request, file))
        : await firstValueFrom(this.chatService.sendTextMessage(conversation.id, request));

      this.messages.update((items) => [...items, message]);
      this.messageForm.reset({ content: '' });
      this.selectedFile.set(null);
    } catch (error) {
      this.sendError.set(toApiError(error));
    } finally {
      this.sending.set(false);
    }
  }

  async claim(conversation: Conversation): Promise<void> {
    await this.runConversationAction(() => firstValueFrom(this.chatService.claimConversation(conversation.id)));
  }

  async unclaim(conversation: Conversation): Promise<void> {
    await this.runConversationAction(() => firstValueFrom(this.chatService.unclaimConversation(conversation.id)));
  }

  async close(conversation: Conversation): Promise<void> {
    if (!await this.confirm.ask({ title: 'Close this conversation?' })) {
      return;
    }

    await this.runConversationAction(() => firstValueFrom(this.chatService.closeConversation(conversation.id)));
  }


  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  private async runConversationAction(action: () => Promise<Conversation>): Promise<void> {
    this.busy.set(true);
    this.conversationsError.set(null);

    try {
      const updated = await action();
      this.selected.set(updated);
      this.conversations.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      this.conversationsError.set(extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
