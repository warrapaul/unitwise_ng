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

/**
 * A variable as the editor needs it. Structural rather than imported from the
 * contracts feature: this component is shared, and nothing about it should
 * depend on that feature's model file.
 */
export interface EditorVariable {
  key: string;
  label: string;
  group: string;
  kind?: 'SCALAR' | 'CHOICE' | 'RICH_TEXT' | 'REPEAT' | null;
  required?: boolean | null;
  fallback?: string | null;
  options?: readonly { value: string; label: string }[] | null;
}

/** One clause condition the author can attach to a selection. */
interface ConditionTarget {
  key: string;
  /** The option that must be selected, or null for "has any value at all". */
  value: string | null;
  label: string;
}

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

        <!--
          Tables are a separate control, not an entry in the value picker. They
          go in as a block and the renderer refuses one used as an inline chip,
          so putting them in the same list would offer a document that cannot
          generate.
        -->
        @if (blockVariables().length > 0) {
          <div class="editor__insert">
            <button
              type="button"
              class="editor__tool editor__tool--wide"
              [attr.aria-expanded]="blockPickerOpen()"
              [disabled]="disabled()"
              (mousedown)="$event.preventDefault()"
              (click)="toggleBlockPicker()"
            >Insert table ▾</button>

            @if (blockPickerOpen()) {
              <div class="editor__picker" role="menu">
                <p class="editor__picker-group">tables</p>
                @for (variable of blockVariables(); track variable.key) {
                  <button
                    type="button"
                    class="editor__picker-item"
                    role="menuitem"
                    title="Inserted as one block. Its rows are filled in later and built by the renderer."
                    (mousedown)="$event.preventDefault()"
                    (click)="insertBlock(variable)"
                  >
                    <span>{{ variable.label }}</span>
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (conditionTargets().length > 0) {
          <div class="editor__insert">
            <button
              type="button"
              class="editor__tool editor__tool--wide"
              [attr.aria-expanded]="conditionPickerOpen()"
              [disabled]="disabled()"
              title="Select some words first — they will only appear when the condition holds"
              (mousedown)="$event.preventDefault()"
              (click)="toggleConditionPicker()"
            >Only if ▾</button>

            @if (conditionPickerOpen()) {
              <div class="editor__picker editor__picker--wide" role="menu">
                <p class="editor__picker-group">show the selected words when</p>
                @for (target of conditionTargets(); track target.key + ':' + target.value) {
                  <button
                    type="button"
                    class="editor__picker-item"
                    role="menuitem"
                    (mousedown)="$event.preventDefault()"
                    (click)="applyCondition(target)"
                  >
                    <span>{{ target.label }}</span>
                  </button>
                }
                <button
                  type="button"
                  class="editor__picker-item editor__picker-item--clear"
                  role="menuitem"
                  (mousedown)="$event.preventDefault()"
                  (click)="clearCondition()"
                >
                  <span>Remove the condition at the caret</span>
                </button>
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
        (keydown)="onKeydown($event)"
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

    .editor__picker--wide { width: 20rem; }

    .editor__picker-item:hover { background: var(--surface-2); }

    .editor__picker-item--clear {
      margin-top: 0.25rem;
      border-top: 1px solid var(--border);
      border-radius: 0 0 8px 8px;
      color: var(--text-muted);
    }
    .editor__picker-note { font-size: 0.7rem; color: var(--text-muted); }

    /*
     * The page being written is paper, in both themes, for the same reason a
     * rendered contract is: the document carries its own inline colours,
     * chosen for print, and the sanitizer keeps them. A heading set to a dark
     * navy is invisible on a dark editing surface, and the author has no way
     * to know until it is exported.
     *
     * The tokens are redeclared rather than just the background, so chips,
     * blocks and table borders inside resolve against light values too.
     */
    .editor__surface {
      --surface: #ffffff;
      --surface-2: #f2f3ef;
      --border: #dedfd9;
      --border-strong: #c7c9c1;
      --text: #1c211d;
      --text-muted: #5c6660;
      --primary: #4f6a56;
      --primary-tint: #e4eae2;

      min-height: 22rem;
      max-height: 60vh;
      overflow-y: auto;
      padding: 1.1rem 1.25rem;
      line-height: 1.6;
      outline: none;
      background: var(--surface);
      color: var(--text);
    }

    .editor__surface:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-tint); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RichTextEditorComponent implements ControlValueAccessor {
  /** Feature names from the server's allowlist. Anything else is not offered. */
  readonly features = input<readonly string[]>([]);
  readonly variables = input<readonly EditorVariable[]>([]);
  readonly ariaLabel = input('Document');

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');

  readonly disabled = signal(false);
  readonly pickerOpen = signal(false);
  readonly blockPickerOpen = signal(false);
  readonly conditionPickerOpen = signal(false);
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

  /**
   * The inline picker. Repeat blocks are deliberately absent: they are tables,
   * and the renderer rejects one used as an inline chip. Offering it here would
   * be offering a document that cannot generate.
   */
  readonly groupedVariables = computed(() => {
    const groups = new Map<string, EditorVariable[]>();

    for (const variable of this.variables()) {
      if (variable.kind === 'REPEAT') {
        continue;
      }
      const bucket = groups.get(variable.group) ?? [];
      bucket.push(variable);
      groups.set(variable.group, bucket);
    }

    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  });

  /** Tables, which go in as one opaque block rather than as a chip. */
  readonly blockVariables = computed(() =>
    this.variables().filter((variable) => variable.kind === 'REPEAT'));

  /**
   * What a clause can be made conditional on.
   *
   * A choice contributes one entry per option, because that is the useful
   * condition: the parking clause that names a fee should appear for "charged"
   * and not for "included". Everything else contributes a single presence test.
   */
  readonly conditionTargets = computed<ConditionTarget[]>(() => {
    const targets: ConditionTarget[] = [];

    for (const variable of this.variables()) {
      if (variable.kind === 'REPEAT') {
        continue;
      }

      if (variable.kind === 'CHOICE' && variable.options?.length) {
        for (const option of variable.options) {
          targets.push({ key: variable.key, value: option.value, label: `${variable.label} is ${option.label}` });
        }
        continue;
      }

      targets.push({ key: variable.key, value: null, label: `${variable.label} has a value` });
    }

    return targets;
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

  /**
   * Tab indents rather than leaving the document.
   *
   * A contract is full of indented sub-clauses and the browser's default —
   * move focus to the next control — makes them impossible to type. Inside a
   * list the browser's own nesting is what an author expects; everywhere else
   * the indent is a margin on the block, which the sanitizer keeps as a style
   * and which therefore survives into the PDF.
   *
   * Escape gives the keyboard back: trapping Tab without an exit would leave
   * someone who never uses a mouse stuck inside the editor.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.surface().nativeElement.blur();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    event.preventDefault();

    if (this.inList()) {
      this.exec(event.shiftKey ? 'outdent' : 'indent');
      return;
    }

    this.indentBlock(event.shiftKey ? -1 : 1);
  }

  private inList(): boolean {
    const node = this.currentRange()?.commonAncestorContainer ?? null;
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    return !!element?.closest('li');
  }

  /** One step is 2.5rem — about the width of "16.4" plus a space. */
  private indentBlock(direction: 1 | -1): void {
    const node = this.currentRange()?.commonAncestorContainer ?? null;
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    const surface = this.surface().nativeElement;

    const block = element?.closest('p, h1, h2, h3, blockquote, div, td, th');
    if (!block || !surface.contains(block) || block === surface) {
      return;
    }

    const current = parseFloat((block as HTMLElement).style.marginLeft) || 0;
    const next = Math.max(0, current + direction * 2.5);

    if (next === 0) {
      (block as HTMLElement).style.removeProperty('margin-left');
    } else {
      (block as HTMLElement).style.marginLeft = `${next}rem`;
    }

    this.afterEdit();
  }

  togglePicker(): void {
    this.pickerOpen.update((open) => !open);
    this.blockPickerOpen.set(false);
    this.conditionPickerOpen.set(false);
  }

  toggleBlockPicker(): void {
    this.blockPickerOpen.update((open) => !open);
    this.pickerOpen.set(false);
    this.conditionPickerOpen.set(false);
  }

  toggleConditionPicker(): void {
    this.conditionPickerOpen.update((open) => !open);
    this.pickerOpen.set(false);
    this.blockPickerOpen.set(false);
  }

  /**
   * Inserted as an element, and marked uneditable so the caret treats it as one
   * character. The class and `contenteditable` are presentation only — the
   * sanitizer keeps `data-var`, and `hydrateChips()` puts the rest back every
   * time a document is loaded.
   *
   * Placed through the Range API rather than `execCommand('insertHTML')`.
   * Chrome follows an inline `contenteditable="false"` element with a `<br>`
   * so the caret has somewhere to land, and the chip then broke the sentence
   * it was supposed to sit inside — every single insertion started a new line.
   * Writing the nodes directly leaves the surrounding text alone.
   */
  insertVariable(variable: EditorVariable): void {
    this.pickerOpen.set(false);

    const chip = document.createElement('span');
    chip.setAttribute('data-var', variable.key);
    chip.setAttribute('contenteditable', 'false');
    chip.setAttribute('data-var-label', 'auto');
    chip.className = 'cv-chip';
    chip.textContent = variable.label;

    // A real non-breaking space after it, so the caret has an inline position
    // on the far side and the next character typed is not swallowed by the chip.
    this.insertInline([chip, document.createTextNode('\u00A0')]);
  }

  /**
   * A table goes in as one opaque, uneditable block. Its contents are never
   * read — the renderer builds the table from the definition's columns and
   * discards whatever was inside — so what shows here is a label, not a row
   * template somebody could corrupt with a stray keystroke.
   */
  insertBlock(variable: EditorVariable): void {
    this.blockPickerOpen.set(false);

    const block = document.createElement('div');
    block.setAttribute('data-var-repeat', variable.key);
    block.setAttribute('contenteditable', 'false');
    block.className = 'cv-block';
    block.textContent = variable.label;

    // A paragraph after it: a block that is not editable and sits last leaves
    // the document with no place to put the caret, and it cannot be typed past.
    const after = document.createElement('p');
    after.appendChild(document.createElement('br'));

    this.insertInline([block, after]);
  }

  /**
   * Wraps the selected text in a condition, so the clause is only in the
   * generated contract when it applies. Needs a selection — a condition with
   * nothing inside it would suppress nothing.
   */
  applyCondition(target: ConditionTarget): void {
    this.conditionPickerOpen.set(false);

    const range = this.currentRange();
    if (!range || range.collapsed) {
      alert('Select the words the condition should cover first.');
      return;
    }

    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-var-if', target.key);
    if (target.value !== null) {
      wrapper.setAttribute('data-var-if-value', target.value);
    }
    wrapper.className = 'cv-if';
    wrapper.title = `Only shown when ${target.label.toLowerCase()}`;

    try {
      range.surroundContents(wrapper);
    } catch {
      // surroundContents refuses a range that starts and ends in different
      // elements. Moving the contents by hand does the same job.
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    }

    this.afterEdit();
  }

  /** Removes the condition around the caret, leaving its words in place. */
  clearCondition(): void {
    const range = this.currentRange();
    const node = range?.commonAncestorContainer ?? null;
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    const wrapper = element?.closest('[data-var-if]');

    if (!wrapper) {
      alert('Put the caret inside a conditional clause first.');
      return;
    }

    wrapper.replaceWith(...Array.from(wrapper.childNodes));
    this.afterEdit();
  }

  /**
   * Puts nodes where the caret is, and leaves the caret after them.
   *
   * Falls back to appending at the end when the selection is somewhere else
   * entirely — clicking a toolbar item before ever clicking into the document.
   */
  private insertInline(nodes: Node[]): void {
    const surface = this.surface().nativeElement;
    surface.focus();

    const range = this.currentRange();
    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => fragment.appendChild(node));
    const last = nodes[nodes.length - 1];

    if (range) {
      range.deleteContents();
      range.insertNode(fragment);
    } else {
      surface.appendChild(fragment);
    }

    const selection = window.getSelection();
    if (selection && last) {
      const after = document.createRange();
      after.setStartAfter(last);
      after.collapse(true);
      selection.removeAllRanges();
      selection.addRange(after);
    }

    this.afterEdit();
  }

  /** The caret, but only when it is actually inside this editor. */
  private currentRange(): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    return this.surface().nativeElement.contains(range.commonAncestorContainer) ? range : null;
  }

  private afterEdit(): void {
    this.onChange(this.read());
    this.refreshActive();
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

    /*
     * A repeat block's contents are the editor's own label — the renderer
     * throws them away and builds the table from the definition's columns, so
     * storing them would only invite somebody to believe they were a row
     * template. `contenteditable` stays: the sanitizer now keeps it, and a
     * block that comes back editable can be typed into and broken.
     */
    clone.querySelectorAll('[data-var-repeat]').forEach((block) => {
      block.textContent = '';
      block.removeAttribute('class');
      block.removeAttribute('title');
    });

    clone.querySelectorAll('[data-var-if]').forEach((wrapper) => {
      wrapper.removeAttribute('class');
      wrapper.removeAttribute('title');
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
    const surface = this.surface().nativeElement;

    surface.querySelectorAll('[data-var]').forEach((chip) => {
      chip.setAttribute('contenteditable', 'false');
      chip.classList.add('cv-chip');

      if (!chip.textContent?.trim()) {
        const key = chip.getAttribute('data-var') ?? '';
        chip.textContent = labels.get(key) ?? key;
        chip.setAttribute('data-var-label', 'auto');
      }
    });

    // Blocks are stored empty, for the same reason chips are.
    surface.querySelectorAll('[data-var-repeat]').forEach((block) => {
      block.setAttribute('contenteditable', 'false');
      block.classList.add('cv-block');

      const key = block.getAttribute('data-var-repeat') ?? '';
      block.textContent = labels.get(key) ?? key;
    });

    /*
     * A condition is invisible in the stored markup — it is an attribute on a
     * span that otherwise looks like ordinary text. Marking it here is the only
     * way an author can see that a clause is conditional at all, rather than
     * discovering it missing from a generated contract.
     */
    surface.querySelectorAll('[data-var-if]').forEach((wrapper) => {
      wrapper.classList.add('cv-if');

      const key = wrapper.getAttribute('data-var-if') ?? '';
      const expected = wrapper.getAttribute('data-var-if-value');
      const label = labels.get(key) ?? key;
      wrapper.setAttribute('title', expected
        ? `Only shown when ${label} is ${expected}`
        : `Only shown when ${label} has a value`);
    });
  }
}
