import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

/**
 * The user's own id, made easy to hand to somebody else.
 *
 * A uid only does its job once it reaches a landlord, and the way people
 * actually pass one is WhatsApp or a text — not by reading nine characters
 * down a phone line and hoping. So the code is shown large and unambiguous,
 * and the sharing is one tap.
 *
 * On a phone the OS share sheet handles this properly, so `navigator.share`
 * is preferred: it offers whatever the person actually uses. Desktop browsers
 * mostly lack it, and there the explicit WhatsApp and SMS links are the
 * fallback rather than the main route.
 *
 * Read-only by design. This displays and shares an identifier; it is never
 * a credential, and nothing here should imply it grants access to anything.
 */
@Component({
  selector: 'app-uid-share',
  standalone: true,
  template: `
    @if (uid(); as code) {
      @if (variant() === 'inline') {
        <!--
          Beside a title: the code, and one tap each to copy or send it. The
          label moves to aria/title because the heading next to it already
          says whose code this is.
        -->
        <span class="uid-inline" [attr.aria-label]="label() + ' ' + code">
          <span class="uid-inline__code mono" [title]="label()">{{ code }}</span>
          <button type="button" class="uid-inline__icon" (click)="copy(code)"
                  [attr.aria-label]="copied() ? 'Copied' : 'Copy ' + label()" [title]="copied() ? 'Copied' : 'Copy'">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use [attr.href]="copied() ? '#act-check' : '#act-copy'" /></svg>
          </button>
          @if (canShare()) {
            <button type="button" class="uid-inline__icon" (click)="share(code)"
                    [attr.aria-label]="'Share ' + label()" title="Share">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-share" /></svg>
            </button>
          } @else {
            <a class="uid-inline__icon" [href]="whatsappUrl(code)" target="_blank" rel="noopener"
               [attr.aria-label]="'Send ' + label() + ' on WhatsApp'" title="Send on WhatsApp">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-share" /></svg>
            </a>
          }
        </span>
      } @else {
      <div class="uid" [class.uid--compact]="variant() === 'compact'">
        <div class="uid__head">
          <p class="uid__label">{{ label() }}</p>
          <p class="uid__code mono">{{ code }}</p>
          @if (hint()) {
            <p class="muted uid__hint">{{ hint() }}</p>
          }
        </div>

        <div class="uid__actions">
          <button type="button" class="btn btn-secondary btn-sm" (click)="copy(code)">
            {{ copied() ? 'Copied' : 'Copy' }}
          </button>

          @if (canShare()) {
            <button type="button" class="btn btn-primary btn-sm" (click)="share(code)">Share</button>
          } @else {
            <!-- No share sheet here, so name the two channels people use. -->
            <a
              class="btn btn-secondary btn-sm"
              [href]="whatsappUrl(code)"
              target="_blank"
              rel="noopener"
            >WhatsApp</a>
            @if (variant() !== 'compact') {
              <a class="btn btn-secondary btn-sm" [href]="smsUrl(code)">SMS</a>
            }
          }
        </div>
      </div>
      }
    }
  `,
  styles: [`
    /*
     * Sized to its content rather than the column. Stretched full width the
     * code sat at one end and the buttons at the other, which read as a
     * page-level banner rather than one value you can pick up and send.
     */
    .uid {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
      width: fit-content;
      max-width: 100%;
      padding: 0.9rem 1rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-lg);
      background: var(--primary-tint);
    }

    .uid__head { display: grid; gap: 0.15rem; min-width: 0; }
    .uid__label { margin: 0; font-size: 0.78rem; color: var(--primary); font-weight: 600; }

    /*
     * Spaced out and oversized because it gets read aloud and typed by hand
     * at least as often as it gets shared — and a mistyped character means a
     * landlord confirming the wrong person.
     */
    .uid__code {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      overflow-wrap: anywhere;
    }

    .uid__hint { margin: 0; font-size: 0.78rem; }

    .uid__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

    /* The same card at a size that sits among other content instead of leading it. */
    .uid--compact { gap: 1rem; padding: 0.55rem 0.8rem; }
    .uid--compact .uid__code { font-size: 1.1rem; }

    .uid-inline {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.1rem 0.2rem 0.1rem 0.55rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-sm);
      background: var(--primary-tint);
      vertical-align: middle;
    }

    .uid-inline__code {
      color: var(--primary);
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    .uid-inline__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--primary);
      cursor: pointer;
    }

    .uid-inline__icon:hover { background: var(--surface); }

    .uid-inline__icon svg {
      width: 0.95rem;
      height: 0.95rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    @media (max-width: 560px) {
      .uid { width: 100%; align-items: stretch; }
      .uid__actions { width: 100%; }
      .uid__actions > * { flex: 1; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UidShareComponent {
  readonly uid = input<string | null>(null);
  readonly label = input('Your Unitwise ID');
  readonly hint = input<string | null>('Give this to a landlord so they can add you as a tenant.');
  /** Who the message says it is from, when the profile knows. */
  readonly name = input<string | null>(null);
  /** What the code is called in the message — a person's ID, an agency's code. */
  readonly codeName = input('Unitwise ID');
  /** card: leads a page. compact: sits among other content. inline: a chip beside a title. */
  readonly variant = input<'card' | 'compact' | 'inline'>('card');

  private readonly sanitizer = inject(DomSanitizer);

  readonly copied = signal(false);

  readonly canShare = computed(() => typeof navigator !== 'undefined' && !!navigator.share);

  /** What lands in the other person's chat. */
  private message(code: string): string {
    const who = this.name()?.trim();
    return who
      ? `${who} — ${this.codeName()} ${code}.`
      : `My ${this.codeName()} is ${code}.`;
  }

  whatsappUrl(code: string): string {
    return `https://wa.me/?text=${encodeURIComponent(this.message(code))}`;
  }

  /**
   * `sms:?body=` is the widely supported form. Angular strips unknown schemes
   * from an href unless they are trusted, so this one is declared safe — the
   * body is encoded and the URL is built here, never from user input.
   */
  smsUrl(code: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustUrl(`sms:?body=${encodeURIComponent(this.message(code))}`);
  }

  async share(code: string): Promise<void> {
    try {
      await navigator.share({ title: this.codeName(), text: this.message(code) });
    } catch {
      // Includes the person simply dismissing the sheet, which is not a
      // failure worth reporting — fall back to putting it on the clipboard.
      await this.copy(code);
    }
  }

  async copy(code: string): Promise<void> {
    const ok = await this.writeToClipboard(this.message(code));
    if (!ok) {
      return;
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  /**
   * `navigator.clipboard` needs a secure context, which rules it out on a
   * plain-HTTP LAN build, so the old `execCommand` path stays as a fallback.
   */
  private async writeToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through
    }

    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
