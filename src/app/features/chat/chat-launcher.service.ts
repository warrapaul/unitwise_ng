import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { RoutePaths } from '../../core/routes/route-paths';
import { extractErrorMessage } from '../../shared/utils/error-message.util';
import { ChatThread } from './models/chat.models';

/**
 * "Message" buttons on a tenant, a tenancy or an order: open (or reuse) the
 * thread and go to it. The thread rides in the navigation state, so the chat
 * page shows it without looking it up.
 */
@Injectable({ providedIn: 'root' })
export class ChatLauncherService {
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);

  readonly opening = signal(false);

  async open(request: Observable<ChatThread>): Promise<void> {
    this.opening.set(true);
    try {
      const thread = await firstValueFrom(request);
      await this.router.navigate([RoutePaths.chatConversation(thread.id)], { state: { thread } });
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.opening.set(false);
    }
  }
}
