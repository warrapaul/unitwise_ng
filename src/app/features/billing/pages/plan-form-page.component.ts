import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import {
  BillingCatalog,
  describePrice,
  featureLabel,
  limitLabel,
  modeFields,
  priceForMode,
  PRICING_MODES,
  PricingMode
} from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * A plan: its price (one of five pricing modes, all the same three numbers underneath), the
 * features it includes and its caps. Features and caps come from the server's catalogue, so a
 * plan can only use codes the code actually checks.
 */
@Component({
  selector: 'app-plan-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, BackLinkComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, ErrorCardComponent, FieldErrorComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.billingPlans" label="Plans" [title]="isEdit() ? form.controls.name.value : 'New plan'" />
      @if (loading()) {
        <app-loading-state label="Loading the plan..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" (ngSubmit)="save()">
          <app-section-card [title]="isEdit() ? 'Edit plan' : 'New plan'">
            <div class="form-grid">
              <label class="field">
                <span>Code</span>
                <input formControlName="code" class="mono" placeholder="e.g. PRO" [readonly]="isEdit()">
                <small class="hint">{{ isEdit() ? 'Fixed once created.' : 'Capital letters, digits and underscores.' }}</small>
                <app-field-error [control]="form.controls.code" label="Code" />
              </label>
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="e.g. Pro">
                <app-field-error [control]="form.controls.name" label="Name" />
              </label>
              <label class="field">
                <span>Trial days <span class="muted">(optional)</span></span>
                <input type="number" min="0" max="365" formControlName="trialDays">
              </label>
              <label class="field">
                <span>Order in the list</span>
                <input type="number" formControlName="sortOrder">
              </label>
            </div>
            <label class="field field--wide">
              <span>Description <span class="muted">(optional)</span></span>
              <input formControlName="description" maxlength="500">
            </label>
            <div class="checks">
              <label class="checkbox-field"><input type="checkbox" formControlName="active"><span>Active — can be given to agencies</span></label>
              <label class="checkbox-field"><input type="checkbox" formControlName="publicPlan"><span>Shown to landlords in the catalogue</span></label>
            </div>
          </app-section-card>

          <app-section-card title="Price">
            <div class="form-grid">
              <label class="field">
                <span>Pricing</span>
                <select [value]="mode()" (change)="pickMode($any($event.target).value)">
                  @for (option of modes; track option.mode) { <option [value]="option.mode">{{ option.label }}</option> }
                </select>
                <small class="hint">{{ modeHint() }}</small>
              </label>
              @if (fields().base) {
                <label class="field"><span>Base fee a month (KES)</span><input type="number" min="0" step="0.01" formControlName="baseFee"></label>
              }
              @if (fields().included) {
                <label class="field"><span>Rooms the base fee covers</span><input type="number" min="1" formControlName="includedRooms"></label>
              }
              @if (fields().extra) {
                <label class="field"><span>{{ fields().included ? 'Price per extra room (KES)' : 'Price per room (KES)' }}</span>
                  <input type="number" min="0" step="0.01" formControlName="extraRoomPrice"></label>
              }
            </div>
            <p class="preview">Charges: <strong>{{ preview() }}</strong>. Rooms that existed at any time in a month are billed, after the month ends.</p>
          </app-section-card>

          <app-section-card title="Features and limits">
            <h3 class="subhead">Features included</h3>
            <div class="checks">
              @for (code of catalog()?.features ?? []; track code) {
                <label class="checkbox-field">
                  <input type="checkbox" [checked]="features().has(code)" (change)="toggleFeature(code, $any($event.target).checked)">
                  <span>{{ feature(code) }} <span class="muted mono">{{ code }}</span></span>
                </label>
              }
            </div>
            <h3 class="subhead">Limits <span class="muted">(empty = unlimited)</span></h3>
            <div class="form-grid">
              @for (key of catalog()?.limits ?? []; track key) {
                <label class="field">
                  <span>{{ limit(key) }}</span>
                  <input type="number" min="0" [value]="key in limits() ? limits()[key] : ''" (input)="setLimit(key, $any($event.target).value)">
                </label>
              }
            </div>
            <p class="hint">A plan without a feature switches it off for every agency on the plan, unless an override gives it back.</p>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card title="Plan not saved" [message]="apiError.message" [details]="apiError.details" />
          }
          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : isEdit() ? 'Save plan' : 'Create plan' }}</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    .checks { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); }
    .checkbox-field { display: flex; align-items: center; gap: var(--space-2); }
    .checkbox-field input { width: auto; }
    .preview { margin: 0; font-size: var(--font-dense); }
    .subhead { margin: 0; font-size: var(--font-label); font-weight: var(--weight-bold); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlanFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly modes = PRICING_MODES;
  readonly id = input<string>();
  readonly isEdit = computed(() => !!this.id());

  private readonly billing = inject(BillingService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly catalog = signal<BillingCatalog | null>(null);
  readonly features = signal<Set<string>>(new Set());
  readonly limits = signal<Record<string, number>>({});
  readonly mode = signal<PricingMode>('FREE');
  readonly fields = computed(() => modeFields(this.mode()));
  readonly modeHint = computed(() => this.modes.find((m) => m.mode === this.mode())?.hint ?? '');

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z][A-Z0-9_]{1,39}$/)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: '',
    baseFee: [0, [Validators.min(0)]],
    includedRooms: [0, [Validators.min(0)]],
    extraRoomPrice: [0, [Validators.min(0)]],
    trialDays: [null as number | null],
    publicPlan: false,
    active: true,
    sortOrder: [0]
  });

  /** Re-read on each change detection; the form is small. */
  preview(): string {
    const v = this.form.getRawValue();
    return describePrice({ baseFee: v.baseFee, includedRooms: v.includedRooms, extraRoomPrice: v.extraRoomPrice });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.catalog.set(await firstValueFrom(this.billing.catalog()));
      const id = this.id();
      if (id) {
        const plan = await firstValueFrom(this.billing.plan(Number(id)));
        this.form.patchValue({
          code: plan.code, name: plan.name, description: plan.description ?? '',
          baseFee: Number(plan.baseFee) || 0, includedRooms: plan.includedRooms ?? 0, extraRoomPrice: Number(plan.extraRoomPrice) || 0,
          trialDays: plan.trialDays ?? null, publicPlan: !!plan.publicPlan, active: plan.active !== false, sortOrder: plan.sortOrder ?? 0
        });
        this.mode.set(plan.pricingMode ?? 'FREE');
        this.features.set(new Set(plan.features ?? []));
        this.limits.set({ ...(plan.limits ?? {}) });
      }
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  pickMode(mode: PricingMode): void {
    this.mode.set(mode);
    const v = this.form.getRawValue();
    this.form.patchValue(priceForMode(mode, { baseFee: v.baseFee, includedRooms: v.includedRooms, extraRoomPrice: v.extraRoomPrice }));
  }

  toggleFeature(code: string, on: boolean): void {
    this.features.update((set) => {
      const next = new Set(set);
      if (on) next.add(code); else next.delete(code);
      return next;
    });
  }

  setLimit(key: string, value: string): void {
    this.limits.update((current) => {
      const next = { ...current };
      if (value === '') delete next[key]; else next[key] = Math.max(0, Math.floor(Number(value)));
      return next;
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const request = {
      code: v.code.trim(),
      name: v.name.trim(),
      description: v.description.trim() || null,
      baseFee: Number(v.baseFee) || 0,
      includedRooms: Number(v.includedRooms) || 0,
      extraRoomPrice: Number(v.extraRoomPrice) || 0,
      trialDays: v.trialDays,
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
      await this.router.navigateByUrl(RoutePaths.billingPlans);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  limit(key: string): string {
    return limitLabel(key);
  }
}
