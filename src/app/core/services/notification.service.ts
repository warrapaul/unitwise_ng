import { Injectable, signal } from '@angular/core';

export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messages = signal<NotificationMessage[]>([]);

  readonly items = this.messages.asReadonly();

  push(type: NotificationMessage['type'], message: string): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.messages.update((current) => [...current, { id, type, message }]);
    window.setTimeout(() => this.dismiss(id), 4500);
  }

  dismiss(id: string): void {
    this.messages.update((current) => current.filter((item) => item.id !== id));
  }

  clear(): void {
    this.messages.set([]);
  }
}
