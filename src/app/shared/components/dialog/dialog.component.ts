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
      z-index: 40;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgba(33, 43, 38, 0.45);
      backdrop-filter: blur(4px);
    }

    .dialog {
      width: 100%;
      max-height: calc(100dvh - 2rem);
      overflow: auto;
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }

    .dialog:focus { outline: none; }

    .dialog__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .dialog__titles { display: grid; gap: 0.2rem; min-width: 0; }
    .dialog__titles h2, .dialog__titles p { margin: 0; }
    .dialog__body { display: grid; gap: 0.9rem; }
    .dialog__actions:empty { display: none; }

    /* A sheet on a phone: full width, anchored to the bottom where the thumb is. */
    @media (max-width: 700px) {
      .dialog-backdrop { place-items: end stretch; padding: 0; }
      .dialog { border-radius: 20px 20px 0 0; max-height: 92dvh; }
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

  ngOnInit(): void {
    this.returnFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    this.document.body.classList.add('body--viewer-open');
    queueMicrotask(() => {
      const panel = this.panel()?.nativeElement;
      // The first field if there is one, else the panel itself.
      (panel?.querySelector<HTMLElement>('input, select, textarea') ?? panel)?.focus();
    });
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('body--viewer-open');
    this.returnFocus?.focus();
  }
}
