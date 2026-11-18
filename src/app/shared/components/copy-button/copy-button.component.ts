import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';

/**
 * "Copy" beside a number someone has to type elsewhere: a paybill, an account, a reference.
 * Says what was copied, so the toast confirms the right thing landed on the clipboard.
 */
@Component({
  selector: 'app-copy-button',
  standalone: true,
  template: `<button type="button" class="btn btn-secondary btn-sm" [attr.aria-label]="label()" (click)="copy()">Copy</button>`,
  styles: [`:host { display: inline-flex; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CopyButtonComponent {
  readonly value = input.required<string>();
  /** Read out and shown in the toast: "Copy account number". */
  readonly label = input('Copy');

  private readonly toasts = inject(NotificationService);

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.value());
      this.toasts.push('success', `${this.label().replace(/^Copy /, '').replace(/^./, (c) => c.toUpperCase())} copied.`);
    } catch {
      this.toasts.push('error', 'Could not copy — select it instead.');
    }
  }
}
