import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
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
import { ConfirmService } from '../../../shared/services/confirm.service';
import {
  CascadeScope,
  ContractCascadePreview,
  ContractEditorCatalogue,
  ContractLevel,
  ContractTemplateDetail,
  ContractTemplateHistoryEntry
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
            <div class="button-row">
              @if (showHistory()) {
                <button type="button" class="btn btn-secondary" (click)="toggleHistory()">
                  {{ historyOpen() ? 'Hide history' : 'History' }}
                </button>
              }
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
                <span class="status-chip status-chip--info">Platform master</span>
                @if (detail.currentMasterVersion) {
                  <span class="muted">Version {{ detail.currentMasterVersion }}</span>
                }
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

            @if (!detail.customized && level() !== 'MASTER') {
              <p class="hint">
                This {{ levelNoun() }} follows {{ sourceLabel(detail.source) }}. Saving an edit here
                takes a copy — it stops following, and later changes above will not reach it.
              </p>
            }
          }

          <!--
            Two views of one document, so they are alternatives rather than a
            stack: side by side vertically, the preview is something you scroll
            past instead of something you check the edit against, and the page
            becomes two full documents tall.
          -->
          <div class="tabs" role="tablist">
            <button
              type="button"
              class="tabs__tab"
              role="tab"
              [class.tabs__tab--active]="tab() === 'edit'"
              [attr.aria-selected]="tab() === 'edit'"
              (click)="showEdit()"
            >Edit</button>
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
          </div>

          <form class="stack" [hidden]="tab() !== 'edit'" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
            <app-rich-text-editor
              formControlName="content"
              [features]="catalogue()?.allowedFeatures ?? []"
              [variables]="catalogue()?.variables ?? []"
              [ariaLabel]="title()"
            />

            <p class="hint">
              Insert values rather than typing them: a rent typed as text is a second copy of a
              number that lives on the room, and the two drift. Inserted values are resolved when
              each lease is generated, so a change to the room, building or agency reaches every
              contract issued afterwards.
            </p>

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
              @if (canCascade()) {
                <button type="button" class="btn btn-secondary" [disabled]="cascading()" (click)="openCascade()">
                  Apply to all buildings
                </button>
              }
            </div>
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
              <p class="hint">
                Rendered with sample values — there is no tenant or lease until one is generated,
                so this checks the wording, not the figures. A real lease resolves each value from
                the room, its building and the agency at the moment it is issued.
              </p>
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
                  <strong>{{ summary.affectedBuildings ?? 0 }}</strong> building(s) would be reset@if (cascadeScope() === 'ALL') {
                    <span>, along with <strong>{{ summary.affectedRooms ?? 0 }}</strong> room-level document(s)</span>
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

        @if (historyOpen()) {
          <app-section-card title="Earlier versions">
            @if (history().length === 0) {
              <p class="muted">Nothing retired yet — this is the first version at this level.</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr><th>Retired</th><th>Created</th><th>By</th><th class="actions-col">Actions</th></tr>
                  </thead>
                  <tbody>
                    @for (entry of history(); track entry.id) {
                      <tr>
                        <td>{{ formatDate(entry.retiredAt) }}</td>
                        <td>{{ formatDate(entry.createdAt) }}</td>
                        <td>{{ entry.createdBy || '-' }}</td>
                        <td class="actions-col">
                          <button type="button" class="btn btn-secondary btn-sm" (click)="restore(entry)">
                            Load into editor
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
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

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly template = signal<ContractTemplateDetail | null>(null);
  readonly catalogue = signal<ContractEditorCatalogue | null>(null);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly resetting = signal(false);

  readonly tab = signal<'edit' | 'preview'>('edit');
  readonly previewing = signal(false);
  readonly rendered = signal<SafeHtml | null>(null);
  readonly previewWarnings = signal<string[] | null>(null);
  readonly previewError = signal<ApiError | null>(null);
  /** The draft the current preview was rendered from, so switching tabs back and forth is free. */
  private renderedFrom: string | null = null;

  readonly historyOpen = signal(false);
  readonly history = signal<ContractTemplateHistoryEntry[]>([]);

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
      case 'AGENCY': return 'Applies to every building and room in the agency';
      case 'BUILDING': return 'Applies to every room in this building';
      default: return 'Applies to leases for this room only';
    }
  });

  readonly levelNoun = computed(() =>
    this.level() === 'ROOM' ? 'room' : this.level() === 'BUILDING' ? 'building' : 'agency');

  readonly parentLabel = computed(() =>
    this.level() === 'ROOM' ? 'The building document'
      : this.level() === 'BUILDING' ? 'The agency document'
        : 'The platform master');

  /** Only the agency level owns the buildings a cascade would touch. */
  readonly canCascade = computed(() => this.level() === 'AGENCY' && this.template()?.customized === true);
  readonly showHistory = computed(() => this.level() !== 'MASTER');

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
        firstValueFrom(this.contracts.getEditorCatalogue()),
        this.fetchTemplate()
      ]);

      this.catalogue.set(catalogue);
      this.template.set(template);
      this.form.patchValue({ content: template.content ?? '', changeNote: '' });
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

  async toggleHistory(): Promise<void> {
    this.historyOpen.update((open) => !open);

    if (!this.historyOpen() || this.history().length > 0) {
      return;
    }

    try {
      const agencyId = Number(this.agencyId());
      const entries = this.level() === 'AGENCY'
        ? await firstValueFrom(this.contracts.getAgencyHistory(agencyId))
        : this.level() === 'BUILDING'
          ? await firstValueFrom(this.contracts.getBuildingHistory(agencyId, Number(this.buildingId())))
          : await firstValueFrom(this.contracts.getRoomHistory(agencyId, Number(this.buildingId()), Number(this.roomId())));

      this.history.set(entries);
    } catch (error) {
      this.saveError.set(toApiError(error));
    }
  }

  /** Loads an old version into the editor; nothing is written until Save. */
  restore(entry: ContractTemplateHistoryEntry): void {
    this.form.patchValue({ content: entry.content, changeNote: 'Restored an earlier version' });
    this.historyOpen.set(false);
  }

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
      title: `Discard ${buildings} building document(s)${rooms ? ` and ${rooms} room document(s)` : ''}?`,
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
