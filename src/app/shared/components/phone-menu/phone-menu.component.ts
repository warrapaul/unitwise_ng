import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { whatsappLink } from '../../utils/format.util';

/** The one open menu: opening another closes it, since a row's click never reaches the document. */
let openMenu: PhoneMenuComponent | null = null;

const MENU_WIDTH = 190;
const MENU_HEIGHT = 150;

/**
 * A phone number that offers what can be done with it: call, WhatsApp, copy.
 *
 * The menu is fixed to the viewport, because lists sit inside a scrolling box
 * that would clip anything positioned within it.
 */
@Component({
  selector: 'app-phone-menu',
  standalone: true,
  template: `
    <button type="button" class="number" aria-haspopup="menu" [attr.aria-expanded]="open()"
            [attr.aria-label]="'Contact options for ' + phone()" (click)="toggle($event)">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-phone" /></svg>{{ phone() }}
    </button>
    @if (open()) {
      <div class="menu" role="menu" [style.top.px]="top()" [style.left.px]="left()" (click)="$event.stopPropagation()">
        <a role="menuitem" [href]="'tel:' + phone()" (click)="close()">Call</a>
        @if (whatsapp(); as link) {
          <a role="menuitem" [href]="link" target="_blank" rel="noopener" (click)="close()">WhatsApp</a>
        }
        <button type="button" role="menuitem" (click)="copy()">Copy number</button>
      </div>
    }
  `,
  styles: [`
    :host { display: inline-block; max-width: 100%; }
    .number { display: inline-flex; align-items: center; gap: var(--space-1-5); padding: 0; border: 0; background: none; cursor: pointer;
              color: var(--primary-strong); font: inherit; font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    .number svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .menu { position: fixed; z-index: 70; display: grid; width: 190px; padding: var(--space-1); border: 1px solid var(--border);
            border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow-md); }
    .menu a, .menu button { display: flex; align-items: center; min-height: var(--control-sm); padding: var(--space-1) var(--space-2-5); border: 0;
                            border-radius: var(--radius-sm); background: none; color: var(--text); font: inherit; text-align: left;
                            text-decoration: none; cursor: pointer; }
    .menu a:hover, .menu button:hover, .menu a:focus-visible, .menu button:focus-visible { background: var(--surface-2); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneMenuComponent {
  readonly phone = input.required<string>();

  private readonly toasts = inject(NotificationService);

  readonly open = signal(false);
  readonly top = signal(0);
  readonly left = signal(0);
  readonly whatsapp = computed(() => whatsappLink(this.phone()));

  toggle(event: MouseEvent): void {
    // The row around a number is usually a link of its own.
    event.stopPropagation();
    if (this.open()) {
      this.close();
      return;
    }
    openMenu?.close();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.left.set(Math.max(8, Math.min(box.left, window.innerWidth - MENU_WIDTH - 8)));
    this.top.set(box.bottom + MENU_HEIGHT + 8 > window.innerHeight ? Math.max(8, box.top - MENU_HEIGHT - 4) : box.bottom + 4);
    this.open.set(true);
    openMenu = this;
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:scroll')
  close(): void {
    this.open.set(false);
    if (openMenu === this) {
      openMenu = null;
    }
  }

  async copy(): Promise<void> {
    this.close();
    try {
      await navigator.clipboard.writeText(this.phone());
      this.toasts.push('success', 'Number copied.');
    } catch {
      this.toasts.push('error', 'Could not copy — select the number instead.');
    }
  }
}
