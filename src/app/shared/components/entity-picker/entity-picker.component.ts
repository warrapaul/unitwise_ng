import { ChangeDetectionStrategy, Component, ElementRef, effect, forwardRef, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
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
    <div class="picker">
      <button type="button" class="picker__control" [disabled]="disabled()" (click)="openModal()">
        <span class="picker__value" [class.picker__value--empty]="!chosen() && !resolving()">
          {{ resolving() ? 'Loading…' : (chosen()?.label ?? placeholder()) }}
        </span>
        @if (chosen()?.hint) {
          <span class="picker__hint">{{ chosen()!.hint }}</span>
        }
        <span class="picker__action" aria-hidden="true">Search</span>
      </button>

      @if (chosen() && !disabled() && !required()) {
        <button type="button" class="btn btn-secondary btn-sm" (click)="clear()">Clear</button>
      }
    </div>

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
          <button type="button" class="icon-btn" aria-label="Close" (click)="closeModal()">×</button>
        </header>

        <!--
          Deliberately a div, not a form. The picker is rendered inside a
          page's own <form>, and a nested form's submit event bubbles out to
          it — firing that page's (ngSubmit) and running its search. Enter is
          handled here instead so the inner search never escapes the modal.
        -->
        <div class="modal__search" [formGroup]="form" (keydown.enter)="onSearchEnter($event)">
          <div class="grid-auto filters-grid">
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
                    <th>Name</th>
                    @for (heading of config().metaHeadings ?? []; track heading) {
                      <th>{{ heading }}</th>
                    }
                    <th class="actions-col"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <tr class="row-clickable" (click)="choose(row)">
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
                      <td class="actions-col">
                        <button type="button" class="btn btn-primary btn-sm" (click)="choose(row); $event.stopPropagation()">
                          Select
                        </button>
                      </td>
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
      color: var(--text-subtle);
    }

    .picker__hint {
      font-size: 0.78rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .picker__action {
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--primary);
      white-space: nowrap;
    }

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
      grid-template-rows: auto auto minmax(0, 1fr);
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

    .icon-btn {
      width: 1.9rem;
      height: 1.9rem;
      display: grid;
      place-items: center;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-muted);
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }

    .modal__search {
      display: grid;
      gap: 0.6rem;
    }

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

      /* A comfortable tap target for the one control that gets you out. */
      .icon-btn {
        width: 2.5rem;
        height: 2.5rem;
        font-size: 1.3rem;
      }
    }

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

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityPickerComponent<T = number> implements ControlValueAccessor {
  readonly config = input.required<EntityPickerConfig<T>>();
  readonly placeholder = input('None selected');
  readonly required = input(false);
  readonly selectionChange = output<EntityRow<T> | null>();

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

  readonly form = this.formBuilder.group<Record<string, unknown>>({});
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private page = 0;

  private onChange: (value: T | null) => void = () => undefined;
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

    effect(() => {
      const id = this.value();
      const resolve = this.config().resolve;
      if (id === null || this.chosen()?.id === id || !resolve) {
        return;
      }

      void this.resolveLabel(id, resolve);
    });
  }

  writeValue(value: T | null): void {
    this.value.set(value ?? null);
    if (value === null || value === undefined) {
      this.chosen.set(null);
    }
  }

  registerOnChange(fn: (value: T | null) => void): void {
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
    void this.search();
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
      const result = await firstValueFrom(this.config().search(params));
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
    this.value.set(row.id);
    this.chosen.set(row);
    this.onChange(row.id);
    this.selectionChange.emit(row);
    this.closeModal();
  }

  clear(): void {
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
