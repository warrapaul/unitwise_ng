import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, effect, inject, viewChild } from '@angular/core';
import { FilePreviewComponent } from '../file-preview/file-preview.component';
import { FileViewerService } from './file-viewer.service';

/**
 * The full-screen view behind every preview's "Full screen". Mounted once, in
 * the app root, so no card's overflow or stacking can clip it.
 *
 * Esc closes; the arrow keys step through a list.
 */
@Component({
  selector: 'app-file-viewer',
  standalone: true,
  imports: [FilePreviewComponent],
  host: {
    '(document:keydown)': 'onKey($event)'
  },
  template: `
    @if (viewer.current(); as item) {
      <div class="viewer" role="dialog" aria-modal="true" [attr.aria-label]="item.name">
        <header class="viewer__bar">
          <div class="viewer__title">
            <strong>{{ item.name }}</strong>
            @if (viewer.items().length > 1) {
              <span class="viewer__count">{{ viewer.index() + 1 }} of {{ viewer.items().length }}</span>
            }
          </div>
          @if (!isLocal(item.url)) {
            <a class="btn btn-secondary btn-sm" [href]="item.url" target="_blank" rel="noopener">Open in new tab</a>
          }
          <button #closeButton type="button" class="icon-action" aria-label="Close" title="Close" (click)="viewer.close()">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg>
          </button>
        </header>

        <div class="viewer__stage" (click)="viewer.close()">
          @if (viewer.items().length > 1) {
            <button type="button" class="icon-action viewer__step" aria-label="Previous" title="Previous"
                    (click)="$event.stopPropagation(); viewer.step(-1)">
              <svg class="viewer__back" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
            </button>
          }

          <div class="viewer__file" (click)="$event.stopPropagation()">
            <app-file-preview size="full" [expandable]="false"
                              [url]="item.url" [contentType]="item.contentType ?? null" [label]="item.name" />
          </div>

          @if (viewer.items().length > 1) {
            <button type="button" class="icon-action viewer__step" aria-label="Next" title="Next"
                    (click)="$event.stopPropagation(); viewer.step(1)">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .viewer {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      grid-template-rows: auto 1fr;
      background: rgba(20, 26, 23, 0.88);
      color: #fff;
    }

    .viewer__bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
    }

    .viewer__title {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }

    .viewer__title strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .viewer__count {
      flex: none;
      font-size: 0.85rem;
      opacity: 0.75;
    }

    .viewer__stage {
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 0 1rem 1rem;
    }

    .viewer__file {
      flex: 1;
      min-width: 0;
      height: 100%;
      display: grid;
      place-items: center;
    }

    .viewer__back { transform: rotate(180deg); }

    @media (max-width: 700px) {
      .viewer__stage { padding: 0 0.5rem 0.5rem; gap: 0.25rem; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileViewerComponent {
  readonly viewer = inject(FileViewerService);
  private readonly document = inject(DOCUMENT);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    effect(() => {
      const open = this.viewer.isOpen();
      // The page behind does not scroll while the viewer covers it.
      this.document.body.classList.toggle('body--viewer-open', open);
      if (open) {
        queueMicrotask(() => this.closeButton()?.nativeElement.focus());
      }
    });
  }

  /** A picked file's object URL means nothing in another tab. */
  isLocal(url: string): boolean {
    return url.startsWith('blob:');
  }

  onKey(event: KeyboardEvent): void {
    if (!this.viewer.isOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.viewer.close();
    } else if (event.key === 'ArrowLeft' && this.viewer.items().length > 1) {
      this.viewer.step(-1);
    } else if (event.key === 'ArrowRight' && this.viewer.items().length > 1) {
      this.viewer.step(1);
    }
  }
}
