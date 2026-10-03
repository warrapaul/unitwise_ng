import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, forwardRef, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { debounceTime, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Pagination } from '../../../core/models/pagination.model';
import { extractErrorMessage } from '../../utils/error-message.util';
import { LoadingStateComponent } from '../loading-state/loading-state.component';
import { ErrorStateComponent } from '../error-state/error-state.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { EntityPickerConfig, EntityRow } from './entity-picker.models';

/**
 * A form control for "an id the operator should never have to know".
 *
 * Renders the chosen entity's name, not its id. Clicking opens a modal that
 * searches by the fields a human actually has — phone, email, name, code — and
 * selecting a row writes the id back to the form while showing the label.
 *
 * The raw id stays the control's value, so request DTOs are unchanged.
 */
@Component({
  selector: 'app-entity-picker',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent
  ],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => EntityPickerComponent),
    multi: true
  }],
  template: `
    @if (trigger() === 'button') {
      <!-- An action, not a field: "New message" opens the search and the choice is emitted. -->
      <button type="button" class="btn btn-secondary" [disabled]="disabled()" (click)="openModal()">{{ buttonLabel() }}</button>
    } @else {
      <div class="picker">
        <button type="button" class="picker__control" [disabled]="disabled()" (click)="openModal()">
          <span class="picker__value" [class.picker__value--empty]="!triggerLabel() && !resolving()">
            {{ resolving() ? 'Loading…' : (triggerLabel() || placeholder()) }}
          </span>
          @if (!multiple() && chosen()?.hint) {
            <span class="picker__hint">{{ chosen()!.hint }}</span>
          }
          <!-- An icon, not the word: the whole field is the control, and the glass says it opens a search. -->
          <svg class="picker__action" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-search" /></svg>
        </button>

        @if ((multiple() ? picked().length > 0 : !!chosen()) && !disabled() && !required()) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="clear()">Clear</button>
        }
      </div>
    }

    <!--
      The resolving state is shown *in* the control, never as a line under it.
      As a separate element it appeared for the length of one request and then
      left, moving every field below it — which reads as the page flickering on
      load, and is what a prefilled picker did on every create form.
    -->

    <!--
      A native <dialog> opened with showModal(), not a positioned div. This
      picker is routinely rendered inside another overlay — a filter bottom
      sheet, itself position:fixed with its own stacking context, z-index and
      scrolling body. Nested that way a plain div is at the mercy of every
      ancestor; the top layer is outside all of them, and brings its own
      focus trap, Escape handling and ::backdrop.

      Always in the DOM so showModal() and close() always pair: behind an
      @if a close could destroy the element before close() ran, stranding
      the top layer. A closed dialog renders nothing.
    -->
    <dialog
      #dialog
      class="picker-dialog"
      [attr.aria-label]="config().title"
      (click)="onDialogClick($event)"
      (cancel)="closeModal()"
      (close)="closeModal()"
    >
      <div class="modal" (click)="$event.stopPropagation()">
        <header class="modal__head">
          <h2>{{ config().title }}</h2>
          <button type="button" class="icon-action" aria-label="Close" title="Close" (click)="closeModal()"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg></button>
        </header>

        <!--
          Deliberately a div, not a form. The picker is rendered inside a
          page's own <form>, and a nested form's submit event bubbles out to
          it — firing that page's (ngSubmit) and running its search. Enter is
          handled here instead so the inner search never escapes the modal.
        -->
        <div class="modal__search" [formGroup]="form" (keydown.enter)="onSearchEnter($event)">
          <div class="modal__fields">
            @for (field of config().fields; track field.key) {
              <label class="field">
                <span>{{ field.label }}</span>
                <input
                  [type]="field.type === 'number' ? 'number' : 'text'"
                  [formControlName]="field.key"
                  [placeholder]="field.placeholder ?? ''"
                >
              </label>
            }
          </div>
          <div class="button-row">
            <button type="button" class="btn btn-primary" [disabled]="loading()" (click)="search()">
              {{ loading() ? 'Searching…' : 'Search' }}
            </button>
            <button type="button" class="btn btn-secondary" (click)="reset()">Clear</button>
          </div>
        </div>

        <!-- The same notice list pages show, for the same reason: a narrowed search must say so. -->
        @if (scopeInfo(); as scope) {
          <p class="modal__scope">
            <span>Showing {{ scope.noun }} for <strong>{{ scope.label }}</strong> only.</span>
            @if (scope.widerLabel && allowWiden()) {
              <button type="button" class="modal__widen" (click)="widen()">Show all in {{ scope.widerLabel }}</button>
            }
          </p>
        }

        <div class="modal__results">
          @if (loading()) {
            <app-loading-state label="Searching…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="search()" />
          } @else if (rows().length === 0) {
            <app-empty-state
              title="No matches"
              description="Adjust the fields above and search again."
            />
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    @if (multiple()) {
                      <th class="check-col"><span class="visually-hidden">Selected</span></th>
                    }
                    <th>Name</th>
                    @for (heading of config().metaHeadings ?? []; track heading) {
                      <th>{{ heading }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <!-- The row is the control: no Select button repeating what a click already does. -->
                    <tr class="row-clickable" [class.row--picked]="isPicked(row.id)" (click)="choose(row)"
                        tabindex="0" (keydown.enter)="choose(row)" (keydown.space)="choose(row); $event.preventDefault()">
                      @if (multiple()) {
                        <td class="check-col">
                          <input type="checkbox" [checked]="isPicked(row.id)" (click)="$event.stopPropagation()" (change)="choose(row)"
                                 [attr.aria-label]="'Select ' + row.label">
                        </td>
                      }
                      <td>
                        <div class="cell-stack">
                          <strong>{{ row.label }}</strong>
                          @if (row.hint) {
                            <span class="muted">{{ row.hint }}</span>
                          }
                        </div>
                      </td>
                      @for (value of row.meta ?? []; track $index) {
                        <td>{{ value }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (pagination(); as page) {
              <div class="modal__pager">
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="page.isFirst" (click)="go(-1)">Previous</button>
                <span class="muted">Page {{ page.page + 1 }} of {{ page.totalPages || 1 }}</span>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="page.isLast" (click)="go(1)">Next</button>
              </div>
            }
          }
        </div>

        <!-- Several at once: ticks survive paging and searching, and apply on Done. -->
        @if (multiple()) {
          <div class="modal__foot">
            <span class="muted">{{ draft().length }} selected</span>
            @if (draft().length > 0) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="draft.set([])">Clear selection</button>
            }
            <button type="button" class="btn btn-primary" (click)="confirmMany()">Done</button>
          </div>
        }
      </div>
    </dialog>
  `,
  styles: [`
    .picker {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      max-width: var(--field-max-width);
    }

    .picker__control {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 0;
      min-height: 2.7rem;
      padding: 0.6rem 0.75rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .picker__control:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .picker__value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .picker__value--empty {
      color: var(--text-muted);
    }

    .picker__hint {
      font-size: 0.78rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .picker__action {
      flex: none;
      width: 1.05rem;
      height: 1.05rem;
      fill: none;
      stroke: var(--text-muted);
      stroke-width: 1.8;
      stroke-linecap: round;
    }

    .picker__control:hover .picker__action { stroke: var(--primary); }

    .picker-dialog {
      /* The UA gives a dialog its own border, padding and auto margins. */
      max-width: min(100%, 46rem);
      width: min(100%, 46rem);
      max-height: 90vh;
      padding: 0;
      border: 0;
      background: transparent;
      overflow: visible;
    }

    .picker-dialog::backdrop {
      background: rgba(33, 43, 38, 0.45);
    }

    .modal {
      display: grid;
      grid-template-rows: auto auto auto minmax(0, 1fr) auto;
      gap: 0.75rem;
      width: 100%;
      max-height: min(90vh, 44rem);
      padding: 1rem 1.1rem 1.1rem;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
    }

    .modal__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .modal__head h2 {
      margin: 0;
      font-size: 1.05rem;
    }

    /*
     * Fields side by side, as many as fit. The page-filter classes collapse
     * into their parent, which here was a one-column grid — six full-width
     * fields stacked down a modal. Search and Clear take the last column, so
     * they stay at the right edge whatever the wrap (skills §19.8).
     */
    .modal__search {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.6rem 0.75rem;
      align-items: end;
    }

    .modal__fields { display: contents; }
    .modal__search .field { gap: 0.3rem; }
    .modal__search .field span { font-size: 0.82rem; }
    .modal__search .field input { min-height: 2.5rem; padding-block: 0.55rem; }
    .modal__search > .button-row { grid-column: -2 / -1; }

    @media (max-width: 700px) {
      /* Full-bleed on a phone: a centred card wastes the little width there is. */
      .picker-dialog {
        width: 100%;
        max-width: 100%;
        max-height: 92dvh;
        margin: auto 0 0;
      }

      .modal {
        width: 100%;
        max-height: 92dvh;
        border-radius: 20px 20px 0 0;
        padding: 0.85rem 0.9rem 1rem;
      }
    }

    .modal__scope {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin: 0;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-lg);
      background: var(--primary-tint);
      font-size: 0.85rem;
    }

    .modal__widen {
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary-strong);
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }

    .modal__foot {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.6rem;
      padding-top: 0.6rem;
      border-top: 1px solid var(--border);
    }

    .modal__foot .muted { margin-right: auto; }
    .check-col { width: 1%; }
    .row--picked td { background: var(--primary-tint); }

    .modal__results {
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
    }

    .modal__pager {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-top: 0.6rem;
    }

    .row-clickable {
      cursor: pointer;
    }

    .row-clickable:hover td {
      background: var(--primary-tint);
    }

    .row-clickable:focus-visible td {
      background: var(--primary-tint);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityPickerComponent<T = number> implements ControlValueAccessor {
  readonly config = input.required<EntityPickerConfig<T>>();
  readonly placeholder = input('None selected');
  readonly required = input(false);
  /** Ticks several; the control's value is then an array of ids. */
  readonly multiple = input(false);
  /** 'button' renders an action that opens the search, for pickers that start something rather than fill a field. */
  readonly trigger = input<'field' | 'button'>('field');
  readonly buttonLabel = input('Search');
  /** Whether "Show all in …" is offered — off where the caller needs the narrower scope (a building's readings). */
  readonly allowWiden = input(true);
  readonly selectionChange = output<EntityRow<T> | null>();
  /** Multiple mode: every chosen row, on Done. */
  readonly selectionsChange = output<EntityRow<T>[]>();

  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly value = signal<T | null>(null);
  readonly chosen = signal<EntityRow<T> | null>(null);
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly resolving = signal(false);
  readonly error = signal<string | null>(null);
  readonly rows = signal<EntityRow<T>[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  /** Multiple mode: the applied choice, and the ticks being made in the open modal. */
  readonly picked = signal<EntityRow<T>[]>([]);
  readonly draft = signal<EntityRow<T>[]>([]);

  /** Set by "Show all in …"; every opening starts in the context's own scope again. */
  readonly widened = signal(false);
  readonly scopeInfo = computed(() => this.config().scope?.(this.widened()) ?? null);

  readonly triggerLabel = computed(() => {
    if (!this.multiple()) {
      return this.chosen()?.label ?? '';
    }
    const labels = this.picked().map((row) => row.label);
    return labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  });

  readonly form = this.formBuilder.group<Record<string, unknown>>({});
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private page = 0;

  private onChange: (value: T | null | T[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Drive the top layer off the signal: showModal() is what puts the dialog
    // above every ancestor stacking context, and it must be paired with close()
    // or the browser keeps the page inert.
    effect(() => {
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }

      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });

    // Build the search form from the config, and resolve any preset id to a
    // label so an edit form shows a name rather than a bare number.
    effect(() => {
      const config = this.config();
      for (const field of config.fields) {
        if (!this.form.contains(field.key)) {
          this.form.addControl(field.key, this.formBuilder.control<unknown>(''));
        }
      }
    });

    // Results follow the typing, after a short pause — no Search press needed.
    // The button stays for anyone who reaches for it; it just is not required.
    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      if (this.open()) {
        this.page = 0;
        void this.search();
      }
    });

    effect(() => {
      const id = this.value();
      const resolve = this.config().resolve;
      if (id === null || this.chosen()?.id === id || !resolve) {
        return;
      }

      void this.resolveLabel(id, resolve);
    });
  }

  writeValue(value: T | T[] | null): void {
    if (this.multiple()) {
      const ids = Array.isArray(value) ? value : [];
      // Keep the labels already known; an id set from outside shows as "#id" until picked here.
      const known = new Map(this.picked().map((row) => [row.id, row]));
      this.picked.set(ids.map((id) => known.get(id) ?? { id, label: `#${String(id)}` }));
      return;
    }
    const single = Array.isArray(value) ? null : value;
    this.value.set(single ?? null);
    if (single === null || single === undefined) {
      this.chosen.set(null);
    }
  }

  registerOnChange(fn: (value: T | null | T[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  openModal(): void {
    if (this.disabled()) {
      return;
    }

    this.open.set(true);
    this.error.set(null);
    this.widened.set(false);
    this.page = 0;
    this.draft.set(this.picked());
    void this.search();
  }

  widen(): void {
    this.widened.set(true);
    this.page = 0;
    void this.search();
  }

  isPicked(id: T): boolean {
    return this.draft().some((row) => row.id === id);
  }

  confirmMany(): void {
    const rows = this.draft();
    this.picked.set(rows);
    this.onChange(rows.map((row) => row.id));
    this.selectionsChange.emit(rows);
    this.closeModal();
  }

  closeModal(): void {
    this.open.set(false);
    this.onTouched();
  }

  /**
   * A modal dialog's own element fills the viewport behind the content, so a
   * click landing on it — rather than on the panel, which stops propagation —
   * is a click outside.
   */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialogRef()?.nativeElement) {
      this.closeModal();
    }
  }

  /** Enter searches the picker; it must never reach the host page's form. */
  onSearchEnter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    void this.search();
  }

  reset(): void {
    this.form.reset();
    this.page = 0;
    void this.search();
  }

  async go(delta: number): Promise<void> {
    this.page = Math.max(0, this.page + delta);
    await this.search();
  }

  async search(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params: Record<string, unknown> = { ...this.form.getRawValue(), page: this.page, size: 10 };

    try {
      const result = await firstValueFrom(this.config().search(params, this.widened()));
      this.rows.set(result.items.map((item) => this.config().toRow(item)));
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  choose(row: EntityRow<T>): void {
    if (this.multiple()) {
      this.draft.update((rows) => rows.some((entry) => entry.id === row.id)
        ? rows.filter((entry) => entry.id !== row.id)
        : [...rows, row]);
      return;
    }

    this.value.set(row.id);
    this.chosen.set(row);
    this.onChange(row.id);
    this.selectionChange.emit(row);
    this.closeModal();
  }

  clear(): void {
    if (this.multiple()) {
      this.picked.set([]);
      this.onChange([]);
      this.selectionsChange.emit([]);
      this.onTouched();
      return;
    }

    this.value.set(null);
    this.chosen.set(null);
    this.onChange(null);
    this.selectionChange.emit(null);
    this.onTouched();
  }

  private async resolveLabel(id: T, resolve: NonNullable<EntityPickerConfig<T>['resolve']>): Promise<void> {
    this.resolving.set(true);

    try {
      this.chosen.set(await firstValueFrom(resolve(id)));
    } catch {
      // Fall back to showing the raw id rather than blocking the form.
      this.chosen.set({ id, label: `#${String(id)}` });
    } finally {
      this.resolving.set(false);
    }
  }
}
