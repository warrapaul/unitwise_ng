import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { RoutePaths } from '../../../core/routes/route-paths';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { BackDirective } from '../../../shared/directives/back.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import {
  BillingCatalog,
  BillingPlan,
  describePrice,
  FEATURE_DESCRIPTIONS,
  featureLabel,
  kes,
  limitLabel,
  modeFields,
  PlanHistoryEntry,
  priceForMode,
  PRICING_MODES,
  PricingMode
} from '../billing.models';
import { BillingService } from '../billing.service';

/** Example room counts the price preview is worked out at. */
const EXAMPLE_ROOMS = [18, 25, 60];

/**
 * A plan: its details, its price (one of five pricing modes, all the same three numbers
 * underneath), the features it includes and its caps. Features and caps come from the server's
 * catalogue, so a plan can only use codes the code actually checks. The price is copied to each
 * agency when it joins, so a price edit reaches new agencies only; features and caps reach every
 * agency on the plan at once — saving says how many that is.
 */
@Component({
  selector: 'app-plan-form-page',
  standalone: true,
  imports: [RouterLink, MoneyInputDirective, ReactiveFormsModule, FormFeedbackDirective, BackDirective, DialogComponent, SectionCardComponent,
    LoadingStateComponent, ErrorStateComponent, ErrorCardComponent, FieldErrorComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading the plan…" />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="askToSave()">
          <app-section-card [title]="isEdit() ? form.controls.name.value || 'Edit plan' : 'New plan'" [subtitle]="isEdit() ? agencyCountText() : ''">
            <div class="form-grid">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" maxlength="100">
                <app-field-error [control]="form.controls.name" label="Name" />
              </label>
              @if (isEdit()) {
                <div class="field">
                  <span>Code</span>
                  <p class="locked"><span aria-hidden="true">🔒</span> <span class="mono">{{ form.controls.code.value }}</span></p>
                  <small class="hint">Fixed once created: invoices and settings refer to it.</small>
                </div>
              } @else {
                <label class="field">
                  <span>Code</span>
                  <input formControlName="code" class="mono" autocapitalize="characters">
                  <small class="hint">Capital letters, digits and underscores, e.g. GROWTH. Can't be changed later.</small>
                  <app-field-error [control]="form.controls.code" label="Code" />
                </label>
              }
              <label class="field">
                <span>Free trial <span class="muted">(optional)</span></span>
                <span class="input-suffix"><input type="number" min="1" max="365" formControlName="trialDays" inputmode="numeric"><span class="input-suffix__unit">days</span></span>
                <small class="hint">Leave empty for no trial.</small>
                <app-field-error [control]="form.controls.trialDays" label="Trial" />
              </label>
              <label class="field">
                <span>Order in the plan list</span>
                <input type="number" min="0" formControlName="sortOrder" inputmode="numeric">
                <small class="hint">Lower comes first, for landlords and on the Plans page.</small>
              </label>
            </div>
            <label class="field field--wide">
              <span>Description <span class="muted">(optional)</span></span>
              <textarea formControlName="description" rows="2" maxlength="300"></textarea>
              <small class="hint">Shown to landlords under the plan's name. {{ form.controls.description.value.length }}/300</small>
            </label>
            <div class="switches">
              <label class="switch-row">
                <span><strong>Can be given to agencies</strong><br><span class="muted">Off retires the plan: nobody new joins it; agencies on it stay.</span></span>
                <input type="checkbox" role="switch" class="switch" formControlName="active">
              </label>
              <label class="switch-row">
                <span><strong>Offered to landlords</strong><br><span class="muted">In the plan list landlords choose from. Off keeps it for deals you set up yourself.</span></span>
                <input type="checkbox" role="switch" class="switch" formControlName="publicPlan">
              </label>
            </div>
            @if (retiringWithAgencies()) {
              <p class="alert alert-warning" role="alert">{{ agencyCount() }} {{ agencyCount() === 1 ? 'agency is' : 'agencies are' }} on this plan. They stay on it; nobody new can join.</p>
            }
          </app-section-card>

          <app-section-card title="Price">
            <p class="alert alert-info"><strong>Applies to new agencies only.</strong>@if (isEdit() && agencyCount()) { The {{ agencyCount() }} {{ agencyCount() === 1 ? 'agency' : 'agencies' }} on it keep the price they joined at. }</p>
            <div class="form-grid">
              <label class="field">
                <span>How it is charged</span>
                <select (change)="pickMode($any($event.target).value)">
                  @for (option of modes; track option.mode) { <option [value]="option.mode" [selected]="option.mode === mode()">{{ option.label }}</option> }
                </select>
                <small class="hint">{{ modeHint() }}</small>
              </label>
              @if (fields().base) {
                <label class="field"><span>Monthly base fee</span><span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="baseFee" aria-label="Monthly base fee in KES"></span>
                  <app-field-error [control]="form.controls.baseFee" label="Monthly base fee" /></label>
              }
              @if (fields().included) {
                <label class="field"><span>Rooms the base fee covers</span><span class="input-suffix"><input type="number" min="1" formControlName="includedRooms" inputmode="numeric"><span class="input-suffix__unit">rooms</span></span>
                  <app-field-error [control]="form.controls.includedRooms" label="Rooms covered" /></label>
              }
              @if (fields().extra) {
                <label class="field"><span>{{ fields().included ? 'Price per extra room' : 'Price per room' }}</span>
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="extraRoomPrice" aria-label="Price per room in KES"></span>
                  <app-field-error [control]="form.controls.extraRoomPrice" label="Price per room" /></label>
              }
            </div>
            <div class="preview" aria-live="polite">
              <p class="preview__title"><strong>{{ preview() }}</strong></p>
              <table class="table table--packed">
                <thead><tr><th scope="col">At</th><th scope="col" class="num">A month</th></tr></thead>
                <tbody>@for (row of examples(); track row.rooms) { <tr><td>{{ row.rooms }} rooms</td><td class="num">{{ money(row.total) }}</td></tr> }</tbody>
              </table>
              <p class="muted small">Rooms that existed at any time in a month are billed, after the month ends.</p>
            </div>
          </app-section-card>

          <app-section-card title="Features and limits" [subtitle]="isEdit() ? 'Changes here reach every agency on the plan as soon as you save.' : ''">
            <fieldset class="group">
              <legend>Features included</legend>
              @for (code of catalog()?.features ?? []; track code) {
                <label class="check">
                  <input type="checkbox" [checked]="features().has(code)" (change)="toggleFeature(code, $any($event.target).checked)">
                  <span><strong>{{ feature(code) }}</strong>@if (featureHint(code); as hint) { <br><span class="muted">{{ hint }}</span> }</span>
                </label>
              }
            </fieldset>
            <div class="alert alert-warning">
              A feature left out here is off for every agency on the plan. To give one agency a feature or a higher limit anyway, use
              <strong>Manage → Overrides</strong> on that agency's billing page.
            </div>
            <fieldset class="group">
              <legend>Limits</legend>
              @for (key of catalog()?.limits ?? []; track key) {
                <div class="limit">
                  <label class="field limit__field">
                    <span>{{ limit(key) }}</span>
                    <span class="input-suffix"><input type="number" min="0" max="100000" step="1" inputmode="numeric" [disabled]="!(key in limits())"
                           [value]="key in limits() ? limits()[key] : ''" (input)="setLimit(key, $any($event.target).value)" [attr.aria-label]="limit(key) + ' limit'">
                      <span class="input-suffix__unit">{{ limit(key).toLowerCase() }}</span></span>
                  </label>
                  <label class="limit__unlimited"><input type="checkbox" [checked]="!(key in limits())" (change)="setUnlimited(key, $any($event.target).checked)"> Unlimited</label>
                </div>
              }
              @if (limitError()) { <p class="error-text" role="alert">{{ limitError() }}</p> }
            </fieldset>
          </app-section-card>

          @if (isEdit()) {
            <app-section-card title="History">
              @if (history().length === 0) {
                <p class="muted">No changes recorded yet.</p>
              } @else {
                <ul class="history">
                  @for (entry of history(); track entry.id) {
                    <li><strong>{{ when(entry.occurredAt) }}</strong> · {{ entry.actorLabel || 'System' }}<br>
                      <span class="muted">{{ describeChange(entry) }}</span></li>
                  }
                </ul>
              }
            </app-section-card>
          }

          @if (saveError(); as apiError) {
            <app-error-card title="Plan not saved" [message]="apiError.message" [details]="apiError.details" />
          }
          <div class="button-row save-bar">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : isEdit() ? 'Save plan' : 'Create plan' }}</button>
            <a class="btn btn-secondary" appBack [routerLink]="RoutePaths.billingPlans">Cancel</a>
          </div>
        </form>
      }
    </section>

    @if (confirmingSave()) {
      <app-dialog title="Save changes to this plan?" width="30rem" (closed)="confirmingSave.set(false)">
        <ul class="impact">
          @if (priceChanged()) { <li><strong>Price:</strong> new agencies pay {{ preview() }}. The {{ agencyCount() }} on it now keep their price.</li> }
          @if (entitlementsChanged()) { <li><strong>Features and limits:</strong> change for all {{ agencyCount() }} {{ agencyCount() === 1 ? 'agency' : 'agencies' }} on the plan now.</li> }
          @if (retiringWithAgencies()) { <li><strong>Retired:</strong> nobody new joins; the {{ agencyCount() }} on it stay.</li> }
          @if (!priceChanged() && !entitlementsChanged() && !retiringWithAgencies()) { <li>Name, description and order only — nothing changes for agencies.</li> }
        </ul>
        <div dialog-actions>
          <button type="button" class="btn btn-primary" (click)="save()">Save plan</button>
          <button type="button" class="btn btn-secondary" (click)="confirmingSave.set(false)">Keep editing</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .locked { display: flex; align-items: center; gap: var(--space-2); margin: 0; min-height: 2.75rem; padding: 0 var(--space-3); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); background: var(--surface-2); }
    .switches { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
    .switch-row { font-weight: var(--weight-regular); }
    .preview { display: grid; gap: var(--space-2); margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); }
    .preview__title, .small { margin: 0; }
    .group { display: grid; gap: var(--space-2); margin: 0 0 var(--space-3); padding: 0; border: 0; }
    .group legend { margin-bottom: var(--space-2); font-weight: var(--weight-semibold); }
    .check { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); align-items: start; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-2) var(--space-1); border-radius: var(--radius-sm); cursor: pointer; }
    .check:hover { background: var(--surface-2); }
    .check input { width: 1.25rem; height: 1.25rem; margin-top: 0.15rem; }
    .limit { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-4); }
    .limit__field { display: grid; gap: var(--space-1); flex: 1 1 12rem; }
    .limit__unlimited { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; cursor: pointer; }
    .limit__unlimited input { width: 1.25rem; height: 1.25rem; }
    .input-suffix { display: flex; align-items: stretch; }
    .input-suffix input { flex: 1; min-width: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
    .input-suffix__unit { display: inline-flex; align-items: center; padding: 0 var(--space-2-5); border: 1px solid var(--field-border); border-left: 0;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0; background: var(--surface-2); color: var(--text-muted); }
    .history { display: grid; gap: var(--space-2-5); margin: 0; padding: 0; list-style: none; }
    .impact { display: grid; gap: var(--space-2); margin: 0; padding-left: var(--space-5); }
    /* Always in reach on a long form: the page's own bottom edge, above everything it scrolls past. */
    .save-bar { position: sticky; bottom: 0; z-index: 5; margin: 0 calc(-1 * var(--space-3));
      padding: var(--space-3); border-top: 1px solid var(--border); background: var(--bg); }
    @media (max-width: 40rem) { .save-bar .btn { flex: 1 1 auto; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlanFormPageComponent implements OnInit, HasUnsavedChanges {
  readonly RoutePaths = RoutePaths;
  readonly modes = PRICING_MODES;
  readonly id = input<string>();
  readonly isEdit = computed(() => !!this.id());

  private readonly billing = inject(BillingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly catalog = signal<BillingCatalog | null>(null);
  readonly features = signal<Set<string>>(new Set());
  readonly limits = signal<Record<string, number>>({});
  readonly mode = signal<PricingMode>('BASE_INCLUDED_EXTRA');
  readonly fields = computed(() => modeFields(this.mode()));
  readonly modeHint = computed(() => this.modes.find((m) => m.mode === this.mode())?.hint ?? '');
  readonly agencyCount = signal(0);
  readonly history = signal<PlanHistoryEntry[]>([]);
  readonly confirmingSave = signal(false);
  readonly limitError = signal<string | null>(null);
  private original: BillingPlan | null = null;
  private loadedFeatures = '';
  private loadedLimits = '';

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z][A-Z0-9_]{1,39}$/)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: '',
    baseFee: [0, [Validators.required, Validators.min(0)]],
    includedRooms: [0, [Validators.min(0)]],
    extraRoomPrice: [0, [Validators.required, Validators.min(0)]],
    trialDays: [null as number | null, [Validators.min(1), Validators.max(365)]],
    publicPlan: false,
    active: true,
    sortOrder: [0, [Validators.min(0)]]
  });

  private readonly value = signal(this.form.getRawValue());
  readonly agencyCountText = computed(() => {
    const count = this.agencyCount();
    return count === 0 ? 'No agencies on it' : `${count} ${count === 1 ? 'agency' : 'agencies'} on it`;
  });
  readonly retiringWithAgencies = computed(() => this.isEdit() && this.original?.active !== false && !this.value().active && this.agencyCount() > 0);

  constructor() {
    this.form.valueChanges.subscribe(() => this.value.set(this.form.getRawValue()));
  }

  preview(): string {
    const v = this.value();
    return describePrice({ baseFee: v.baseFee, includedRooms: v.includedRooms, extraRoomPrice: v.extraRoomPrice });
  }

  readonly examples = computed(() => {
    const v = this.value();
    const base = Number(v.baseFee) || 0;
    const extra = Number(v.extraRoomPrice) || 0;
    const included = Number(v.includedRooms) || 0;
    return EXAMPLE_ROOMS.map((rooms) => ({ rooms, total: base + Math.max(0, rooms - included) * extra }));
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.catalog.set(await firstValueFrom(this.billing.catalog()));
      const id = this.id();
      const from = this.route.snapshot.queryParamMap.get('from');
      const source = id ?? from;
      if (source) {
        const plan = await firstValueFrom(this.billing.plan(Number(source)));
        this.form.patchValue({
          code: id ? plan.code : '', name: id ? plan.name : `${plan.name} (copy)`, description: plan.description ?? '',
          baseFee: Number(plan.baseFee) || 0, includedRooms: plan.includedRooms ?? 0, extraRoomPrice: Number(plan.extraRoomPrice) || 0,
          trialDays: plan.trialDays || null, publicPlan: id ? !!plan.publicPlan : false, active: plan.active !== false, sortOrder: plan.sortOrder ?? 0
        });
        this.mode.set(plan.pricingMode ?? 'FREE');
        this.features.set(new Set(plan.features ?? []));
        this.limits.set({ ...(plan.limits ?? {}) });
        if (id) {
          this.original = plan;
          const [counts, history] = await Promise.all([
            firstValueFrom(this.billing.planAgencyCounts()).catch(() => ({} as Record<number, number>)),
            firstValueFrom(this.billing.planHistory(plan.id)).catch(() => [] as PlanHistoryEntry[])
          ]);
          this.agencyCount.set(counts[plan.id] ?? 0);
          this.history.set(history);
        }
      }
      this.loadedFeatures = [...this.features()].sort().join();
      this.loadedLimits = JSON.stringify(this.limits());
      this.value.set(this.form.getRawValue());
      this.form.markAsPristine();
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    return !this.saved() && (this.form.dirty || this.entitlementsChanged());
  }

  pickMode(mode: PricingMode): void {
    this.mode.set(mode);
    const v = this.form.getRawValue();
    this.form.patchValue(priceForMode(mode, { baseFee: v.baseFee, includedRooms: v.includedRooms, extraRoomPrice: v.extraRoomPrice }));
    this.form.markAsDirty();
  }

  toggleFeature(code: string, on: boolean): void {
    this.features.update((set) => {
      const next = new Set(set);
      if (on) next.add(code); else next.delete(code);
      return next;
    });
  }

  setLimit(key: string, value: string): void {
    this.limits.update((current) => ({ ...current, [key]: value === '' ? 0 : Math.max(0, Math.floor(Number(value))) }));
  }

  /** Unlimited is a choice made on purpose, never what an empty box means. */
  setUnlimited(key: string, unlimited: boolean): void {
    this.limits.update((current) => {
      const next = { ...current };
      if (unlimited) delete next[key]; else next[key] = this.original?.limits?.[key] ?? 1;
      return next;
    });
  }

  priceChanged(): boolean {
    const o = this.original;
    const v = this.value();
    return !!o && (Number(o.baseFee) !== Number(v.baseFee) || o.includedRooms !== Number(v.includedRooms) || Number(o.extraRoomPrice) !== Number(v.extraRoomPrice));
  }

  entitlementsChanged(): boolean {
    return [...this.features()].sort().join() !== this.loadedFeatures || JSON.stringify(this.limits()) !== this.loadedLimits;
  }

  askToSave(): void {
    this.limitError.set(Object.values(this.limits()).some((value) => !Number.isFinite(value) || value < 0) ? 'Limits are whole numbers from 0.' : null);
    if (this.form.invalid || this.limitError()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.isEdit() && this.agencyCount() > 0) {
      this.confirmingSave.set(true);
    } else {
      void this.save();
    }
  }

  async save(): Promise<void> {
    this.confirmingSave.set(false);
    const v = this.form.getRawValue();
    const request = {
      code: v.code.trim(),
      name: v.name.trim(),
      description: v.description.trim() || null,
      baseFee: Number(v.baseFee) || 0,
      includedRooms: Number(v.includedRooms) || 0,
      extraRoomPrice: Number(v.extraRoomPrice) || 0,
      trialDays: v.trialDays || null,
      publicPlan: v.publicPlan,
      active: v.active,
      sortOrder: v.sortOrder,
      features: [...this.features()],
      limits: this.limits()
    };
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const id = this.id();
      if (id) {
        await firstValueFrom(this.billing.updatePlan(Number(id), request));
      } else {
        await firstValueFrom(this.billing.createPlan(request));
      }
      this.saved.set(true);
      await this.router.navigateByUrl(RoutePaths.billingPlans);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** "Price: 2,500 → 3,000 · Shown to landlords: off → on", from the trail's field changes. */
  describeChange(entry: PlanHistoryEntry): string {
    if (entry.changes) {
      try {
        const changes = JSON.parse(entry.changes) as Record<string, { from?: unknown; to?: unknown }>;
        const parts = Object.entries(changes).map(([field, change]) =>
          `${FIELD_LABELS[field] ?? field}: ${this.show(change?.from)} → ${this.show(change?.to)}`);
        if (parts.length) return parts.join(' · ');
      } catch {
        // Not JSON: fall back to the summary.
      }
    }
    return entry.summary || (entry.action === 'CREATED' ? 'Created' : 'Changed');
  }

  private show(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (value === true || value === 'true') return 'on';
    if (value === false || value === 'false') return 'off';
    return String(value);
  }

  when(value: string): string {
    return displayDateTime(value);
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  featureHint(code: string): string | null {
    return FEATURE_DESCRIPTIONS[code] ?? null;
  }

  limit(key: string): string {
    return limitLabel(key);
  }

  money(value: number): string {
    return kes(value);
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', description: 'Description', baseFee: 'Monthly base fee', includedRooms: 'Rooms covered',
  extraRoomPrice: 'Price per room', trialDays: 'Trial days', publicPlan: 'Offered to landlords', active: 'Can be given',
  sortOrder: 'Order', currency: 'Currency'
};
