/**
 * Contract templates: one document per level, resolved room → building → agency
 * → master, first one found wins. There is no merging — a level either owns a
 * document or inherits the one above it.
 */
export type ContractLevel = 'ROOM' | 'BUILDING' | 'AGENCY' | 'MASTER';
/*
 * A free string, not a union. Agencies define their own variables and pick
 * their own grouping, so the set is open and the picker groups off whatever
 * comes back.
 */
export type ContractVariableGroup = string;

/** What shape a value has — drives both rendering and how the form asks for it. */
export type ContractVariableKind = 'SCALAR' | 'CHOICE' | 'RICH_TEXT' | 'REPEAT';

export type ContractVariableDataType =
  | 'TEXT' | 'MULTILINE' | 'INTEGER' | 'MONEY' | 'DATE'
  | 'PHONE' | 'EMAIL' | 'ID_NUMBER' | 'BOOLEAN';

/** A level in the template chain, and where a filled value is stored. */
export type ContractScope = 'MASTER' | 'AGENCY' | 'BUILDING' | 'ROOM';

/** BUILDINGS leaves room overrides intact; ALL discards those too. */
export type CascadeScope = 'BUILDINGS' | 'ALL';

export interface ContractTemplateDetail {
  /** Null when the document is inherited rather than owned by this level. */
  id?: number | null;
  content: string;
  source: ContractLevel;
  /** True when this level owns the document — drives Customized vs Inherited. */
  customized?: boolean | null;
  /**
   * True when the parent moved on since this fork was taken.
   *
   * A timestamp comparison, at every level: the master is a single row edited
   * in place, so there are no versions to compare and nothing to say what
   * changed — only that it did.
   */
  stale?: boolean | null;
  updatedAt?: string | null;
}

export interface SaveContractTemplateRequest {
  content: string;
  changeNote?: string | null;
}

/**
 * An insertable value. `key` goes in `data-var` and is never shown; `label` is
 * what the chip reads. A null `fallback` means the variable is required and
 * lease generation fails rather than shipping a contract with a gap in it.
 */
export interface ContractChoiceOption {
  value: string;
  label: string;
}

export interface ContractRepeatColumn {
  key: string;
  label: string;
  dataType?: ContractVariableDataType | null;
  required?: boolean | null;
}

export interface ContractVariableOption {
  key: string;
  label: string;
  group: ContractVariableGroup;
  kind?: ContractVariableKind | null;
  dataType?: ContractVariableDataType | null;
  required?: boolean | null;
  fallback?: string | null;
  pattern?: string | null;
  helpText?: string | null;
  options?: ContractChoiceOption[] | null;
  columns?: ContractRepeatColumn[] | null;
}

/** ERROR blocks generation; NEEDS_INPUT is a value somebody must type. */
export type ContractFindingSeverity = 'ERROR' | 'WARNING' | 'NEEDS_INPUT';

export interface ContractTemplateFinding {
  severity: ContractFindingSeverity;
  key?: string | null;
  label?: string | null;
  message: string;
}

export interface ContractTemplateValidation {
  canGenerate: boolean;
  referencedKeys?: string[] | null;
  findings?: ContractTemplateFinding[] | null;
  /**
   * Keys the wording refers to that cannot be resolved for this property —
   * what somebody has to go and record before a lease will generate.
   */
  missingForProperty?: ContractTemplateFinding[] | null;
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

/** One required value nobody has recorded, and where it is recorded. */
export interface ContractMissingValue {
  key: string;
  label: string;
  /** The screen to send the landlord to — "the building", "the agency profile". */
  recordedOn?: string | null;
}

/**
 * Whether a property can produce a lease as things stand.
 *
 * What replaced the landlord fill form. The values a contract states are
 * properties of the agency, the building and the room now, so the question
 * the form was really answering — "what is still missing, and where do I go
 * to record it?" — is all that was left of it.
 */
export interface ContractReadiness {
  ready: boolean;
  templateSource?: ContractScope | null;
  missing?: ContractMissingValue[] | null;
}
