import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { DOCUMENT } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FileViewerService } from '../file-viewer/file-viewer.service';

type PreviewKind = 'image' | 'pdf' | 'none';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];

/**
 * Shows a file where the browser can render it, and describes it where it
 * cannot — for a file already stored (`url`) or one the user has just picked
 * and not yet submitted (`file`).
 *
 * A tenant document is an ID photo far more often than anything else, and
 * "Open file" made every one of them a new tab and a round trip to answer "is
 * this the right document". Images and PDFs render inline; a .doc or .xlsx
 * cannot, so those get an honest download link rather than a broken frame.
 *
 * The kind is read from the content type when there is one — a `File` always
 * carries one — and from the extension otherwise; a signed URL usually keeps
 * its extension ahead of the query string.
 */
@Component({
  selector: 'app-file-preview',
  standalone: true,
  host: {
    '[attr.data-size]': 'size()'
  },
  template: `
    @if (source(); as src) {
      @if (size() === 'thumb') {
        <!-- A tile, not a document: no frame, no caption. The list around it handles the click. -->
        @if (kind() === 'image' && !failed()) {
          <img class="thumb" [src]="src" [alt]="caption()" loading="lazy" (error)="failed.set(true)">
        } @else {
          <span class="thumb thumb--type" [attr.aria-label]="caption()">{{ extension() }}</span>
        }
      } @else {
        <figure class="preview">
          @switch (kind()) {
            @case ('image') {
              @if (failed()) {
                <p class="muted">This image could not be loaded.</p>
              } @else if (expandable()) {
                <button type="button" class="preview__zoom" (click)="openFull()" [attr.aria-label]="'Full screen: ' + caption()">
                  <img [src]="src" [alt]="caption()" loading="lazy" (error)="failed.set(true)">
                </button>
              } @else {
                <img [src]="src" [alt]="caption()" loading="lazy" (error)="failed.set(true)">
              }
            }
            @case ('pdf') {
              @if (safeUrl(); as trusted) {
                <iframe [src]="trusted" [title]="caption()" loading="lazy"></iframe>
              } @else {
                <p class="muted">This file cannot be previewed here.</p>
              }
            }
            @default {
              <p class="muted">{{ typeLabel() }} cannot be previewed here.</p>
            }
          }

          @if (size() === 'inline') {
            <figcaption>
              @if (file(); as picked) {
                <span class="muted">{{ picked.name }} · {{ sizeLabel() }}</span>
              }
              @if (kind() === 'none') {
                @if (!file()) {
                  <a class="btn btn-secondary btn-sm" [href]="src" target="_blank" rel="noopener">Download</a>
                }
              } @else if (expandable() && !failed()) {
                <button type="button" class="btn btn-secondary btn-sm" (click)="openFull()">Full screen</button>
              }
            </figcaption>
          }
        </figure>
      }
    } @else {
      <p class="muted">{{ emptyLabel() }}</p>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    .preview {
      margin: 0;
      display: grid;
      gap: 0.5rem;
      justify-items: start;
    }

    figcaption {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
    }

    img {
      display: block;
      max-width: min(100%, 26rem);
      max-height: 22rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      object-fit: contain;
      background: var(--surface-2);
    }

    iframe {
      width: min(100%, 46rem);
      height: 28rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface-2);
    }

    .preview__zoom {
      padding: 0;
      border: 0;
      background: none;
      cursor: zoom-in;
      max-width: 100%;
    }

    /* Full screen: as large as the viewer allows, the whole file visible. */
    :host([data-size='full']) { width: 100%; height: 100%; }
    :host([data-size='full']) .preview { height: 100%; justify-items: center; align-content: center; }
    :host([data-size='full']) img {
      max-width: 100%;
      max-height: calc(100dvh - 6rem);
      border: 0;
      background: transparent;
    }
    :host([data-size='full']) iframe {
      width: min(100%, 64rem);
      height: calc(100dvh - 6rem);
      border: 0;
      background: #fff;
    }
    :host([data-size='full']) .muted { color: #fff; }

    /* Thumb: a square that fills its track, cropped rather than letterboxed. */
    :host([data-size='thumb']) { width: 100%; }
    .thumb {
      width: 100%;
      max-width: none;
      max-height: none;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface-2);
    }
    .thumb--type {
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilePreviewComponent {
  /** A file already stored server-side. */
  readonly url = input<string | null>(null);
  /** A file the user has just chosen and not yet uploaded. Wins over `url`. */
  readonly file = input<File | null>(null);
  /** From the API when it has one — more reliable than the extension. */
  readonly contentType = input<string | null>(null);
  readonly label = input('Attached file');
  readonly emptyLabel = input('No file attached.');
  /** `inline` in a page, `thumb` as a square tile in a list, `full` inside the viewer. */
  readonly size = input<'inline' | 'thumb' | 'full'>('inline');
  /** Offers "Full screen" — off inside the viewer itself. */
  readonly expandable = input(true);

  private readonly viewer = inject(FileViewerService);

  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly failed = signal(false);

  /**
   * An object URL holds its blob alive until it is revoked, so each new pick
   * releases the one before it and the last goes when the component does.
   */
  private readonly objectUrl = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const file = this.file();
      const created = file ? URL.createObjectURL(file) : null;
      this.objectUrl.set(created);
      this.failed.set(false);

      onCleanup(() => {
        if (created) {
          URL.revokeObjectURL(created);
        }
      });
    });

    inject(DestroyRef).onDestroy(() => {
      const url = this.objectUrl();
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
  }

  readonly source = computed(() => this.objectUrl() ?? this.url());

  readonly caption = computed(() => this.file()?.name ?? this.label());

  /** The tile text for a file that has no picture: "PDF", "DOCX". */
  readonly extension = computed(() => {
    if (this.kind() === 'pdf') {
      return 'PDF';
    }
    const name = this.file()?.name ?? (this.url() ?? '').split('?')[0].split('#')[0];
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot + 1) : '';
    return ext && ext.length <= 5 ? ext : 'File';
  });

  openFull(): void {
    const url = this.source();
    if (url) {
      this.viewer.open([{ name: this.caption(), url, contentType: this.file()?.type ?? this.contentType() }]);
    }
  }

  private readonly type = computed(() => (this.file()?.type ?? this.contentType() ?? '').toLowerCase());

  readonly kind = computed<PreviewKind>(() => {
    const type = this.type();
    if (type.startsWith('image/')) {
      return 'image';
    }

    if (type === 'application/pdf') {
      return 'pdf';
    }

    // A blob URL carries no extension, so fall back to the file's own name.
    const name = this.file()?.name ?? (this.url() ?? '').split('?')[0].split('#')[0];
    const path = name.toLowerCase();
    const ext = path.slice(path.lastIndexOf('.') + 1);
    if (IMAGE_EXT.includes(ext)) {
      return 'image';
    }

    return ext === 'pdf' ? 'pdf' : 'none';
  });

  /**
   * An iframe `src` must be an explicitly trusted resource URL, and trusting
   * one turns off Angular's protection — so only ever for a plain http(s) URL
   * or an object URL this component minted itself. Anything else (a
   * `javascript:` or `data:` URL, however it got into the record) returns null
   * and falls through to the download link.
   */
  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const local = this.objectUrl();
    if (local) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(local);
    }

    const url = this.url();
    if (!url) {
      return null;
    }

    try {
      const parsed = new URL(url, this.document.baseURI);
      // An object URL is only ever minted by this origin — e.g. a picked file
      // handed to the full-screen viewer.
      const ownBlob = parsed.protocol === 'blob:' && parsed.origin === this.document.location.origin;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && !ownBlob) {
        return null;
      }

      return this.sanitizer.bypassSecurityTrustResourceUrl(parsed.href);
    } catch {
      return null;
    }
  });

  readonly sizeLabel = computed(() => {
    const bytes = this.file()?.size ?? 0;
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  });

  readonly typeLabel = computed(() => {
    const file = this.file();
    if (file) {
      return file.type || 'This file';
    }

    const type = this.contentType();
    if (type) {
      return type;
    }

    const path = (this.url() ?? '').split('?')[0];
    const ext = path.slice(path.lastIndexOf('.') + 1).toUpperCase();
    return ext && ext.length <= 5 ? `A ${ext} file` : 'This file';
  });
}
