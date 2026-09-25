import { ChangeDetectionStrategy, Component, TemplateRef, computed, contentChild, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FilePreviewComponent } from '../file-preview/file-preview.component';
import { FileUploadComponent, FileUploadSend } from '../file-upload/file-upload.component';
import { FileViewerService, FileViewItem } from '../file-viewer/file-viewer.service';

/**
 * One stored file, in the list's own terms. Each page maps its model — a tenant
 * document, a product image — onto this, so the list knows nothing about either.
 */
export interface FileListItem {
  id: string | number;
  /** The title: a document type, an image's alt text. */
  name: string;
  /** The line under it: file name, who filed it. */
  meta?: string | null;
  url?: string | null;
  contentType?: string | null;
  /** A short chip — "Primary". */
  badge?: string | null;
  /** Outlines the entry — the primary image. */
  highlight?: boolean;
  /** Makes the name a link, e.g. to the file's own detail page. */
  link?: string | readonly unknown[] | null;
  /** Offers Replace when the list has a `replace` handler. */
  replaceable?: boolean;
}

/** The context handed to the `#actions` template: `let-item`. */
export interface FileListActionsContext {
  $implicit: FileListItem;
}

/**
 * Stored files, listed the same way everywhere (§13 "Listing files").
 *
 * - `variant="rows"` — name and a detail line; Preview expands the file in the
 *   row, Full screen opens the viewer.
 * - `variant="thumbs"` — square tiles; a tile opens the viewer on that file,
 *   and the arrows step through the rest.
 *
 * Page-specific actions (Delete, Make primary, Edit) come in through an
 * `<ng-template #actions let-item>` and sit beside the built-in ones. Replace is
 * built in, because it is the same everywhere: pick, preview in the row, upload.
 */
