import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormGroup } from '@angular/forms';
import { startWith } from 'rxjs';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';

/** Above this many fields the panel is more wall than tool, so it collapses. */
const FEW_FIELDS = 4;

/** Matches the width at which the global grids fall to a single column. */
const PHONE_QUERY = '(max-width: 700px)';

/** Paging and sorting travel in the same form group but are not filters. */
/**
 * Controls that are never a filter the operator applied: paging and sorting
 * state that happens to live in the same form.
 */
const NOT_FILTERS = new Set(['page', 'size', 'sort', 'direction', 'sortBy', 'sortDirection']);

let nextId = 0;

/**
 * Collapsible wrapper for a list page's `<form class="filters">`.
 *
 * Two behaviours, chosen by how many fields the page handed over:
 *
 * - **Four or fewer** — always open, inline, no toggle. There is nothing to
 *   hide and a sheet would be ceremony.
 * - **More** — gets a toggle, and where it *starts* depends on the width.
 *
 * Starting collapsed was a phone constraint and does not transfer. `.filters-grid`
 * is `auto-fit, minmax(170px, 1fr)`: at desktop width ten fields land in two
 * rows about 150px tall and the table is still on screen, while on a 360px
 * phone the same ten fields are ten rows — most of a screen — and push the
 * results the operator came for below the fold. So the panel opens inline on a
 * desktop and stays shut on a phone, where opening it raises a bottom sheet
 * instead. These forms all apply on an explicit Search, so there is nothing to
 * watch update behind the sheet, and Search/Clear land in the thumb zone rather
 * than at the bottom of a long scroll.
 *
 * The toggle stays on both, so an operator who never filters can reclaim the
 * rows — it just is not the default on a screen with room for them.
 *
 * Collapsed, the toggle carries a count of the filters currently set, so a
 * forgotten filter is never invisible.
 */
