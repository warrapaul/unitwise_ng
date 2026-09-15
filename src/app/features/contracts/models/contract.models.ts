/**
 * Contract templates: one document per level, resolved room → building → agency
 * → master, first one found wins. There is no merging — a level either owns a
 * document or inherits the one above it.
 */
export type ContractLevel = 'ROOM' | 'BUILDING' | 'AGENCY' | 'MASTER';
export type ContractVariableGroup = 'PROPERTY' | 'TENANT' | 'FINANCIALS' | 'LEASE';

/** BUILDINGS leaves room overrides intact; ALL discards those too. */
export type CascadeScope = 'BUILDINGS' | 'ALL';

export interface ContractTemplateDetail {
  /** Null when the document is inherited rather than owned by this level. */
  id?: number | null;
  content: string;
  source: ContractLevel;
  /** True when this level owns the document — drives Customized vs Inherited. */
  customized?: boolean | null;
  /** True when the parent moved on since this fork was taken. */
  stale?: boolean | null;
  forkedFromVersion?: number | null;
  currentMasterVersion?: number | null;
  updatedAt?: string | null;
}

export interface SaveContractTemplateRequest {
  content: string;
  changeNote?: string | null;
}

export interface ContractTemplateHistoryEntry {
  id: number;
  content: string;
  retiredAt?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

/**
 * An insertable value. `key` goes in `data-var` and is never shown; `label` is
 * what the chip reads. A null `fallback` means the variable is required and
 * lease generation fails rather than shipping a contract with a gap in it.
 */
export interface ContractVariableOption {
  key: string;
  label: string;
  group: ContractVariableGroup;
  required?: boolean | null;
  fallback?: string | null;
}

/**
 * Served rather than hardcoded, so the picker cannot offer a variable the
 * renderer does not know, and the toolbar cannot offer formatting the sanitizer
 * would strip on save — which would read as lost work.
 */
export interface ContractEditorCatalogue {
  variables: ContractVariableOption[];
  allowedFeatures: string[];
}

/** What an "apply to all below" would discard — real numbers for the confirm. */
export interface ContractCascadePreview {
  affectedBuildings?: number | null;
  buildingNames?: string[] | null;
  affectedRooms?: number | null;
}

export interface ContractPreviewRequest {
  content: string;
}

export interface ContractPreviewResult {
  rendered: string;
  /** Unknown or unresolvable variables — what would block a real lease. */
  warnings?: string[] | null;
}
