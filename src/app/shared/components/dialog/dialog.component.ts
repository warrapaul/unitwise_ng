import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, OnDestroy, OnInit, inject, input, output, viewChild } from '@angular/core';

/**
 * A modal for one short task — record a payment, send a reminder. The page
 * owns what is inside and when it opens (`@if`); this owns the frame: backdrop,
 * title, close icon, Esc, focus in and back out, and no page scroll behind it.
 *
 * Footer buttons go in `<div dialog-actions>`, which is a `.button-row`: the
 * primary first in the markup, painted on the right.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="dialog-backdrop" (click)="closed.emit()">
      <section #panel class="dialog panel" role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1"
               [style.max-width]="width()" (click)="$event.stopPropagation()">
        <header class="dialog__head">
          <div class="dialog__titles">
            <h2>{{ title() }}</h2>
            @if (subtitle()) {
              <p class="muted">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" class="icon-action" aria-label="Close" title="Close" (click)="closed.emit()">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg>
          </button>
        </header>
        <div class="dialog__body">
          <ng-content />
        </div>
        <div class="button-row dialog__actions">
          <ng-content select="[dialog-actions]" />
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      /* Above the app bar, the tab bar and the drawer: a sheet is the only thing in play while it is open. */
      z-index: 65;
      display: grid;
      /* One shrinkable column: the panel can never be wider than the screen. */
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      align-items: center;
      padding: var(--space-4);
      overflow-x: hidden;
      background: var(--backdrop);
      backdrop-filter: blur(4px);
    }

    .dialog {
      width: 100%;
      min-width: 0;
      overflow-wrap: anywhere;
      max-height: calc(100dvh - 2rem);
      overflow: auto;
      padding: var(--space-5);
      display: grid;
      gap: var(--space-4);
    }

    .dialog:focus { outline: none; }

    .dialog__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .dialog__titles { display: grid; gap: var(--space-1); min-width: 0; }
    .dialog__titles h2, .dialog__titles p { margin: 0; }
    .dialog__body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
    .dialog__actions:empty { display: none; }
    /* The commit stays on screen however long the form: pinned to the bottom edge of the sheet. */
    .dialog__actions { position: sticky; bottom: calc(-1 * var(--space-5)); z-index: 1; margin: 0 calc(-1 * var(--space-5)) calc(-1 * var(--space-5));
                       padding: var(--space-3) var(--space-5) calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--surface);
                       border-top: 1px solid var(--border); }

    /* A sheet on a phone: full width, anchored to the bottom where the thumb is. */
    @media (max-width: 700px) {
      /* A phone sheet takes the full width, whatever width was asked for on a wide screen. */
      .dialog { max-width: none !important; }
      .dialog-backdrop { align-items: end; justify-items: stretch; padding: 0; }
      .dialog { border-radius: var(--radius-xl) var(--radius-xl) 0 0; max-height: 92dvh; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogComponent implements OnInit, OnDestroy {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly width = input('32rem');
  readonly closed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnFocus: HTMLElement | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** What this sheet made inert, to hand back exactly that on close. */
  private inerted: HTMLElement[] = [];

  ngOnInit(): void {
    this.returnFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    this.document.body.classList.add('body--viewer-open');
    this.makeRestInert();
    queueMicrotask(() => {
      const panel = this.panel()?.nativeElement;
      // The first field if there is one, else the panel itself.
      (panel?.querySelector<HTMLElement>('input, select, textarea') ?? panel)?.focus();
    });
  }

  /**
   * The page behind the sheet cannot be tabbed into or read out: every sibling of the sheet and of
   * each of its ancestors goes inert. The app-wide layers that must stay live (confirm dialog, toasts,
   * the file viewer) are left alone, since they open on top of a sheet.
   */
  private makeRestInert(): void {
    const keepLive = 'app-confirm-dialog, app-file-viewer, .toast-stack, script, style';
    let node: HTMLElement | null = this.host;
    while (node && node !== this.document.body) {
      const parent: HTMLElement | null = node.parentElement;
      for (const sibling of Array.from(parent?.children ?? []) as HTMLElement[]) {
        if (sibling !== node && !sibling.inert && !sibling.matches(keepLive) && !sibling.querySelector('app-confirm-dialog')) {
          sibling.inert = true;
          this.inerted.push(sibling);
        }
      }
      node = parent;
    }
  }

  ngOnDestroy(): void {
    this.inerted.forEach((element) => element.inert = false);
    this.inerted = [];
    this.document.body.classList.remove('body--viewer-open');
    this.returnFocus?.focus();
  }
}