@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [FocusTrapDirective],
  host: {
    // Placement is the card header's business (§29.4): a panel that reduces to a
    // toggle sits inline on the title row, one that renders its fields needs the
    // full width, and one with no fields at all must not take up a slot.
    '[class.is-expanded]': 'open() && !sheet()',
    '[hidden]': 'empty()'
  },
  template: `
    <section class="filter-panel" [class.filter-panel--sheet]="sheet()">
      @if (collapsible()) {
        <button
          #toggle
          type="button"
          class="filter-panel__toggle"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="panelId"
          (click)="toggleOpen()"
        >
          <svg class="filter-panel__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 5h18M6 12h12M10 19h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span>{{ label() }}</span>
          @if (activeCount() > 0) {
            <span class="filter-panel__badge">{{ activeCount() }}</span>
          }
          @if (scopeLabel(); as scope) {
            <span class="filter-panel__scope">in {{ scope }}</span>
          }
          <span class="filter-panel__caret" aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
        </button>
      }

      <!--
        Beside the count, not inside the panel. The count is what tells an
        operator a filter is on — often while the panel is shut and the fields
        doing the filtering are out of sight — so the way to undo it belongs
        at the same place, not behind a step that reveals what to undo.

        Scope controls survive: they are what the page is narrowed to, not
        something the operator typed, and clearing them would put the page
        back a moment later anyway.
      -->
      @if (activeCount() > 0) {
        <button type="button" class="filter-panel__clear" (click)="clear.emit()">
          Clear search
        </button>
      }

      @if (sheet() && open()) {
        <button type="button" class="filter-panel__scrim" aria-label="Close search" (click)="close()"></button>
      }

      <div
        class="filter-panel__shell"
        [id]="panelId"
        [class.filter-panel__shell--closed]="!open()"
        [appFocusTrap]="sheet() && open()"
        [returnFocusTo]="toggleElement()"
        [attr.role]="sheet() ? 'dialog' : null"
        [attr.aria-modal]="sheet() ? 'true' : null"
        [attr.aria-label]="sheet() ? label() : null"
        (trap-escape)="close()"
      >
        @if (sheet()) {
          <header class="filter-panel__sheet-head">
            <span class="filter-panel__grabber" aria-hidden="true"></span>
            <h2 class="filter-panel__sheet-title">{{ label() }}</h2>
            <button type="button" class="icon-action" aria-label="Close search" title="Close" (click)="close()">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg>
            </button>
          </header>
        }

        <div class="filter-panel__body">
          <ng-content />
        </div>
      </div>
    </section>
  `,
  styles: [`
    .filter-panel {
      display: grid;
      grid-template-columns: auto auto 1fr;
      align-items: center;
      gap: 0.5rem 0.75rem;
    }

    /* The fields take the whole row under the toggle and the clear control. */
    .filter-panel__shell { grid-column: 1 / -1; }

    .filter-panel__toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-self: start;
      max-width: 100%;
      padding: 0.5rem 0.7rem;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }

    .filter-panel__toggle:hover {
      border-color: var(--border-strong);
    }

    .filter-panel__icon {
      width: 1rem;
      height: 1rem;
      flex: none;
      color: var(--text-muted);
    }

    .filter-panel__badge {
      display: grid;
      place-items: center;
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      background: var(--primary);
      color: var(--surface);
      font-size: 0.72rem;
      font-weight: 700;
    }

    .filter-panel__caret {
      color: var(--text-muted);
      font-size: 0.7rem;
    }

    .filter-panel__clear {
      justify-self: start;
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary);
      font: inherit;
      font-size: 0.82rem;
      text-decoration: underline;
      cursor: pointer;
    }

    .filter-panel__clear:hover { color: var(--primary-strong); }

    .filter-panel__shell--closed {
      display: none;
    }

    /* Quieter than the badge: it reports the context, it is not a count. */
    .filter-panel__scope {
      font-weight: 500;
      color: var(--text-muted);
      max-width: 12rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .filter-panel__sheet-head,
    .filter-panel__scrim {
      display: none;
    }

    /* --- bottom sheet ---------------------------------------------------- */

    .filter-panel--sheet .filter-panel__scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 70;
      border: 0;
      padding: 0;
      background: rgba(20, 26, 23, 0.45);
      cursor: pointer;
    }

    /*
     * The :not() guard is load-bearing, not decoration. The --closed rule above
     * is a single class; this selector is two, so without the guard its
     * "display: grid" outranks "display: none" and the sheet is stuck open —
     * visibly so, because the scrim only renders when the panel thinks it is
     * open, leaving a sheet with no backdrop and no way out.
     */
    .filter-panel--sheet .filter-panel__shell:not(.filter-panel__shell--closed) {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 75;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      max-height: 85dvh;
      padding: 0 0.9rem 0.9rem;
      border-radius: 20px 20px 0 0;
      border-top: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      animation: filter-sheet-rise 0.2s ease;
    }

    .filter-panel--sheet .filter-panel__shell:not(.filter-panel__shell--closed) .filter-panel__body {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-bottom: env(safe-area-inset-bottom, 0);
    }

    .filter-panel--sheet .filter-panel__shell:not(.filter-panel__shell--closed) .filter-panel__sheet-head {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0 0.75rem;
    }

    .filter-panel__grabber {
      grid-column: 1 / -1;
      justify-self: center;
      width: 2.25rem;
      height: 0.25rem;
      margin-bottom: 0.5rem;
      border-radius: 999px;
      background: var(--border-strong);
    }

    .filter-panel__sheet-title {
      margin: 0;
      font-size: 1rem;
    }

    @keyframes filter-sheet-rise {
      from { transform: translateY(100%); }
      to { transform: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .filter-panel--sheet .filter-panel__shell:not(.filter-panel__shell--closed) {
        animation: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilterPanelComponent {
  readonly label = input('Search');

  /**
   * The filter form itself. Read only to report how many filters are set — the
   * panel never writes to it.
   */
  readonly form = input<FormGroup | null>(null);

  /** Keeps the panel open and inline regardless of how many fields it holds. */
  readonly alwaysOpen = input(false);

  /**
   * Controls this page mirrors from the active context rather than from the
   * operator — `buildingId` on every list that narrows to the selected
   * building, for instance.
   *
   * They are scope, not a filter: counting them made the badge read "1 filter"
   * on a page where nobody had typed anything, and made it un-clearable —
   * Clear resets the control and the context effect immediately puts it back.
   *
   * Excluded from the count, but not hidden: pass `scopeLabel` so the panel
   * says what the list is narrowed to. An unexplained narrowing is worse than a
   * wrong badge.
   */
  readonly scopeControls = input<string[]>([]);

  /** What the list is currently narrowed to — an agency or building name. */
  readonly scopeLabel = input<string | null>(null);

  /**
   * Emitted by the clear control. The panel counts the filters but does not
   * know how to reset them — a page's reset also has to put the page back to
   * 1 and re-run the search, and only the page knows that.
   */
  readonly clear = output<void>();

  readonly panelId = `filter-panel-${nextId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly toggleRef = viewChild<ElementRef<HTMLElement>>('toggle');
  readonly toggleElement = computed(() => this.toggleRef()?.nativeElement ?? null);

  /** null until the operator touches the toggle; then it wins over the default. */
  private readonly userOpen = signal<boolean | null>(null);
  private readonly fieldCount = signal(0);
  private readonly measured = signal(false);
  private readonly formValue = signal<unknown>(null);
  private readonly phone = signal(false);

  /**
   * A handful of fields is not worth hiding, so those panels get no toggle.
   *
   * Treated as collapsible until the fields have actually been counted: the
   * count only lands after the first render, and assuming the *open* case in
   * the meantime flashes the whole grid open — or, on a phone, throws up a
   * sheet nobody asked for. Assuming collapsed costs nothing, because a hidden
   * subtree is still in the DOM and still measurable.
   */
  readonly collapsible = computed(() => !this.alwaysOpen() && (!this.measured() || this.fieldCount() > FEW_FIELDS));

  readonly open = computed(() => {
    if (!this.collapsible()) {
      return true;
    }

    // Before the fields are counted this reads as open on a desktop and shut on
    // a phone — which is where each ends up anyway, so neither flashes.
    return this.userOpen() ?? !this.phone();
  });

  /**
   * A page may project its filters conditionally — an admin list that becomes a
   * "my records" list has none. Counting zero fields means there is nothing to
   * wrap, so the panel takes itself out of the layout rather than leaving an
   * empty control in the header.
   */
  readonly empty = computed(() => this.measured() && this.fieldCount() === 0);

  readonly sheet = computed(() => this.phone() && this.collapsible());

  readonly activeCount = computed(() => {
    const form = this.form();
    if (!form) {
      return 0;
    }

    // Depend on the latest value so the badge tracks what the operator typed.
    this.formValue();
    const scope = new Set(this.scopeControls());
    return Object.entries(form.controls)
      .filter(([key, control]) => !NOT_FILTERS.has(key) && !scope.has(key) && isSet(control))
      .length;
  });

  constructor() {
    // The fields are projected content, so they can only be counted once the DOM
    // exists. Counting beats an input every page would have to keep in sync.
    afterNextRender(() => {
      this.fieldCount.set(this.host.nativeElement.querySelectorAll('.filters .field').length);
      this.measured.set(true);

      const form = this.form();
      form?.valueChanges
        .pipe(startWith(form.value), takeUntilDestroyed(this.destroyRef))
        .subscribe((value) => this.formValue.set(value));
    });

    const query = this.document.defaultView?.matchMedia(PHONE_QUERY);
    if (query) {
      this.phone.set(query.matches);
      query.addEventListener('change', (event) => this.phone.set(event.matches));
    }

    // The page behind a sheet must not scroll with it. Shared with the nav
    // drawer, which can never be open at the same time.
    effect(() => {
      this.document.body.classList.toggle('body--drawer-open', this.sheet() && this.open());
    });

    // A sheet left open by navigating away would otherwise lock the next page.
    this.destroyRef.onDestroy(() => this.document.body.classList.remove('body--drawer-open'));
  }

  toggleOpen(): void {
    const current = this.open();
    this.userOpen.set(!current);
  }

  close(): void {
    this.userOpen.set(false);
  }

  /**
   * These forms apply on an explicit Search, so a submit is the operator saying
   * they are done — get the sheet out of the way of the results it just fetched.
   *
   * Scoped to this panel's own filter form: a control inside it may run a search
   * of its own (the entity picker does), and that must not be read as the
   * operator finishing with the panel.
   */
  @HostListener('submit', ['$event'])
  onSubmit(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (this.sheet() && target?.classList.contains('filters')) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.sheet()) {
      this.close();
    }
  }
}

function isSet(control: AbstractControl): boolean {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '' || value === false) {
    return false;
  }

  return !(Array.isArray(value) && value.length === 0);
}
