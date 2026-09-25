import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, firstValueFrom, forkJoin } from 'rxjs';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { AddressesService } from '../addresses.service';
import { CityOption, CountyOption, SubCountyOption, TownOption, WardOption } from '../models/address.models';

/**
 * Kenya numbers places twice. Counties split into sub-counties and then wards
 * for administration; they also hold cities that hold towns, which is how
 * people say where they live. Neither branch nests inside the other, so opening
 * a county shows both of its child lists side by side.
 */
type Level = 'county' | 'subCounty' | 'ward' | 'city' | 'town';

type Place = CountyOption | SubCountyOption | WardOption | CityOption | TownOption;

/** Whether the place in the editor may be deleted: only one with nothing under it. */
type DeleteState = 'checking' | 'allowed' | 'blocked';

const LABELS: Record<Level, { one: string; many: string }> = {
  county: { one: 'county', many: 'Counties' },
  subCounty: { one: 'sub-county', many: 'Sub-counties' },
  ward: { one: 'ward', many: 'Wards' },
  city: { one: 'city', many: 'Cities' },
  town: { one: 'town', many: 'Towns' }
};

/** The level a row opens onto, if any. Wards and towns are leaves. */
const DRILLS: Partial<Record<Level, true>> = { county: true, subCounty: true, city: true };

