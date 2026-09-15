import { signal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

export interface SortEntry {
  field: string;
  direction: SortDirection;
}

/**
 * The ordering a listing table is currently asking the server for.
 *
 * Held as an ordered list rather than one field, because "newest first, and
 * within a day by name" is a real request an operator makes of a table, and
 * Spring answers it directly: repeated `sort=field,dir` params are applied in
 * the order they arrive. `buildHttpParams` sends the array as those repeated
 * params, so a page only has to hand `toParams()` to its search call.
 *
 * A plain click replaces the ordering; an additive click (shift or ctrl/cmd)
 * appends to it, which is the convention every spreadsheet already taught.
 */
export class SortState {
  private readonly state = signal<SortEntry[]>([]);

  /** Read in templates — the arrows and rank badges follow this. */
  readonly entries = this.state.asReadonly();

  constructor(field?: string, direction: SortDirection = 'asc') {
    if (field) {
      this.state.set([{ field, direction }]);
    }
  }

  /**
   * Cycles one column: unsorted → asc → desc → unsorted. Dropping out entirely
   * matters for a multi-column sort, where removing the secondary key is a
   * thing an operator wants and a two-state toggle cannot express.
   */
  toggle(field: string, additive = false): void {
    this.state.update((entries) => {
      const existing = entries.find((entry) => entry.field === field);
      const others = additive ? entries.filter((entry) => entry.field !== field) : [];

      if (!existing) {
        return [...others, { field, direction: 'asc' as SortDirection }];
      }

      if (existing.direction === 'asc') {
        return [...others, { field, direction: 'desc' as SortDirection }];
      }

      return others;
    });
  }

  directionOf(field: string): SortDirection | null {
    return this.state().find((entry) => entry.field === field)?.direction ?? null;
  }

  /** 1-based position, and only worth showing once more than one key is active. */
  rankOf(field: string): number | null {
    const entries = this.state();
    if (entries.length < 2) {
      return null;
    }

    const index = entries.findIndex((entry) => entry.field === field);
    return index === -1 ? null : index + 1;
  }

  reset(field?: string, direction: SortDirection = 'asc'): void {
    this.state.set(field ? [{ field, direction }] : []);
  }

  /** `['createdAt,desc', 'name,asc']` — exactly what Spring's Pageable reads. */
  toParams(): string[] {
    return this.state().map((entry) => `${entry.field},${entry.direction}`);
  }
}

export function sortState(field?: string, direction: SortDirection = 'asc'): SortState {
  return new SortState(field, direction);
}
