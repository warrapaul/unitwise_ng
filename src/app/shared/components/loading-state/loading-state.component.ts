import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The wait before content arrives.
 *
 * Centred in the space the content will occupy, rather than as a bar pinned to
 * the top-left: a wait that sits where the eye already is reads as the page
 * working, while a strip above an empty page reads as the page having finished
 * and being empty. The reserved height also keeps the arriving content from
 * jumping up the screen.
 *
 * `compact` is for a wait inside a card or a section that is already small —
 * there, a full-height block would push everything below it down.
 */
@Component({
  selector: 'app-loading-state',
  standalone: true,
  template: `
    <section class="loading-state" [class.loading-state--compact]="compact()" role="status" aria-live="polite">
      <span class="loading-state__spinner" aria-hidden="true"></span>
      <p>{{ label() }}</p>
    </section>
  `,
  styles: [`
    /*
     * A block the width of its container. As an inline host it shrank to its
     * content wherever the parent was a flex row, and the spinner sat off to
     * one side instead of in the middle of the space the content will fill.
     */
    :host {
      display: block;
      width: 100%;
    }

    .loading-state {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0.9rem;
      /* Roughly the middle of the screen at page level, whatever its height. */
      min-height: clamp(16rem, 50vh, 28rem);
      padding: 2rem 1.2rem;
      color: var(--text-muted);
    }

    .loading-state--compact {
      min-height: 0;
      padding: 1.25rem;
      gap: 0.6rem;
    }

    /*
     * Two arcs at different speeds rather than one ring: a single rotating
     * border reads as a static circle at a glance, and the point of a spinner is
     * to be obviously moving.
     */
    .loading-state__spinner {
      position: relative;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 999px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      animation: loading-spin 0.85s linear infinite;
    }

    .loading-state--compact .loading-state__spinner {
      width: 1.5rem;
      height: 1.5rem;
      border-width: 2px;
    }

    .loading-state__spinner::after {
      content: "";
      position: absolute;
      inset: 0.28rem;
      border-radius: 999px;
      border: 2px solid transparent;
      border-bottom-color: var(--primary-soft, var(--border-strong));
      animation: loading-spin 1.4s linear infinite reverse;
    }

    .loading-state--compact .loading-state__spinner::after {
      display: none;
    }

    p {
      margin: 0;
      font-size: 0.92rem;
    }

    @keyframes loading-spin {
      to { transform: rotate(360deg); }
    }

    /*
     * Motion is the only channel here, so it cannot simply be removed — it
     * slows to a pulse instead, which conveys "working" without spinning.
     */
    @media (prefers-reduced-motion: reduce) {
      .loading-state__spinner {
        animation: loading-pulse 1.6s ease-in-out infinite;
        border-color: var(--border);
        border-top-color: var(--primary);
      }

      .loading-state__spinner::after {
        animation: none;
      }
    }

    @keyframes loading-pulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 1; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingStateComponent {
  readonly label = input('Loading...');

  /** For a wait inside a card or a small section, where a tall block would shove content down. */
  readonly compact = input(false);
}
