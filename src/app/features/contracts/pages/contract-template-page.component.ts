import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ContractsService } from '../contracts.service';
import { HousingService } from '../../housing/housing.service';
import { ContractSettingsComponent } from '../../housing/contract-settings/contract-settings.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import {
  CascadeScope,
  ContractCascadePreview,
  ContractEditorCatalogue,
  ContractLevel,
  ContractTemplateDetail,
  ContractReadiness,
  ContractTemplateValidation
} from '../models/contract.models';

/**
 * The contract document for one level of agency → building → room.
 *
 * One page for all four levels because the operation is the same at each: read
 * the document in force, edit it, save it — which forks this level — or reset,
 * which drops the fork and goes back to inheriting. What differs is only which
 * endpoint is called and what "the level above" is called, so that lives in a
 * small switch rather than in three near-identical pages.
 */
@Component({
  selector: 'app-contract-template-page',
  standalone: true,
  imports: [
    RouterLink,
    PluralPipe,
    ContractSettingsComponent,
    ReactiveFormsModule,
    BackLinkComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    RichTextEditorComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="backLink()" [label]="backLabel()" />

      @if (loading()) {
        <app-loading-state label="Loading contract template..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else {
        <app-section-card [title]="title()" [subtitle]="subtitle()">
          <ng-container actions>
            <div class="action-bar">
              @if (template()?.customized && level() !== 'MASTER') {
                <button type="button" class="btn btn-danger" [disabled]="resetting()" (click)="reset()">
                  {{ resetting() ? 'Resetting...' : 'Reset to inherited' }}
                </button>
              }
            </div>
          </ng-container>

          <!--
            The one fact that decides what a save means here: editing an
            inherited document forks it, and from then on this level stops
            following the one above.
          -->
          @if (template(); as detail) {
            <div class="chip-row">
              @if (level() === 'MASTER') {
                <!--
                  No version number: the master is a single row edited in
                  place. Staleness below it is a timestamp comparison, which
                  says that it moved, not what moved.
                -->
                <span class="status-chip status-chip--info">Platform master</span>
              } @else if (detail.customized) {
                <span class="status-chip status-chip--success">Customized here</span>
              } @else {
                <span class="status-chip status-chip--neutral">Inherited from {{ sourceLabel(detail.source) }}</span>
              }

              @if (detail.stale) {
                <span class="status-chip status-chip--warning">
                  {{ parentLabel() }} has changed since this copy was taken
                </span>
              }
            </div>

          }

          <!--
            Two views of one document, so they are alternatives rather than a
            stack: side by side vertically, the preview is something you scroll
            past instead of something you check the edit against, and the page
            becomes two full documents tall.
          -->
          <!--
            Preview first, and the tab the page opens on. Landing straight in
            the editor asks an admin to change a document before they have read
            it; the common visit is to check what is in force, not to edit.
          -->
          <div class="tabs" role="tablist">
            @if (canPreview()) {
            <button
              type="button"
              class="tabs__tab"
              role="tab"
              [class.tabs__tab--active]="tab() === 'preview'"
              [attr.aria-selected]="tab() === 'preview'"
              (click)="showPreview()"
            >
              {{ previewing() ? 'Rendering…' : 'Preview' }}
              @if ((previewWarnings() ?? []).length > 0) {
                <span class="tabs__badge">{{ (previewWarnings() ?? []).length }}</span>
              }
            </button>
            }
            <button
              type="button"
              class="tabs__tab"
              role="tab"
              [class.tabs__tab--active]="tab() === 'edit'"
              [attr.aria-selected]="tab() === 'edit'"
              (click)="showEdit()"
            >Edit</button>
          </div>

          <form class="stack" [hidden]="tab() !== 'edit'" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
            <app-rich-text-editor
              formControlName="content"
              [features]="catalogue()?.allowedFeatures ?? []"
              [variables]="catalogue()?.variables ?? []"
              [ariaLabel]="title()"
            />

            <ul class="hint tips">
              <li>Use <strong>Insert value</strong> for anything that changes per tenant or room — names, rent, dates. Each lease fills them in.</li>
              <li>Details that never change, like your own name as landlord, can simply be typed in. Then there is nothing to set up for them.</li>
            </ul>

            <label class="field field--wide">
              <span>What changed (optional)</span>
              <input formControlName="changeNote" maxlength="500" placeholder="e.g. Added the late-payment clause">
            </label>

            @if (saveError(); as apiError) {
              <app-error-card title="Unable to save the template" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saveLabel() }}
              </button>
              @if (numericAgencyId()) {
                <button type="button" class="btn btn-secondary" [disabled]="validating()" (click)="validate()">
                  {{ validating() ? 'Checking…' : 'Check this document' }}
                </button>
              }
              @if (canCascade()) {
                <button type="button" class="btn btn-secondary" [disabled]="cascading()" (click)="openCascade()">
                  Apply to all buildings
                </button>
              }
            </div>

            @if (validation(); as report) {
              <div class="panel validation" [class.validation--blocked]="!report.canGenerate">
                <p class="validation__verdict">
                  @if (report.canGenerate) {
                    <span class="status-chip status-chip--success">Can generate a lease</span>
                  } @else {
                    <span class="status-chip status-chip--danger">Cannot generate a lease</span>
                  }
                </p>

                @if (blockingFindings().length > 0) {
                  <p class="validation__heading">Fix before a lease can be issued</p>
                  <ul class="validation__list">
                    @for (finding of blockingFindings(); track finding.message) {
                      <li><strong>{{ finding.label || finding.key }}</strong> — {{ finding.message }}</li>
                    }
                  </ul>
                }

                <!--
                  Not a fault in the document. These are the fields that will
                  appear on the landlord's and the tenant's forms, which is the
                  useful thing to see while writing it.
                -->
                <!--
                  Not a fault in the wording: these are values the document
                  states that nothing on this property records yet. Named here
                  as well as in the readiness card because this is where an
                  admin is when they add the variable that needs one.
                -->
                @if (missingForProperty().length > 0) {
                  <p class="validation__heading">Not recorded for this property</p>
                  <ul class="validation__list muted">
                    @for (finding of missingForProperty(); track finding.message) {
                      <li>{{ finding.label || finding.key }} — {{ finding.message }}</li>
                    }
                  </ul>
                }

                @if (advisoryFindings().length > 0) {
                  <p class="validation__heading">Worth a look</p>
                  <ul class="validation__list muted">
                    @for (finding of advisoryFindings(); track finding.message) {
                      <li>{{ finding.message }}</li>
                    }
                  </ul>
                }
              </div>
            }
          </form>
          <div [hidden]="tab() !== 'preview'">
            @if (previewError(); as apiError) {
              <app-error-card title="Unable to render the preview" [message]="apiError.message" [details]="apiError.details" />
            } @else if (previewWarnings(); as warnings) {
              @if (warnings.length > 0) {
                <app-error-card
                  title="This document would not generate cleanly"
                  message="Fix these before a lease is issued from it."
                  [details]="warnings"
                />
              }
            }

            @if (rendered(); as html) {
              <p class="hint">Shown with sample values. Each real lease fills in its own.</p>
              <!--
                Server-rendered and server-sanitized against the jsoup allowlist;
                the client never substitutes values or trusts author HTML it has
                not been handed back by that endpoint.
              -->
              <article class="contract-doc" [innerHTML]="html"></article>
            } @else if (!previewing() && !previewError()) {
              <p class="muted">Nothing rendered yet.</p>
            }
          </div>

        </app-section-card>

        <!--
          About the property, not the wording, which is why it is a card of
          its own rather than a tab of the document. Validation reads the
          template and can only catch what a template can be wrong about;
          this resolves against the real agency, building and room.
        -->
        @if (canPreview()) {
          <app-section-card title="Ready to issue?">
            <ng-container actions>
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="checkingReadiness()" (click)="checkReadiness()">
                {{ checkingReadiness() ? 'Checking…' : 'Check again' }}
              </button>
            </ng-container>

            <!--
              Minimised while the details form below is open: the list is what
              the form is filling, so it collapses to a count and the form gets
              the room. Saving re-checks and brings the full answer back.
            -->
            @if (settingsOpen() && readiness(); as report) {
              <p class="muted">{{ toRecord().length }} still to record — fill them in below.</p>
            } @else if (readiness(); as report) {
              @if (report.ready) {
                <p><span class="status-chip status-chip--success">Ready</span></p>
                <p class="muted">Everything this contract needs is recorded.</p>
              } @else {
                <!--
                  Two different lists. Some values only exist once there is a
                  building and a room — nobody forgot to record them, there is
                  nothing yet to record them on. They fill in when a lease is
                  issued for a room, so they are not reported as missing.
                -->
                @if (toRecord().length > 0) {
                  <p><span class="status-chip status-chip--danger">Not ready</span></p>
                  <p class="readiness__heading">Still to record</p>
                  <ul class="readiness">
                    @for (item of toRecord(); track item.label) {
                      <li><strong>{{ item.label }}</strong> <span class="muted">— {{ whereToRecord(item) }}</span></li>
                    }
                  </ul>

                  @if (agencyCanAnswer() && !settingsOpen()) {
                    <div class="button-row">
                      <button type="button" class="btn btn-primary" (click)="settingsOpen.set(true)">
                        {{ numericBuildingId() !== null ? 'Record building contract details' : 'Record agency contract details' }}
                      </button>
                    </div>
                  }
                } @else {
                  <p><span class="status-chip status-chip--success">Ready</span></p>
                  <p class="muted">Nothing left to record here.</p>
                }

                @if (fillsLater().length > 0) {
                  <p class="readiness__heading">Filled in when a lease is issued for a room</p>
                  <ul class="readiness muted">
                    @for (item of fillsLater(); track item.label) {
                      <li>{{ item.label }} — {{ whereToRecord(item) }}</li>
                    }
                  </ul>
                  @if (agencyBuildingCount() === 0) {
                    <!-- The next step for an agency with nowhere to let yet. -->
                    <div class="button-row">
                      <a class="btn btn-primary" [routerLink]="RoutePaths.buildingCreate" [queryParams]="{ agencyId: numericAgencyId() }">
                        Add your first building
                      </a>
                    </div>
                  }
                }
              }
            } @else if (!checkingReadiness()) {
              <p class="muted">Not checked yet.</p>
            }
          </app-section-card>
        }

        @if (settingsOpen() && numericAgencyId(); as agencyId) {
          <!--
            The building's form when one is in scope: it answers building-only
            values (LR number) and overrides the agency's, whose values still
            apply wherever it is left blank.
          -->
          <app-contract-settings
            [agencyId]="agencyId"
            [buildingId]="numericBuildingId()"
            [startEditing]="true"
            [title]="numericBuildingId() !== null ? 'Building contract details' : 'Agency contract details'"
            (saved)="onSettingsSaved()"
          />
        }

        @if (cascadeOpen()) {
          <app-section-card title="Apply this document downward">
            <p class="hint">
              Every building that has its own version goes back to following the agency. Their
              previous documents stay in each building's history, but the buildings themselves
              will change.
            </p>

            <label class="field">
              <span>Scope</span>
              <select [value]="cascadeScope()" (change)="onCascadeScope($event)">
                <option value="BUILDINGS">Buildings only — leave room-level documents alone</option>
                <option value="ALL">Buildings and rooms — discard every override below</option>
              </select>
            </label>

            @if (cascadePreview(); as summary) {
              <div class="detail-groups">
                <p>
                  <strong>{{ (summary.affectedBuildings ?? 0) | plural: 'building' }}</strong> would be reset@if (cascadeScope() === 'ALL') {
                    <span>, along with <strong>{{ (summary.affectedRooms ?? 0) | plural: 'room-level document' }}</strong></span>
                  }.
                </p>
                @if ((summary.buildingNames ?? []).length > 0) {
                  <ul class="muted">
                    @for (name of summary.buildingNames ?? []; track name) {
                      <li>{{ name }}</li>
                    }
                  </ul>
                }
              </div>
            }

            @if (cascadeError(); as apiError) {
              <app-error-card title="Unable to apply downward" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="button" class="btn btn-danger" [disabled]="cascading()" (click)="applyCascade()">
                {{ cascading() ? 'Applying...' : 'Apply and discard overrides' }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="cascadeOpen.set(false)">Cancel</button>
            </div>
          </app-section-card>
        }

      }
    </section>
  `,
  styles: [`
    .tips { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; }
    .readiness { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.3rem; }
    .readiness__heading { margin: 0.4rem 0 0; font-weight: 600; font-size: 0.9rem; }

    .validation {
      padding: 0.9rem 1rem;
      border-left: 3px solid var(--success);
    }

    .validation--blocked { border-left-color: var(--danger); }

    .validation__verdict { margin: 0 0 0.5rem; }

    .validation__heading {
      margin: 0.65rem 0 0.2rem;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .validation__list {
      margin: 0;
      padding-left: 1.1rem;
      font-size: 0.9rem;
    }

    .chip-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    p { margin: 0; }
    ul { margin: 0.35rem 0 0; padding-left: 1.1rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContractTemplatePageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  /** Route data decides which endpoints this page talks to. */
  readonly level = input.required<ContractLevel>();
  readonly agencyId = input<string | undefined>(undefined);
  readonly buildingId = input<string | undefined>(undefined);
  readonly roomId = input<string | undefined>(undefined);

  private readonly confirm = inject(ConfirmService);
  private readonly contracts = inject(ContractsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly housing = inject(HousingService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly template = signal<ContractTemplateDetail | null>(null);
  readonly catalogue = signal<ContractEditorCatalogue | null>(null);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly resetting = signal(false);

  /*
   * Preview is rendered by an agency-scoped endpoint, so the master editor has
   * nothing to call — it opens on Edit and is not offered the tab.
   */
  readonly tab = signal<'edit' | 'preview'>('edit');
  readonly previewing = signal(false);
  readonly rendered = signal<SafeHtml | null>(null);
  readonly previewWarnings = signal<string[] | null>(null);
  readonly previewError = signal<ApiError | null>(null);
  /** The draft the current preview was rendered from, so switching tabs back and forth is free. */
  private renderedFrom: string | null = null;

  readonly checkingReadiness = signal(false);
  readonly readiness = signal<ContractReadiness | null>(null);
  readonly settingsOpen = signal(false);

  /**
   * Whether the agency's contract settings would fill any gap. BUILDING counts:
   * landlord and payment values report it because a building may override
   * them, but the agency's settings are the fallback that answers them.
   */
  /**
   * Values that belong to a particular building or room — its name, its
   * address and the town read from it, its schedules. Checked with no building
   * or room chosen, they cannot be recorded anywhere yet.
   */
  private static readonly PROPERTY_KEYS = new Set([
    'building.name', 'building.address', 'premises.town', 'room.name',
    'schedule.inventory', 'schedule.utilities'
  ]);

  /** Each missing value once, split by whether it can be recorded at this level. */
  private readonly missingOnce = computed(() => {
    const seen = new Set<string>();
    return (this.readiness()?.missing ?? [])
      .map((item) => ({ ...item, label: item.label || item.key }))
      .filter((item) => !seen.has(item.label) && !!seen.add(item.label));
  });

  /** Only deferred when the scope does not reach the thing they describe. */
  private isDeferred(key: string): boolean {
    if (!ContractTemplatePageComponent.PROPERTY_KEYS.has(key)) {
      return false;
    }
    return key === 'room.name' ? this.numericRoomId() === null : this.numericBuildingId() === null;
  }

  readonly toRecord = computed(() => this.missingOnce().filter((item) => !this.isDeferred(item.key)));
  readonly fillsLater = computed(() => this.missingOnce().filter((item) => this.isDeferred(item.key)));

  /** Where each value comes from, in the words an admin would look for it by. */
  whereToRecord(item: { key: string; recordedOn?: string | null }): string {
    switch (item.key) {
      case 'premises.town':
      case 'building.address':
        return "the building's address";
      case 'building.name':
        return "the building's name";
      case 'room.name':
        return "the room's name";
      case 'premises.lrNumber':
        return "the building's contract details";
      default:
        return item.recordedOn || 'not recorded yet';
    }
  }

  /** Null until known. Zero means the agency has nowhere to let yet. */
  readonly agencyBuildingCount = signal<number | null>(null);

  readonly agencyCanAnswer = computed(() =>
    (this.readiness()?.missing ?? []).some((item) => item.source === 'AGENCY' || item.source === 'BUILDING'));

  /** A save may have closed the gaps; ask again rather than guess. */
  async onSettingsSaved(): Promise<void> {
    this.settingsOpen.set(false);
    await this.checkReadiness();
  }

  readonly validating = signal(false);
  readonly validation = signal<ContractTemplateValidation | null>(null);

  readonly blockingFindings = computed(() =>
    (this.validation()?.findings ?? []).filter((finding) => finding.severity === 'ERROR'));
  readonly missingForProperty = computed(() => this.validation()?.missingForProperty ?? []);
  readonly advisoryFindings = computed(() =>
    (this.validation()?.findings ?? []).filter((finding) => finding.severity === 'WARNING'));

  readonly cascadeOpen = signal(false);
  readonly cascading = signal(false);
  readonly cascadeScope = signal<CascadeScope>('BUILDINGS');
  readonly cascadePreview = signal<ContractCascadePreview | null>(null);
  readonly cascadeError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    content: '',
    changeNote: ''
  });

  readonly title = computed(() => {
    switch (this.level()) {
      case 'MASTER': return 'Master contract template';
      case 'AGENCY': return 'Agency contract template';
      case 'BUILDING': return 'Building contract template';
      default: return 'Room contract template';
    }
  });

  /**
   * Kept where it states reach, which the title does not: which rooms a document
   * governs is the fact that decides whether to edit here or a level up (§23).
   */
  readonly subtitle = computed(() => {
    switch (this.level()) {
      case 'MASTER': return 'Every agency starts from this document';
      case 'AGENCY':
        return 'Applies to every building and room, unless one of them is given its own version';
      case 'BUILDING':
        return 'Applies to every room in this building, unless a room is given its own version';
      default:
        return 'Applies to leases for this room only';
    }
  });

  readonly levelNoun = computed(() =>
    this.level() === 'ROOM' ? 'room' : this.level() === 'BUILDING' ? 'building' : 'agency');

  readonly parentLabel = computed(() =>
    this.level() === 'ROOM' ? 'The building document'
      : this.level() === 'BUILDING' ? 'The agency document'
        : 'The platform master');

  readonly canPreview = computed(() => this.numericAgencyId() !== null);

  readonly numericBuildingId = computed(() => toId(this.buildingId()));
  readonly numericRoomId = computed(() => toId(this.roomId()));

  /** Null for the master editor, which may use platform variables alone. */
  readonly numericAgencyId = computed(() => toId(this.agencyId()));

  /** Only the agency level owns the buildings a cascade would touch. */
  readonly canCascade = computed(() => this.level() === 'AGENCY' && this.template()?.customized === true);

  readonly saveLabel = computed(() => {
    if (this.saving()) {
      return 'Saving...';
    }

    if (this.level() === 'MASTER') {
      return 'Publish new version';
    }

    return this.template()?.customized ? 'Save changes' : 'Save a copy for this ' + this.levelNoun();
  });

  readonly backLink = computed(() => {
    if (this.level() === 'BUILDING' || this.level() === 'ROOM') {
      return RoutePaths.buildingDetail(Number(this.agencyId()), Number(this.buildingId()));
    }

    if (this.level() === 'AGENCY') {
      return RoutePaths.agencyDetail(Number(this.agencyId()));
    }

    return RoutePaths.home;
  });

  readonly backLabel = computed(() =>
    this.level() === 'BUILDING' || this.level() === 'ROOM' ? 'Back to building'
      : this.level() === 'AGENCY' ? 'Back to agency' : 'Back');

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [catalogue, template] = await Promise.all([
        firstValueFrom(this.contracts.getEditorCatalogue(this.numericAgencyId())),
        this.fetchTemplate()
      ]);

      this.catalogue.set(catalogue);
      this.template.set(template);
      this.form.patchValue({ content: template.content ?? '', changeNote: '' });

      /*
       * Opening on Preview is only useful if something is in it. Rendering
       * here rather than making the operator click the tab they already
       * landed on is the whole point of leading with the document.
       */
      if (this.canPreview()) {
        this.tab.set('preview');
        void this.showPreview();
        void this.checkReadiness();
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const value = this.form.getRawValue();
    if (!value.content.trim()) {
      this.saveError.set({ status: 0, errorCode: 'CLIENT_VALIDATION', message: 'The document is empty.', details: [] });
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const request = { content: value.content, changeNote: value.changeNote || null };
      const agencyId = Number(this.agencyId());

      const saved = this.level() === 'MASTER'
        ? await firstValueFrom(this.contracts.publishMasterTemplate(request))
        : this.level() === 'AGENCY'
          ? await firstValueFrom(this.contracts.saveAgencyTemplate(agencyId, request))
          : this.level() === 'BUILDING'
            ? await firstValueFrom(this.contracts.saveBuildingTemplate(agencyId, Number(this.buildingId()), request))
            : await firstValueFrom(this.contracts.saveRoomTemplate(
              agencyId, Number(this.buildingId()), Number(this.roomId()), request));

      // The server sanitizes on save, so the response is the document of record
      // — not what the editor sent. Anything stripped has to be visible now.
      this.template.set(saved);
      this.form.patchValue({ content: saved.content ?? '', changeNote: '' });
      // Saved content is the sanitized version, so anything rendered before it is stale.
      this.renderedFrom = null;

      // Against what was stored, not what was sent: the sanitizer may have
      // dropped an attribute, and a check of the draft would not have seen it.
      void this.validate();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async reset(): Promise<void> {
    if (!await this.confirm.ask({
      title: `Discard this ${this.levelNoun()}'s own document and go back to inheriting? The current version stays in history.`,
      confirmLabel: 'Discard',
      destructive: true
    })) {
      return;
    }

    this.resetting.set(true);
    this.saveError.set(null);

    try {
      const agencyId = Number(this.agencyId());

      if (this.level() === 'AGENCY') {
        await firstValueFrom(this.contracts.resetAgencyTemplate(agencyId));
      } else if (this.level() === 'BUILDING') {
        await firstValueFrom(this.contracts.resetBuildingTemplate(agencyId, Number(this.buildingId())));
      } else {
        await firstValueFrom(this.contracts.resetRoomTemplate(agencyId, Number(this.buildingId()), Number(this.roomId())));
      }

      await this.reload();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.resetting.set(false);
    }
  }

  showEdit(): void {
    this.tab.set('edit');
  }


  /**
   * What this property still has to record before a lease will generate.
   *
   * Advisory like the validator: a failed check must not read as a failed
   * page, and generation refuses on its own regardless.
   */
  private async loadBuildingCount(agencyId: number): Promise<void> {
    try {
      const page = await firstValueFrom(this.housing.getBuildingsForAgency(agencyId, { page: 0, size: 1 }));
      this.agencyBuildingCount.set(page.pagination?.totalElements ?? page.items.length);
    } catch {
      this.agencyBuildingCount.set(null);
    }
  }

  async checkReadiness(): Promise<void> {
    const agencyId = this.numericAgencyId();
    if (!agencyId) {
      return;
    }

    this.checkingReadiness.set(true);
    if (this.numericBuildingId() === null) {
      void this.loadBuildingCount(agencyId);
    }

    try {
      this.readiness.set(await firstValueFrom(this.contracts.getReadiness(agencyId, {
        buildingId: this.numericBuildingId(),
        roomId: this.numericRoomId()
      })));
    } catch {
      this.readiness.set(null);
    } finally {
      this.checkingReadiness.set(false);
    }
  }

  /**
   * What is wrong with the document, and what somebody still has to type
   * before it can produce a lease.
   *
   * Worth its own request even though generation checks the same things: the
   * renderer refuses at generation time, which is correct and far too late —
   * the landlord finds out while trying to issue a real tenancy. Here it is a
   * panel under the editor.
   */
  async validate(): Promise<void> {
    const agencyId = this.numericAgencyId();
    if (!agencyId) {
      return;   // the master editor has no agency to validate against
    }

    this.validating.set(true);

    try {
      this.validation.set(await firstValueFrom(
        this.contracts.validateTemplate(agencyId, this.form.getRawValue().content)));
    } catch {
      // Advisory. A failed check must not look like a failed save, and the
      // generation path refuses on its own regardless.
      this.validation.set(null);
    } finally {
      this.validating.set(false);
    }
  }

  /** Renders on arrival, and only when the draft has actually moved on. */
  async showPreview(): Promise<void> {
    this.tab.set('preview');

    const content = this.form.getRawValue().content;
    if (this.renderedFrom === content && this.rendered() !== null) {
      return;
    }

    this.previewing.set(true);
    this.previewError.set(null);

    try {
      const result = await firstValueFrom(this.contracts.renderPreview(
        Number(this.agencyId()),
        content,
        this.buildingId() ? Number(this.buildingId()) : null
      ));

      this.rendered.set(this.sanitizer.bypassSecurityTrustHtml(result.rendered));
      this.previewWarnings.set(result.warnings ?? []);
      this.renderedFrom = content;
    } catch (error) {
      this.previewError.set(toApiError(error));
      this.rendered.set(null);
      this.renderedFrom = null;
    } finally {
      this.previewing.set(false);
    }
  }

  /** Loads an old version into the editor; nothing is written until Save. */
  async openCascade(): Promise<void> {
    this.cascadeOpen.set(true);
    this.cascadeError.set(null);
    await this.loadCascadePreview();
  }

  async onCascadeScope(event: Event): Promise<void> {
    this.cascadeScope.set((event.target as HTMLSelectElement).value as CascadeScope);
    void this.loadCascadePreview();
  }

  async applyCascade(): Promise<void> {
    const summary = this.cascadePreview();
    const buildings = summary?.affectedBuildings ?? 0;
    const rooms = this.cascadeScope() === 'ALL' ? summary?.affectedRooms ?? 0 : 0;

    if (!await this.confirm.ask({
      title: `Discard ${count(buildings, 'building document')}`
        + `${rooms ? ` and ${count(rooms, 'room document')}` : ''}?`,
      confirmLabel: 'Discard',
      destructive: true
    })) {
      return;
    }

    this.cascading.set(true);
    this.cascadeError.set(null);

    try {
      await firstValueFrom(this.contracts.applyCascade(Number(this.agencyId()), this.cascadeScope()));
      this.cascadeOpen.set(false);
      await this.reload();
    } catch (error) {
      this.cascadeError.set(toApiError(error));
    } finally {
      this.cascading.set(false);
    }
  }

  sourceLabel(source: ContractLevel): string {
    switch (source) {
      case 'MASTER': return 'the platform master';
      case 'AGENCY': return 'the agency';
      case 'BUILDING': return 'the building';
      default: return 'the room';
    }
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  private fetchTemplate(): Promise<ContractTemplateDetail> {
    const agencyId = Number(this.agencyId());

    switch (this.level()) {
      case 'MASTER':
        return firstValueFrom(this.contracts.getMasterTemplate());
      case 'AGENCY':
        return firstValueFrom(this.contracts.getAgencyTemplate(agencyId));
      case 'BUILDING':
        return firstValueFrom(this.contracts.getBuildingTemplate(agencyId, Number(this.buildingId())));
      default:
        return firstValueFrom(this.contracts.getRoomTemplate(agencyId, Number(this.buildingId()), Number(this.roomId())));
    }
  }

  private async loadCascadePreview(): Promise<void> {
    try {
      this.cascadePreview.set(await firstValueFrom(
        this.contracts.previewCascade(Number(this.agencyId()), this.cascadeScope())
      ));
    } catch (error) {
      this.cascadeError.set(toApiError(error));
    }
  }
}

/** Route inputs are strings; anything that is not a positive number is absent. */
function toId(raw: string | undefined): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The TypeScript counterpart of the `plural` pipe, for dialog copy. */
function count(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : singular + 's'}`;
}
