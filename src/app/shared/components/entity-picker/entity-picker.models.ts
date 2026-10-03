import { Observable } from 'rxjs';
import { PaginatedResult } from '../../../core/models/pagination.model';

/** One search input offered inside the picker modal. */
export interface EntitySearchField {
  /** Key sent to the search endpoint. */
  key: string;
  label: string;
  type?: 'text' | 'number';
  placeholder?: string;
}

/** A row as the picker renders it, independent of the entity's own shape. */
export interface EntityRow<T = number> {
  id: T;
  /** Prefilled into the field once chosen. */
  label: string;
  /** Second line in the results list — email, code, building, etc. */
  hint?: string | null;
  /** Extra columns, rendered in order. */
  meta?: string[];
  /** The entity as the API returned it, for a caller that needs more than the id. */
  item?: unknown;
}

/**
 * What a search is narrowed to by the active context — said out loud in the
 * modal, because a short result list otherwise reads as "that is everyone".
 */
export interface EntityPickerScope {
  /** Where the search looks — a building or agency name. */
  label: string;
  /** The next scope out, offered as "Show all in …"; absent when there is none. */
  widerLabel?: string | null;
  /** What is being searched, plural — "tenants". */
  noun: string;
}

/**
 * Everything the picker needs to search one kind of entity. Declared per entity
 * (user, building, tenant, lease…) and reused wherever that id is required, so
 * the search UI is written once rather than per form.
 */
export interface EntityPickerConfig<T = number> {
  /** Shown in the modal heading, e.g. "Find a user". */
  title: string;
  /** Fields the operator can search by. */
  fields: EntitySearchField[];
  /** Column headings for `meta`, if any. */
  metaHeadings?: string[];
  /**
   * Runs the search. Params are the field keys plus page/size. `widened` is set
   * once the operator asks for the scope beyond the one in context.
   */
  search: (params: Record<string, unknown>, widened: boolean) => Observable<PaginatedResult<unknown>>;
  /** The scope a search runs in, before and after widening; null when unscoped. */
  scope?: (widened: boolean) => EntityPickerScope | null;
  /** Maps one API row to what the picker renders. */
  toRow: (item: unknown) => EntityRow<T>;
  /** Resolves a preselected id back to its label, so an edit form prefills. */
  resolve?: (id: T) => Observable<EntityRow<T> | null>;
}
