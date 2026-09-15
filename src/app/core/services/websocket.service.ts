import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { RxStomp } from '@stomp/rx-stomp';
import { EMPTY, Observable, map } from 'rxjs';
import { WS_URL } from '../tokens/ws-url.token';
import { AuthSessionService } from './auth-session.service';

/**
 * STOMP over the backend's plain `/ws` endpoint (no SockJS registration exists
 * server-side). The JWT is passed as a query parameter because the handshake
 * interceptor reads it there — browsers cannot set headers on a WS handshake.
 *
 * One connection per session: connect after login, disconnect on logout.
 */
@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly authSession = inject(AuthSessionService);
  private readonly wsUrl = inject(WS_URL);

  private rxStomp: RxStomp | null = null;
  private readonly connectedState = signal(false);

  readonly connected = computed(() => this.connectedState());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(): void {
    const token = this.authSession.accessToken();
    if (!token || this.rxStomp) {
      return;
    }

    const client = new RxStomp();
    client.configure({
      brokerURL: `${this.wsUrl}?token=${encodeURIComponent(token)}`,
      heartbeatIncoming: 5000,
      heartbeatOutgoing: 5000,
      reconnectDelay: 3000
    });
    client.activate();

    this.rxStomp = client;
    this.connectedState.set(true);
  }

  disconnect(): void {
    void this.rxStomp?.deactivate();
    this.rxStomp = null;
    this.connectedState.set(false);
  }

  /** Reconnects with the current access token — call after a silent refresh. */
  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  watchNotifications<T>(): Observable<T> {
    return this.watch<T>('/user/queue/notifications');
  }

  watchChatMessages<T>(): Observable<T> {
    return this.watch<T>('/user/queue/chat');
  }

  watchSubscriptionManifest<T>(): Observable<T> {
    return this.watch<T>('/user/queue/subscriptions');
  }

  watchAdminChat<T>(): Observable<T> {
    return this.watch<T>('/topic/admin-chat');
  }

  watchBuildingAnnouncements<T>(buildingId: number): Observable<T> {
    return this.watch<T>(`/topic/building/${buildingId}`);
  }

  sendChatMessage(body: unknown): void {
    this.publish('/app/chat.send', body);
  }

  sendTypingStart(conversationId: number): void {
    this.publish('/app/chat.typing.start', { conversationId });
  }

  sendTypingStop(conversationId: number): void {
    this.publish('/app/chat.typing.stop', { conversationId });
  }

  sendReadReceipt(conversationId: number): void {
    this.publish('/app/chat.read', { conversationId });
  }

  /** Asks the server which topics this user should subscribe to. */
  requestSubscriptionManifest(): void {
    this.publish('/app/chat.init', {});
  }

  private watch<T>(destination: string): Observable<T> {
    return this.rxStomp?.watch(destination).pipe(map((message) => JSON.parse(message.body) as T)) ?? EMPTY;
  }

  private publish(destination: string, body: unknown): void {
    this.rxStomp?.publish({ destination, body: JSON.stringify(body) });
  }
}
