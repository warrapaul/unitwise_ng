import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { FilePreviewComponent } from '../file-preview/file-preview.component';
import { validateFile } from '../../../utils/file-validation.util';

/**
 * Sends the picked files. Resolve `true` once they are stored, and the picker
 * clears; resolve `false` after showing your own error, and the files stay put
 * for a retry. The page owns the request and its error card; this owns the pick.
 */
export type FileUploadSend = (files: File[]) => Promise<boolean>;

const TYPE_NAMES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word'
};

/**
 * Pick, look, then send — every upload in the app goes through here.
 *
 * Choosing a file never sends it. The pick is validated against the same rules
 * the server applies, previewed with `app-file-preview`, and sent only by the
 * Upload button (§13 "Preview before upload").
 *
 * - `variant="field"` — a labelled file field with the preview and buttons under it.
 *   Projected content (a document-type select) shares the file field's row.
 * - `variant="trigger"` — no visible field; the page's own button calls `open()`.
 *   For "Replace" in a row: the preview and buttons appear where the component sits.
 * - Without `send`, there are no buttons: the pick is reported through
 *   `fileChange` / `filesChange` and goes out with the page's own submit (a message, a form).
 *   Call `clear()` after that submit succeeds.
 */
@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [FilePreviewComponent],
  template: `
    @if (variant() === 'field') {
      <!-- Fields that describe the file (a document type) sit on the same row as it. -->
      <div class="file-upload__row">
        <ng-content />
        <label class="field">
          <span>{{ label() }}</span>
          <input #picker type="file" [accept]="accept()" [multiple]="multiple()"
                 [disabled]="disabled() || busy()" (change)="onPick($event)">
          <small class="hint">{{ hintText() }}</small>
          @if (error()) {
            <small class="error-text">{{ error() }}</small>
          }
        </label>
      </div>
    } @else {
      <input #picker type="file" class="visually-hidden" tabindex="-1" aria-hidden="true"
             [accept]="accept()" [multiple]="multiple()" (change)="onPick($event)">
      @if (error()) {
        <small class="error-text">{{ error() }}</small>
      }
    }

    @if (files().length > 0) {
      <div class="file-upload__previews" [class.file-upload__previews--grid]="files().length > 1">
        @for (file of files(); track file) {
          <div class="file-upload__item">
            <app-file-preview [file]="file" />
            @if (files().length > 1) {
              <button type="button" class="icon-action" [disabled]="busy()" (click)="remove(file)"
                      [attr.aria-label]="'Remove ' + file.name" title="Remove">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg>
              </button>
            }
          </div>
        }
      </div>

      @if (send()) {
        <div class="button-row">
          <button type="button" class="btn btn-primary" [disabled]="busy() || disabled()" (click)="submit()">
            {{ busy() ? 'Uploading...' : buttonLabel() }}
          </button>
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="clear()">Cancel</button>
        </div>
      }
    }
  `,
  styles: [`
    :host {
      display: grid;
      gap: 0.75rem;
      min-width: 0;
    }

    .file-upload__row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      align-items: start;
    }

    .file-upload__previews {
      display: grid;
      gap: 1rem;
    }

    /* A batch sits side by side, each preview capped by its track. */
    .file-upload__previews--grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 200px));
    }

    .file-upload__item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      min-width: 0;
    }

    .file-upload__item app-file-preview {
      flex: 1;
      min-width: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileUploadComponent {
  /** MIME types the server accepts — the same list it validates against. */
  readonly types = input.required<readonly string[]>();
  readonly maxSizeMb = input.required<number>();
  readonly label = input('File');
  /** Overrides the generated "PDF or JPEG up to 10MB." */
  readonly hint = input<string | null>(null);
  readonly multiple = input(false);
  readonly variant = input<'field' | 'trigger'>('field');
  readonly uploadLabel = input('Upload');
  readonly disabled = input(false);
  readonly send = input<FileUploadSend | null>(null);

  readonly filesChange = output<File[]>();
  /** The first pick, or null — for a single-file field. */
  readonly fileChange = output<File | null>();

  readonly files = signal<File[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');

  readonly accept = computed(() => this.types().join(','));

  readonly hintText = computed(() => {
    const custom = this.hint();
    if (custom) {
      return custom;
    }

    const names = [...new Set(this.types().map((type) => TYPE_NAMES[type] ?? type))];
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0] ?? 'Any file';
    return `${list} up to ${this.maxSizeMb()}MB${this.multiple() ? ' each' : ''}.`;
  });

  readonly buttonLabel = computed(() => {
    const count = this.files().length;
    return count > 1 ? `${this.uploadLabel()} (${count})` : this.uploadLabel();
  });

  /** Opens the file dialog — for `variant="trigger"`, from the page's own button. */
  open(): void {
    this.picker()?.nativeElement.click();
  }

  /** Drops the pick and resets the input, so choosing the same file again still fires. */
  clear(): void {
    this.files.set([]);
    this.error.set(null);
    const element = this.picker()?.nativeElement;
    if (element) {
      element.value = '';
    }
    this.emit([]);
  }

  remove(file: File): void {
    this.files.update((files) => files.filter((entry) => entry !== file));
    this.emit(this.files());
  }

  onPick(event: Event): void {
    const picked = Array.from((event.target as HTMLInputElement).files ?? []);
    this.error.set(null);

    // Refused files are named and left out; the rest of a batch still goes.
    const problems: string[] = [];
    const accepted = picked.filter((file) => {
      const problem = validateFile(file, { maxSizeMB: this.maxSizeMb(), allowedTypes: this.types() });
      if (problem) {
        problems.push(picked.length > 1 ? `${file.name}: ${problem}` : problem);
      }
      return !problem;
    });

    if (problems.length > 0) {
      this.error.set(problems.join(' · '));
    }

    this.files.set(accepted);
    if (accepted.length === 0) {
      (event.target as HTMLInputElement).value = '';
    }
    this.emit(accepted);
  }

  private emit(files: File[]): void {
    this.filesChange.emit(files);
    this.fileChange.emit(files[0] ?? null);
  }

  async submit(): Promise<void> {
    const send = this.send();
    const files = this.files();
    if (!send || files.length === 0) {
      return;
    }

    this.busy.set(true);
    try {
      if (await send(files)) {
        this.clear();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
