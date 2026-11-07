import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { DialogComponent } from '../dialog/dialog.component';
import { whatsappLink } from '../../utils/format.util';

/**
 * A phone number that asks what to do with it. A bare `tel:` link hands the number to whatever the
 * device has set up for calls, which on a desktop is often WhatsApp, so nothing opens until chosen.
 */
@Component({
  selector: 'app-phone-menu',
  standalone: true,
  imports: [DialogComponent],
  template: `
    <button type="button" class="number" aria-haspopup="dialog" [attr.aria-label]="'Contact options for ' + phone()" (click)="show($event)">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-phone" /></svg>{{ phone() }}
    </button>
    @if (open()) {
      <!-- The number usually sits in a clickable row, which must not hear what happens in here. -->
      <div (click)="$event.stopPropagation()">
        <app-dialog [title]="phone()" width="20rem" (closed)="open.set(false)">
          <div class="options">
            <a class="btn btn-secondary" [href]="'tel:' + phone()" (click)="open.set(false)">Call</a>
            @if (whatsapp(); as link) {
              <a class="btn btn-secondary" [href]="link" target="_blank" rel="noopener" (click)="open.set(false)">WhatsApp</a>
            }
            <button type="button" class="btn btn-secondary" (click)="copy()">Copy number</button>
          </div>
        </app-dialog>
      </div>
    }
  `,
  styles: [`
    :host { display: inline-block; max-width: 100%; }
    .number { display: inline-flex; align-items: center; gap: var(--space-1-5); padding: 0; border: 0; background: none; cursor: pointer;
              color: var(--primary-strong); font: inherit; font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    .number svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .options { display: grid; gap: var(--space-2); }
    .options .btn { width: 100%; justify-content: center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneMenuComponent {
  readonly phone = input.required<string>();

  private readonly toasts = inject(NotificationService);

  readonly open = signal(false);
  readonly whatsapp = computed(() => whatsappLink(this.phone()));

  show(event: MouseEvent): void {
    event.stopPropagation();
    this.open.set(true);
  }

  async copy(): Promise<void> {
    this.open.set(false);
    try {
      await navigator.clipboard.writeText(this.phone());
      this.toasts.push('success', 'Number copied.');
    } catch {
      this.toasts.push('error', 'Could not copy — select the number instead.');
    }
  }
}