@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, FilePreviewComponent, FileUploadComponent],
  template: `
    @if (items().length === 0) {
      <p class="muted">{{ emptyLabel() }}</p>
    } @else if (variant() === 'rows') {
      <ul class="file-rows">
        @for (item of items(); track item.id) {
          <li class="file-row" [class.file-row--highlight]="item.highlight">
            <div class="file-row__head">
              <div class="file-row__body">
                @if (item.link) {
                  <a class="record-link__primary" [routerLink]="item.link">{{ item.name }}</a>
                } @else {
                  <strong>{{ item.name }}</strong>
                }
                @if (item.meta) {
                  <span class="muted">{{ item.meta }}</span>
                }
              </div>
              @if (item.badge) {
                <span class="status-chip status-chip--info">{{ item.badge }}</span>
              }
              <div class="file-row__actions">
                @if (item.url) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="toggle(item.id)"
                          [attr.aria-expanded]="expanded() === item.id">
                    {{ expanded() === item.id ? 'Hide' : 'Preview' }}
                  </button>
                }
                @if (canReplace(item)) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="replacer.busy()"
                          (click)="expanded.set(null); replacer.open()">Replace</button>
                }
                @if (actions(); as template) {
                  <ng-container *ngTemplateOutlet="template; context: { $implicit: item }" />
                }
              </div>
            </div>

            <!-- Shows nothing until Replace picks a file; then its preview and Upload / Cancel. -->
            <app-file-upload #replacer variant="trigger" [types]="replaceTypes()" [maxSizeMb]="replaceMaxSizeMb()"
                             uploadLabel="Upload replacement" [send]="senderFor(item)" />

            @if (replacer.files().length === 0 && expanded() === item.id && item.url) {
              <app-file-preview [url]="item.url" [contentType]="item.contentType ?? null" [label]="item.name" />
            }
          </li>
        }
      </ul>
    } @else {
      <ul class="file-thumbs">
        @for (item of items(); track item.id) {
          <li class="file-thumb" [class.file-thumb--highlight]="item.highlight">
            @if (item.url) {
              <button type="button" class="file-thumb__open" (click)="view(item)" [attr.aria-label]="'View ' + item.name">
                <app-file-preview size="thumb" [url]="item.url" [contentType]="item.contentType ?? null" [label]="item.name" />
              </button>
            } @else {
              <span class="file-thumb__missing muted">No file</span>
            }
            <div class="file-thumb__meta">
              <span class="file-thumb__name" [title]="item.name">{{ item.name }}</span>
              @if (item.meta) {
                <span class="muted file-thumb__name">{{ item.meta }}</span>
              }
              @if (item.badge || actions()) {
                <div class="file-thumb__foot">
                  @if (item.badge) {
                    <span class="status-chip status-chip--info">{{ item.badge }}</span>
                  }
                  @if (actions(); as template) {
                    <div class="file-thumb__actions">
                      <ng-container *ngTemplateOutlet="template; context: { $implicit: item }" />
                    </div>
                  }
                </div>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .file-rows {
      display: grid;
      gap: 0.6rem;
    }

    .file-row {
      display: grid;
      gap: 0.75rem;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }

    .file-row--highlight,
    .file-thumb--highlight { border-color: var(--primary); }

    .file-row__head {
      display: flex;
      align-items: center;
      gap: 0.5rem 0.75rem;
      flex-wrap: wrap;
    }

    .file-row__body {
      flex: 1 1 12rem;
      min-width: 0;
      display: grid;
      gap: 0.15rem;
    }

    .file-row__body > * {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-row__actions,
    .file-thumb__actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .file-thumbs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }

    .file-thumb {
      display: grid;
      align-content: start;
      gap: 0.5rem;
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      min-width: 0;
    }

    .file-thumb__open {
      padding: 0;
      border: 0;
      background: none;
      cursor: zoom-in;
      border-radius: 12px;
    }

    .file-thumb__missing {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border: 1px dashed var(--border);
      border-radius: 12px;
      font-size: 0.85rem;
    }

    .file-thumb__meta {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
      font-size: 0.85rem;
    }

    .file-thumb__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-thumb__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileListComponent {
  readonly items = input.required<FileListItem[]>();
  readonly variant = input<'rows' | 'thumbs'>('rows');
  readonly emptyLabel = input('Nothing here yet.');

  /** Stores the replacement for one entry; resolve true when stored (see FileUploadSend). */
  readonly replace = input<((item: FileListItem, file: File) => Promise<boolean>) | null>(null);
  readonly replaceTypes = input<readonly string[]>([]);
  readonly replaceMaxSizeMb = input(10);

  readonly actions = contentChild<TemplateRef<FileListActionsContext>>('actions');

  private readonly viewer = inject(FileViewerService);

  /** The row whose stored file is open. One at a time: a list, not a gallery. */
  readonly expanded = signal<string | number | null>(null);

  /** Everything with a file, for the viewer to step through. */
  private readonly viewable = computed<(FileViewItem & { id: string | number })[]>(() =>
    this.items()
      .filter((item) => !!item.url)
      .map((item) => ({ id: item.id, name: item.name, url: item.url!, contentType: item.contentType }))
  );

  /** One sender per entry, kept so the upload's input does not change on every check. */
  private readonly senders = new Map<string | number, FileUploadSend>();

  canReplace(item: FileListItem): boolean {
    return !!this.replace() && !!item.replaceable;
  }

  toggle(id: string | number): void {
    this.expanded.update((current) => current === id ? null : id);
  }

  view(item: FileListItem): void {
    const items = this.viewable();
    this.viewer.open(items, items.findIndex((entry) => entry.id === item.id));
  }

  senderFor(item: FileListItem): FileUploadSend | null {
    const replace = this.replace();
    if (!replace || !item.replaceable) {
      return null;
    }

    let send = this.senders.get(item.id);
    if (!send) {
      // Reads the handler at send time, so a replaced input is honoured.
      send = ([file]) => this.replace()?.(item, file) ?? Promise.resolve(false);
      this.senders.set(item.id, send);
    }
    return send;
  }
}