@Component({
  selector: 'app-address-management-page',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    PermissionGateComponent,
    SectionCardComponent,
    SearchableSelectComponent,
    FieldErrorComponent,
    ErrorCardComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (county(); as current) {
        <nav class="crumbs" aria-label="Place path">
          <button type="button" class="link-button" (click)="goToCounties()">Counties</button>
          <svg class="crumbs__sep" aria-hidden="true" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
          @if (subCounty() || city()) {
            <button type="button" class="link-button" (click)="goToCounty()">{{ current.name }}</button>
            <svg class="crumbs__sep" aria-hidden="true" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
            <span aria-current="page">{{ subCounty()?.name || city()?.name }}</span>
          } @else {
            <span aria-current="page">{{ current.name }}</span>
          }
        </nav>
      }

      @if (actionError(); as apiError) {
        <app-error-card title="Unable to complete that" [message]="apiError.message" [details]="apiError.details" />
      }

      @if (subCounty()) {
        <ng-container *ngTemplateOutlet="levelCard; context: { $implicit: 'ward' }" />
      } @else if (city()) {
        <ng-container *ngTemplateOutlet="levelCard; context: { $implicit: 'town' }" />
      } @else if (county()) {
        <div class="branches">
          <ng-container *ngTemplateOutlet="levelCard; context: { $implicit: 'subCounty' }" />
          <ng-container *ngTemplateOutlet="levelCard; context: { $implicit: 'city' }" />
        </div>
      } @else {
        <ng-container *ngTemplateOutlet="levelCard; context: { $implicit: 'county' }" />
      }
    </section>

    <ng-template #levelCard let-raw>
      @let level = asLevel(raw);
      <app-section-card [title]="labels[level].many">
        <ng-container actions>
          <app-permission-gate [permissions]="['ADDRESS_WRITE']">
            <button type="button" class="icon-action" (click)="openCreate(level)"
                    [attr.aria-label]="'Add ' + labels[level].one" [title]="'Add ' + labels[level].one">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-plus" /></svg>
            </button>
          </app-permission-gate>
        </ng-container>

        @if (loading()[level]) {
          <app-loading-state [label]="'Loading ' + labels[level].many.toLowerCase() + '...'" />
        } @else if (errors()[level]; as message) {
          <app-error-state [message]="message" (retry)="reload(level)" />
        } @else if (items(level).length === 0) {
          <p class="muted">None yet.</p>
        } @else {
          <input type="search" class="place-search" [value]="queries()[level]" (input)="setQuery(level, $event)"
                 [placeholder]="'Search ' + labels[level].many.toLowerCase()" [attr.aria-label]="'Search ' + labels[level].many.toLowerCase()">

          @if (visible(level); as rows) {
            @if (rows.length === 0) {
              <p class="muted">No match.</p>
            } @else {
              <ul class="places">
                @for (place of rows; track place.id) {
                  <li class="place">
                    @if (drills[level]) {
                      <button type="button" class="place__open" (click)="open(level, place)">
                        <ng-container *ngTemplateOutlet="placeText; context: { $implicit: place, level: level }" />
                        <svg class="place__chevron" aria-hidden="true" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
                      </button>
                    } @else {
                      <div class="place__open place__open--static">
                        <ng-container *ngTemplateOutlet="placeText; context: { $implicit: place, level: level }" />
                      </div>
                    }
                    <app-permission-gate [permissions]="['ADDRESS_WRITE']">
                      <button type="button" class="icon-action" (click)="openEdit(level, place)"
                              [attr.aria-label]="'Edit ' + place.name" title="Edit">
                        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                      </button>
                    </app-permission-gate>
                  </li>
                }
              </ul>
            }
          }
        }
      </app-section-card>
    </ng-template>

    <ng-template #placeText let-place let-level="level">
      <span class="place__text">
        <strong>{{ place.name }}</strong>
        @if (level === 'county' && place.code) {
          <span class="muted">{{ place.code }}</span>
        }
      </span>
      @if (place.isActive === false) {
        <span class="status-chip status-chip--danger">Inactive</span>
      }
    </ng-template>

    @if (editor(); as edit) {
      <div class="modal-backdrop" (click)="closeEditor()">
        <section class="modal-card panel" role="dialog" aria-modal="true" [attr.aria-label]="editorTitle()"
                 (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2>{{ editorTitle() }}</h2>
            <button type="button" class="icon-action" (click)="closeEditor()" aria-label="Close" title="Close"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg></button>
          </header>

          @if (modalError(); as apiError) {
            <app-error-card
              [title]="modalErrorTitle(apiError)"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
            <div class="grid-auto modal-grid">
              <!-- Moving a place is an edit; a new one goes under the level on screen. -->
              @if (edit.id && parentOptions().length > 0) {
                <label class="field">
                  <span>{{ parentLabel() }}</span>
                  <app-searchable-select formControlName="parentId" [options]="parentOptions()" [required]="true"
                                         [placeholder]="'Select ' + parentLabel().toLowerCase()" />
                </label>
              }
              <label class="field">
                <span>Name</span>
                <input formControlName="name">
                <app-field-error [control]="form.controls.name" label="Name" />
              </label>
              @if (edit.level === 'county') {
                <label class="field">
                  <span>Code</span>
                  <input formControlName="code">
                </label>
              }
              @if (hasActiveFlag(edit.level)) {
                <label class="checkbox-field">
                  <input type="checkbox" formControlName="isActive">
                  <span>Active</span>
                </label>
              }
            </div>

            <div class="modal-foot">
              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : edit.id ? 'Save' : 'Create' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancel</button>
              </div>

              <!-- Only a place with nothing under it can go; the rest would orphan their children. -->
              @if (edit.id) {
                <app-permission-gate [permissions]="['ADDRESS_DELETE']">
                  @if (deleteState() === 'allowed') {
                    <button type="button" class="btn btn-danger" [disabled]="saving()" (click)="deleteEdited()">Delete</button>
                  } @else if (deleteState() === 'blocked') {
                    <small class="muted">Has places under it — can't be deleted.</small>
                  }
                </app-permission-gate>
              }
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styles: [`
    .crumbs {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem;
      font-size: 0.95rem;
    }

    .crumbs [aria-current] { font-weight: 700; }

    .crumbs__sep {
      width: 0.9rem;
      height: 0.9rem;
      fill: none;
      stroke: var(--text-muted);
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .branches {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      align-items: start;
    }

    @media (max-width: 900px) {
      .branches { grid-template-columns: 1fr; }
    }

    .place-search { width: 100%; }

    .places {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }

    /* Centred, never stretched: a two-line name must not make a tall edit icon. */
    .place {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .place__open {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      text-align: left;
      font: inherit;
      cursor: pointer;
    }

    .place__open:hover { border-color: var(--border-strong); background: var(--primary-tint); }
    .place__open--static { cursor: default; }
    .place__open--static:hover { border-color: var(--border); background: var(--surface); }

    .place__text {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 0.1rem;
    }

    .place__text strong,
    .place__text .muted {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .place__chevron {
      width: 1rem;
      height: 1rem;
      flex: none;
      fill: none;
      stroke: var(--text-muted);
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgba(33, 43, 38, 0.45);
      backdrop-filter: blur(6px);
    }

    .modal-card {
      width: min(100%, 520px);
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
      max-height: calc(100vh - 2rem);
      overflow: auto;
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .modal-head h2 { margin: 0; }

    .modal-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
    }

    /* Commit and escape on the right; the destructive action apart, on the left. */
    .modal-foot {
      display: flex;
      flex-direction: row-reverse;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressManagementPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly addresses = inject(AddressesService);
  private readonly confirmDialog = inject(ConfirmService);

  readonly labels = LABELS;
  readonly drills = DRILLS;

  // The path drilled into. A sub-county and a city are alternatives under a county.
  readonly county = signal<CountyOption | null>(null);
  readonly subCounty = signal<SubCountyOption | null>(null);
  readonly city = signal<CityOption | null>(null);

  private readonly lists = signal<Record<Level, Place[]>>({ county: [], subCounty: [], ward: [], city: [], town: [] });
  readonly loading = signal<Partial<Record<Level, boolean>>>({});
  readonly errors = signal<Partial<Record<Level, string | null>>>({});
  readonly queries = signal<Record<Level, string>>({ county: '', subCounty: '', ward: '', city: '', town: '' });

  /** A refused delete belongs next to the lists, not in place of one. */
  readonly actionError = signal<ApiError | null>(null);
  /** The whole rejection, so a 400's per-field details survive (§31.2). */
  readonly modalError = signal<ApiError | null>(null);
  /** Which button failed: a 409 on save is a duplicate, on delete it is "still has places under it". */
  private readonly failedAction = signal<'save' | 'delete'>('save');

  readonly editor = signal<{ level: Level; id: number | null } | null>(null);
  readonly saving = signal(false);
  readonly deleteState = signal<DeleteState>('checking');

  readonly form = this.fb.group({
    parentId: [''],
    name: ['', Validators.required],
    code: [''],
    isActive: [true]
  });

  readonly editorTitle = computed(() => {
    const edit = this.editor();
    return edit ? `${edit.id ? 'Edit' : 'Add'} ${LABELS[edit.level].one}` : '';
  });

  readonly parentLabel = computed(() => {
    switch (this.editor()?.level) {
      case 'city':
      case 'subCounty':
        return 'County';
      case 'town':
        return 'City';
      case 'ward':
        return 'Sub-county';
      default:
        return '';
    }
  });

  /** Where an edited place may move to: its siblings' parent level, as loaded. */
  readonly parentOptions = computed<SelectOption<string>[]>(() => {
    const parentLevel: Partial<Record<Level, Level>> = { city: 'county', subCounty: 'county', town: 'city', ward: 'subCounty' };
    const level = this.editor()?.level;
    const source = level ? parentLevel[level] : undefined;
    return source ? this.lists()[source].map((place) => ({ value: String(place.id), label: place.name })) : [];
  });

  async ngOnInit(): Promise<void> {
    await this.reload('county');
  }

  items(level: Level): Place[] {
    return this.lists()[level];
  }

  /** Filtered on the page: each list is one parent's children, already in hand. */
  visible(level: Level): Place[] {
    const query = this.queries()[level].trim().toLowerCase();
    const items = this.lists()[level];
    if (!query) {
      return items;
    }

    return items.filter((place) =>
      place.name.toLowerCase().includes(query)
      || ('code' in place && (place.code ?? '').toLowerCase().includes(query)));
  }

  setQuery(level: Level, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.queries.update((queries) => ({ ...queries, [level]: value }));
  }

  /** Types the untyped template context. */
  asLevel(value: unknown): Level {
    return value as Level;
  }

  hasActiveFlag(level: Level): boolean {
    // Sub-counties and wards are set by law, so there is nothing to switch off.
    return level === 'county' || level === 'city' || level === 'town';
  }

  // ---- navigation ----

  async open(level: Level, place: Place): Promise<void> {
    this.actionError.set(null);

    if (level === 'county') {
      this.county.set(place as CountyOption);
      this.clearQueries('subCounty', 'city');
      await Promise.all([this.reload('subCounty'), this.reload('city')]);
    } else if (level === 'subCounty') {
      this.subCounty.set(place as SubCountyOption);
      this.clearQueries('ward');
      await this.reload('ward');
    } else if (level === 'city') {
      this.city.set(place as CityOption);
      this.clearQueries('town');
      await this.reload('town');
    }
  }

  goToCounties(): void {
    this.actionError.set(null);
    this.county.set(null);
    this.subCounty.set(null);
    this.city.set(null);
  }

  goToCounty(): void {
    this.actionError.set(null);
    this.subCounty.set(null);
    this.city.set(null);
  }

  private clearQueries(...levels: Level[]): void {
    this.queries.update((queries) => {
      const next = { ...queries };
      levels.forEach((level) => next[level] = '');
      return next;
    });
  }

  // ---- loading ----

  async reload(level: Level): Promise<void> {
    const request = this.fetch(level);
    if (!request) {
      this.setList(level, []);
      return;
    }

    this.loading.update((state) => ({ ...state, [level]: true }));
    this.errors.update((state) => ({ ...state, [level]: null }));

    try {
      this.setList(level, await firstValueFrom(request));
    } catch (error) {
      this.setList(level, []);
      this.errors.update((state) => ({ ...state, [level]: extractErrorMessage(error) }));
    } finally {
      this.loading.update((state) => ({ ...state, [level]: false }));
    }
  }

  /** The request for a level's list under the path on screen; null without a parent. */
  private fetch(level: Level): Observable<Place[]> | null {
    const countyId = this.county()?.id;
    switch (level) {
      case 'county':
        return this.addresses.getCounties();
      case 'subCounty':
        return countyId ? this.addresses.getSubCountiesByCounty(countyId) : null;
      case 'city':
        return countyId ? this.addresses.getCitiesByCounty(countyId) : null;
      case 'ward': {
        const id = this.subCounty()?.id;
        return id ? this.addresses.getWardsBySubCounty(id) : null;
      }
      case 'town': {
        const id = this.city()?.id;
        return id ? this.addresses.getTownsByCity(id) : null;
      }
    }
  }

  private setList(level: Level, items: Place[]): void {
    this.lists.update((lists) => ({ ...lists, [level]: items }));

    // Keep the breadcrumb's copy of a renamed place current.
    const refresh = <T extends Place>(current: T | null, set: (value: T) => void) => {
      const updated = current && items.find((item) => item.id === current.id);
      if (updated) {
        set(updated as T);
      }
    };
    if (level === 'county') refresh(this.county(), (value) => this.county.set(value));
    if (level === 'subCounty') refresh(this.subCounty(), (value) => this.subCounty.set(value));
    if (level === 'city') refresh(this.city(), (value) => this.city.set(value));
  }

  // ---- editor ----

  openCreate(level: Level): void {
    this.modalError.set(null);
    this.form.reset({ parentId: this.currentParentId(level), name: '', code: '', isActive: true });
    this.editor.set({ level, id: null });
  }

  openEdit(level: Level, place: Place): void {
    this.modalError.set(null);
    this.form.reset({
      parentId: this.parentIdOf(level, place) ?? this.currentParentId(level),
      name: place.name,
      code: 'code' in place ? place.code ?? '' : '',
      isActive: !('isActive' in place) || place.isActive !== false
    });
    this.editor.set({ level, id: place.id });
    void this.checkDeletable(level, place.id);
  }

  closeEditor(): void {
    this.editor.set(null);
    this.modalError.set(null);
  }

  async save(): Promise<void> {
    const edit = this.editor();
    if (!edit) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.modalError.set(null);

    try {
      await firstValueFrom(this.saveRequest(edit.level, edit.id));
      this.closeEditor();
      await this.reload(edit.level);
    } catch (error) {
      this.failedAction.set('save');
      this.modalError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  modalErrorTitle(error: ApiError): string {
    if (this.failedAction() === 'delete') {
      return error.status === 409 ? "Can't delete — still in use" : 'Unable to delete';
    }
    return error.status === 409 ? 'Already exists' : 'Unable to save';
  }

  async deleteEdited(): Promise<void> {
    const edit = this.editor();
    if (!edit?.id) {
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      title: `Delete ${this.form.controls.name.value}?`,
      message: null,
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    this.modalError.set(null);

    try {
      await firstValueFrom(this.deleteRequest(edit.level, edit.id));
      this.closeEditor();
      await this.reload(edit.level);
    } catch (error) {
      // The server may still refuse — places added since the check, say — and says why.
      this.failedAction.set('delete');
      this.modalError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * The lists carry no child counts, so the editor asks for the children of the
   * one place it has open. A failed check leaves Delete on offer and the server
   * refuses what it must.
   */
  private async checkDeletable(level: Level, id: number): Promise<void> {
    this.deleteState.set('checking');

    const children: Observable<unknown[]>[] =
      level === 'county' ? [this.addresses.getSubCountiesByCounty(id), this.addresses.getCitiesByCounty(id)]
      : level === 'subCounty' ? [this.addresses.getWardsBySubCounty(id)]
      : level === 'city' ? [this.addresses.getTownsByCity(id)]
      : [];

    let state: DeleteState = 'allowed';
    if (children.length > 0) {
      try {
        const results = await firstValueFrom(forkJoin(children));
        state = results.some((list) => list.length > 0) ? 'blocked' : 'allowed';
      } catch {
        state = 'allowed';
      }
    }

    // The editor may have moved on to another place while this was in flight.
    if (this.editor()?.id === id && this.editor()?.level === level) {
      this.deleteState.set(state);
    }
  }

  private saveRequest(level: Level, id: number | null): Observable<unknown> {
    const { parentId, name, code, isActive } = this.form.getRawValue();
    const parent = Number(parentId) || 0;
    const trimmed = name.trim();

    switch (level) {
      case 'county': {
        const body = { name: trimmed, code: code.trim() || null, isActive };
        return id ? this.addresses.updateCounty(id, body) : this.addresses.createCounty(body);
      }
      case 'city': {
        const body = { name: trimmed, countyId: parent, isActive };
        return id ? this.addresses.updateCity(id, body) : this.addresses.createCity(body);
      }
      case 'town': {
        const body = { name: trimmed, cityId: parent, isActive };
        return id ? this.addresses.updateTown(id, body) : this.addresses.createTown(body);
      }
      case 'subCounty': {
        const body = { name: trimmed, countyId: parent };
        return id ? this.addresses.updateSubCounty(id, body) : this.addresses.createSubCounty(body);
      }
      case 'ward': {
        const body = { name: trimmed, subCountyId: parent };
        return id ? this.addresses.updateWard(id, body) : this.addresses.createWard(body);
      }
    }
  }

  private deleteRequest(level: Level, id: number): Observable<void> {
    switch (level) {
      case 'county': return this.addresses.deleteCounty(id);
      case 'subCounty': return this.addresses.deleteSubCounty(id);
      case 'ward': return this.addresses.deleteWard(id);
      case 'city': return this.addresses.deleteCity(id);
      case 'town': return this.addresses.deleteTown(id);
    }
  }

  /** The parent of a new place: whatever is open one level up. */
  private currentParentId(level: Level): string {
    const id = level === 'city' || level === 'subCounty' ? this.county()?.id
      : level === 'town' ? this.city()?.id
      : level === 'ward' ? this.subCounty()?.id
      : null;
    return id ? String(id) : '';
  }

  private parentIdOf(level: Level, place: Place): string | null {
    const id = level === 'city' || level === 'subCounty' ? (place as CityOption | SubCountyOption).countyId
      : level === 'town' ? (place as TownOption).cityId
      : level === 'ward' ? (place as WardOption).subCountyId
      : null;
    return id ? String(id) : null;
  }
}
