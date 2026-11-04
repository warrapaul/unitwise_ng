import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Sort arrows and the like that a header shows beside its words. */
const DECORATION = /[↑↓↕▴▾]/g;

/**
 * A table that turns each row into a card on a phone, from one template.
 *
 * It copies each column's header onto that column's cells as `data-label`;
 * under 640px the `.table--cards` styles hide the header row, stack each row
 * as a card and print the label above each value. Rows that change later
 * (paging, filters, a column that comes and goes) are labelled again.
 *
 * In the template:
 * - The row's first cell is the card's heading (full width, unlabelled); `class="card-title"`
 *   on another cell makes that the heading instead.
 * - `class="card-skip"` on a cell hides it on the card (detail that does not earn the space).
 * - `data-card-label="…"` on a header overrides the label taken from its text; on a cell, it
 *   labels that cell whatever its column.
 * - `class="card-only"` on a cell shows it only on the card: a phone summary of figures the
 *   table spreads across columns (those columns then take `card-skip`). Put it last in the row.
 * - A cell spanning several columns (a group heading, an inline form, "No rooms") spans the card.
 *
 * Add `table--lines` for a short bill-like list (what · how much · detail): line items, no labels.
 *
 * Keep it for lists you open one record from. Tables read across columns
 * (statements, billing grids) should scroll sideways instead: as cards the
 * comparison is lost.
 *
 *     <table class="table" appCardTable>
 */
@Directive({
  selector: 'table[appCardTable]',
  standalone: true,
  host: { class: 'table--cards' }
})
export class CardTableDirective {
  private readonly table = inject<ElementRef<HTMLTableElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.label();
      // Attributes are not observed, so labelling cannot trigger itself.
      const observer = new MutationObserver(() => this.label());
      observer.observe(this.table, { childList: true, subtree: true, characterData: true });
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private label(): void {
    const headRow = this.table.tHead?.rows[0];
    if (!headRow) {
      return;
    }
    const labels: string[] = [];
    for (const th of Array.from(headRow.cells)) {
      const text = th.dataset['cardLabel'] ?? (th.textContent ?? '').replace(DECORATION, '').replace(/\s+/g, ' ').trim();
      for (let i = 0; i < (th.colSpan || 1); i++) {
        labels.push(text);
      }
    }
    for (const body of Array.from(this.table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        let column = 0;
        for (const cell of Array.from(row.cells)) {
          const span = cell.colSpan || 1;
          const label = span === 1 && cell.tagName === 'TD' ? (cell.dataset['cardLabel'] ?? labels[column]) : undefined;
          if (!label) {
            cell.removeAttribute('data-label');
          } else if (cell.getAttribute('data-label') !== label) {
            cell.setAttribute('data-label', label);
          }
          column += span;
        }
      }
    }
  }
}
