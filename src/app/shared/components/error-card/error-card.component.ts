import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * What went wrong with a save, inline on the form (never also as a toast). It scrolls itself into
 * view, since the button that failed is usually far below it, and a server message about one field
 * ("phoneNumber: must be valid") is also pinned to that field, marked invalid with the message under it.
 */
@Component({
  selector: 'app-error-card',
  standalone: true,
  template: `
    <section class="alert alert-error" role="alert" tabindex="-1">
      <strong><span class="icon" aria-hidden="true">⚠</span> {{ title() }}</strong>
      <p>{{ message() }}</p>
      @if (details().length > 0) {
        <ul>
          @for (detail of details(); track detail) {
            <li>{{ readable(detail) }}</li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    p {
      margin: var(--space-1-5) 0 0;
    }

    .icon { margin-inline-end: var(--space-1); }
    /* Scrolled to, it lands clear of the app bar above and the pinned action bar / tab bar below. */
    .alert { scroll-margin: 5rem 0 9rem; }

    ul {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-4);
      display: grid;
      gap: var(--space-1);
      font-size: var(--text-md);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorCardComponent {
  readonly title = input('Unable to save');
  readonly message = input('Please review the form and try again.');
  readonly details = input<string[]>([]);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // The banner gone (fixed, or saved), its notes on the fields go with it.
    const form = () => this.host.closest('form') ?? this.host.parentElement;
    inject(DestroyRef).onDestroy(() => this.clear(form()));
    afterRenderEffect(() => {
      const details = this.details();
      this.message();
      const card = this.host.querySelector<HTMLElement>('.alert');
      const rect = card?.getBoundingClientRect();
      // Not just "on screen": clear of the app bar and of the pinned action and tab bars at the bottom.
      if (card && rect && (rect.top < 80 || rect.bottom > window.innerHeight - 150)) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      this.pinToFields(details);
    });
  }

  /** "monthlyRent: must be at least 0" reads "Monthly rent: must be at least 0". */
  readable(detail: string): string {
    const match = /^([a-zA-Z][\w.]*):\s*(.+)$/.exec(detail);
    if (!match) {
      return detail;
    }
    const name = (match[1].split('.').pop() ?? match[1]).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${match[2]}`;
  }

  private clear(form: Element | null | undefined): void {
    form?.querySelectorAll('.server-error').forEach((node) => node.remove());
    form?.querySelectorAll('[data-server-invalid]').forEach((node) => {
      node.removeAttribute('data-server-invalid');
      node.removeAttribute('aria-invalid');
    });
  }

  private pinToFields(details: string[]): void {
    const form = this.host.closest('form') ?? this.host.parentElement;
    this.clear(form);
    for (const detail of details) {
      const match = /^([a-zA-Z][\w.]*):\s*(.+)$/.exec(detail);
      const name = match?.[1].split('.').pop();
      const control = name ? form?.querySelector<HTMLElement>(`[formcontrolname="${name}"]`) : null;
      if (!match || !control) {
        continue;
      }
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('data-server-invalid', '');
      const note = document.createElement('small');
      note.className = 'error-text server-error';
      note.textContent = match[2];
      (control.closest('label.field') ?? control.parentElement)?.append(note);
    }
  }
}
