import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  input,
  signal,
  viewChild
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** One toolbar control, keyed by the feature name the server allows. */
interface ToolbarAction {
  feature: string;
  label: string;
  glyph: string;
  run: (editor: RichTextEditorComponent) => void;
  /** Reads back as pressed while the caret sits inside it. */
  state?: string;
}

/**
 * A rich-text editor whose capabilities are decided by the server.
 *
 * `features` comes from the contract catalogue, which is generated from the
 * sanitizer's allowlist: a button is shown only when what it produces would
 * survive a save. Hardcoding the toolbar is how an admin ends up applying
 * formatting that is silently stripped on the way into the database, which
 * reads as lost work rather than as a rule.
 *
 * Values are inserted as atomic elements — `<span data-var="key">Label</span>`
 * rather than a `{{token}}`. A text token is split the first time someone bolds
 * across it or a paste-cleanup rewrites the node, and the document then renders
 * with a literal placeholder in a legal contract. An element cannot be split by
 * formatting applied around it.
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [LowerCasePipe],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => RichTextEditorComponent),
    multi: true
  }],
  template: `
    <div class="editor" [class.editor--disabled]="disabled()">
      <div class="editor__toolbar" role="toolbar" aria-label="Formatting">
        @for (action of toolbar(); track action.feature) {
          <button
            type="button"
            class="editor__tool"
            [class.editor__tool--on]="activeFeatures().has(action.feature)"
            [attr.aria-pressed]="activeFeatures().has(action.feature)"
            [attr.aria-label]="action.label"
            [title]="action.label"
            [disabled]="disabled()"
            (mousedown)="$event.preventDefault()"
            (click)="action.run(this)"
          >{{ action.glyph }}</button>
        }

        @if (variables().length > 0) {
          <span class="editor__divider" aria-hidden="true"></span>
          <div class="editor__insert">
            <button
              type="button"
              class="editor__tool editor__tool--wide"
              [attr.aria-expanded]="pickerOpen()"
              [disabled]="disabled()"
              (mousedown)="$event.preventDefault()"
              (click)="togglePicker()"
            >Insert value ▾</button>

            @if (pickerOpen()) {
              <div class="editor__picker" role="menu">
                @for (group of groupedVariables(); track group.name) {
                  <p class="editor__picker-group">{{ group.name | lowercase }}</p>
                  @for (variable of group.items; track variable.key) {
                    <button
                      type="button"
                      class="editor__picker-item"
                      role="menuitem"
                      [title]="variable.required ? 'Required — a lease cannot be issued without it' : 'Falls back to “' + variable.fallback + '”'"
                      (mousedown)="$event.preventDefault()"
                      (click)="insertVariable(variable)"
                    >
                      <span>{{ variable.label }}</span>
                      @if (!variable.required) {
                        <span class="editor__picker-note">optional</span>
                      }
                    </button>
                  }
                }
              </div>
            }
          </div>
        }
      </div>

      <!--
        The document itself. Spellcheck stays on for prose, and the chips are
        contenteditable="false" so a caret cannot land inside one and break it.
      -->
      <div
        #surface
        class="editor__surface"
        [attr.contenteditable]="!disabled()"
        role="textbox"
        aria-multiline="true"
        [attr.aria-label]="ariaLabel()"
        (input)="onInput()"
        (blur)="onBlur()"
        (keyup)="refreshActive()"
        (mouseup)="refreshActive()"
      ></div>
    </div>
  `,
  styles: [`
    .editor {
      display: grid;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      overflow: hidden;
    }

    .editor--disabled { opacity: 0.7; }

    .editor__toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
      padding: 0.4rem 0.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--surface-2);
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .editor__tool {
      min-width: 2rem;
      height: 2rem;
      padding: 0 0.45rem;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .editor__tool:hover:not(:disabled) { background: var(--surface); border-color: var(--border); }
    .editor__tool--on { background: var(--primary-tint); color: var(--primary); border-color: var(--primary); }
    .editor__tool--wide { width: auto; font-weight: 600; }
    .editor__divider { width: 1px; height: 1.25rem; background: var(--border); margin: 0 0.25rem; }

    .editor__insert { position: relative; }

    .editor__picker {
      position: absolute;
      top: calc(100% + 0.35rem);
      left: 0;
      z-index: 5;
      width: 15rem;
      max-height: 18rem;
      overflow-y: auto;
      padding: 0.35rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }

    .editor__picker-group {
      margin: 0.35rem 0 0.15rem;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .editor__picker-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      width: 100%;
      padding: 0.35rem 0.45rem;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 0.85rem;
      text-align: start;
      cursor: pointer;
    }

    .editor__picker-item:hover { background: var(--surface-2); }
    .editor__picker-note { font-size: 0.7rem; color: var(--text-muted); }

    .editor__surface {
      min-height: 22rem;
      max-height: 60vh;
      overflow-y: auto;
      padding: 1.1rem 1.25rem;
      line-height: 1.6;
      outline: none;
    }

    .editor__surface:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-tint); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RichTextEditorComponent implements ControlValueAccessor {
  /** Feature names from the server's allowlist. Anything else is not offered. */
  readonly features = input<readonly string[]>([]);
  readonly variables = input<readonly { key: string; label: string; group: string; required?: boolean | null; fallback?: string | null }[]>([]);
  readonly ariaLabel = input('Document');

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');

  readonly disabled = signal(false);
  readonly pickerOpen = signal(false);
  readonly activeFeatures = signal<Set<string>>(new Set());

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  private static readonly ACTIONS: ToolbarAction[] = [
    { feature: 'bold', label: 'Bold', glyph: 'B', state: 'bold', run: (e) => e.exec('bold') },
    { feature: 'italic', label: 'Italic', glyph: 'I', state: 'italic', run: (e) => e.exec('italic') },
    { feature: 'underline', label: 'Underline', glyph: 'U', state: 'underline', run: (e) => e.exec('underline') },
    { feature: 'strike', label: 'Strikethrough', glyph: 'S', state: 'strikeThrough', run: (e) => e.exec('strikeThrough') },
    { feature: 'h1', label: 'Heading 1', glyph: 'H1', run: (e) => e.exec('formatBlock', '<h1>') },
    { feature: 'h2', label: 'Heading 2', glyph: 'H2', run: (e) => e.exec('formatBlock', '<h2>') },
    { feature: 'h3', label: 'Heading 3', glyph: 'H3', run: (e) => e.exec('formatBlock', '<h3>') },
    { feature: 'bulletList', label: 'Bulleted list', glyph: '•', state: 'insertUnorderedList', run: (e) => e.exec('insertUnorderedList') },
    { feature: 'orderedList', label: 'Numbered list', glyph: '1.', state: 'insertOrderedList', run: (e) => e.exec('insertOrderedList') },
    { feature: 'blockquote', label: 'Quote', glyph: '❝', run: (e) => e.exec('formatBlock', '<blockquote>') },
    { feature: 'horizontalRule', label: 'Divider', glyph: '―', run: (e) => e.exec('insertHorizontalRule') },
    { feature: 'link', label: 'Link', glyph: '🔗', run: (e) => e.insertLink() },
    { feature: 'table', label: 'Table', glyph: '▦', run: (e) => e.insertTable() },
    { feature: 'textAlign', label: 'Align left', glyph: '⇤', run: (e) => e.exec('justifyLeft') },
    { feature: 'textAlign', label: 'Centre', glyph: '↔', run: (e) => e.exec('justifyCenter') },
    { feature: 'textAlign', label: 'Align right', glyph: '⇥', run: (e) => e.exec('justifyRight') }
  ];

  /** Only what the server said it would keep. */
  readonly toolbar = computed(() => {
    const allowed = new Set(this.features());
    return RichTextEditorComponent.ACTIONS.filter((action) => allowed.has(action.feature));
  });

  readonly groupedVariables = computed(() => {
    const groups = new Map<string, { key: string; label: string; group: string; required?: boolean | null; fallback?: string | null }[]>();

    for (const variable of this.variables()) {
      const bucket = groups.get(variable.group) ?? [];
      bucket.push(variable);
      groups.set(variable.group, bucket);
    }

    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  });

  constructor() {
    /*
     * The document and the catalogue arrive independently, and either can be
     * last. Re-labelling when the variables land covers the case where the
     * document was written first and every chip was still nameless.
     */
    effect(() => {
      this.variables();
      this.hydrateChips();
    });
  }

  writeValue(value: string | null): void {
    const element = this.surface().nativeElement;
    element.innerHTML = value ?? '';
    this.hydrateChips();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onInput(): void {
    this.onChange(this.read());
    this.refreshActive();
  }

  onBlur(): void {
    this.onTouched();
  }

  togglePicker(): void {
    this.pickerOpen.update((open) => !open);
  }

  /**
   * Inserted as an element, and marked uneditable so the caret treats it as one
   * character. The class and `contenteditable` are presentation only — the
   * sanitizer keeps `data-var` and drops the rest — which is why they are put
   * back by `hydrateChips()` every time a document is loaded.
   */
  insertVariable(variable: { key: string; label: string }): void {
    this.pickerOpen.set(false);
    this.exec('insertHTML',
      `<span data-var="${variable.key}" contenteditable="false" class="cv-chip" ` +
      `data-var-label="auto">${variable.label}</span>&nbsp;`);
  }

  insertLink(): void {
    const href = prompt('Link address (https://…)');
    if (!href) {
      return;
    }

    // Only what the sanitizer's protocol allowlist would keep.
    if (!/^(https?:|mailto:)/i.test(href)) {
      alert('Links must start with http://, https:// or mailto:');
      return;
    }

    this.exec('createLink', href);
  }

  insertTable(): void {
    const rows = 3;
    const columns = 3;
    const body = Array.from({ length: rows }, () =>
      `<tr>${'<td>&nbsp;</td>'.repeat(columns)}</tr>`).join('');

    this.exec('insertHTML', `<table><tbody>${body}</tbody></table><p><br></p>`);
  }

  /** Mirrors the caret's state onto the toolbar, so pressed means pressed. */
  refreshActive(): void {
    const active = new Set<string>();

    for (const action of this.toolbar()) {
      if (!action.state) {
        continue;
      }

      try {
        if (document.queryCommandState(action.state)) {
          active.add(action.feature);
        }
      } catch {
        // queryCommandState throws in some browsers when the surface is not focused.
      }
    }

    this.activeFeatures.set(active);
  }

  /*
   * `execCommand` is deprecated but is the only formatting API every browser
   * still implements, and the alternative is a third-party editor bundle for a
   * toolbar the server already constrains to fifteen features.
   */
  private exec(command: string, value?: string): void {
    this.surface().nativeElement.focus();
    document.execCommand(command, false, value);
    this.onChange(this.read());
    this.refreshActive();
  }

  /**
   * What gets stored. The editor's own presentation comes off first — attributes
   * and the labels it wrote into empty chips — so a save round-trip produces no
   * diff the author did not make. The renderer replaces the whole element
   * anyway, so a chip's text is never part of the document's meaning.
   */
  private read(): string {
    const clone = this.surface().nativeElement.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('[data-var]').forEach((chip) => {
      if (chip.getAttribute('data-var-label') === 'auto') {
        chip.textContent = '';
        chip.removeAttribute('data-var-label');
      }

      chip.removeAttribute('contenteditable');
      chip.removeAttribute('class');
    });

    return clone.innerHTML;
  }

  /**
   * Puts the presentation back on a document loaded from the server, and gives
   * empty chips their label.
   *
   * Templates are stored with empty chips — the renderer only needs `data-var`
   * — so a document straight from the database shows a row of blank marks where
   * the values should be, and nothing distinguishes the rent from the deposit.
   * The label is written in for display and taken out again on save.
   */
  private hydrateChips(): void {
    const labels = new Map(this.variables().map((variable) => [variable.key, variable.label]));

    this.surface().nativeElement.querySelectorAll('[data-var]').forEach((chip) => {
      chip.setAttribute('contenteditable', 'false');
      chip.classList.add('cv-chip');

      if (!chip.textContent?.trim()) {
        const key = chip.getAttribute('data-var') ?? '';
        chip.textContent = labels.get(key) ?? key;
        chip.setAttribute('data-var-label', 'auto');
      }
    });
  }
}
