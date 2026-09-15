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
  /** Runs the search. Params are the field keys plus page/size. */
  search: (params: Record<string, unknown>) => Observable<PaginatedResult<unknown>>;
  /** Maps one API row to what the picker renders. */
  toRow: (item: unknown) => EntityRow<T>;
  /** Resolves a preselected id back to its label, so an edit form prefills. */
  resolve?: (id: T) => Observable<EntityRow<T> | null>;
}
