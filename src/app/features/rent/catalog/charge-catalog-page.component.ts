import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ChargeBillingTiming, ChargeCatalogItem, UtilityBillingType } from '../models/rent.models';
import { RentService } from '../rent.service';
import { BILLING_TIMING_LABELS, BILLING_TYPE_LABELS } from './charge-labels';

/**
 * The platform's list of charges, kept by the super admin. Landlords pick from
 * it when they add a monthly charge, so Water is spelled one way everywhere and
 * an override at a building, room or tenant lands on the charge it overrides.
 *
 * How it is charged, when and in what unit are defaults the landlord's form
 * starts from — the landlord can change them; the amount is always theirs.
 * Retiring a charge takes it out of the picker; templates already using it keep billing.
 */
@Component({
  selector: 'app-charge-catalog-page',
  standalone: true,
  imports: [ReactiveFormsModule, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, ErrorCardComponent,
    FieldErrorComponent, FormFeedbackDirective],
  template: `
    <section class="stack">
      <app-section-card title="Charge catalog" subtitle="The charges landlords pick from when they add a monthly charge.">
        <ng-container actions>
          @if (!formOpen()) {
            <button type="button" class="btn btn-primary btn-sm" (click)="startAdd()">Add charge</button>
          }
        </ng-container>

        @if (formOpen()) {
          <form class="stack charge-form" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Water">
                <app-field-error [control]="form.controls.name" label="Name" />
              </label>
              <label class="field">
                <span>How it is charged (default)</span>
                <select formControlName="billingType">
                  @for (type of billingTypes; track type) {
                    <option [value]="type">{{ typeLabels[type] }}</option>
                  }
                </select>
              </label>
              @if (form.controls.billingType.value === 'METERED' || form.controls.billingType.value === 'PER_UNIT') {
                <label class="field"><span>Unit</span><input formControlName="unit" placeholder="m³, kWh"></label>
              }
              <label class="field">
                <span>Billed for (default)</span>
                <select formControlName="billingTiming">
                  @for (timing of billingTimings; track timing) {
                    <option [value]="timing">{{ timingLabels[timing] }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Description</span>
                <input formControlName="description" placeholder="What it covers">
              </label>
            </div>

            @if (saveError(); as apiError) {
              <app-error-card [title]="apiError.status === 409 ? 'That charge is already on the list' : 'Not saved'"
                              [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : (editing() ? 'Save charge' : 'Add charge') }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="closeForm()">Cancel</button>
            </div>
          </form>
        }

        @if (loading()) {
          <app-loading-state [compact]="true" label="Loading charges..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (items().length === 0) {
          <p class="muted">No charges yet. Add the ones landlords bill most — water, electricity, garbage.</p>
        } @else {
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Charge</th><th>How it is charged</th><th>Billed for</th><th>Unit</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr>
              </thead>
              <tbody>
                @for (item of items(); track item.id) {
                  <tr [class.row--off]="!item.isActive">
                    <td>
                      <div class="cell-stack">
                        <strong>{{ item.name }}</strong>
                        @if (item.description) { <span class="muted">{{ item.description }}</span> }
                      </div>
                    </td>
                    <td>{{ typeLabels[item.billingType] }}</td>
                    <td>{{ timingLabels[item.billingTiming] }}</td>
                    <td>{{ item.unit || '-' }}</td>
                    <td>
                      <span class="status-chip" [class.status-chip--success]="item.isActive" [class.status-chip--neutral]="!item.isActive">
                        {{ item.isActive ? 'Offered' : 'Retired' }}
                      </span>
                    </td>
                    <td class="actions">
                      <button type="button" class="icon-action" (click)="startEdit(item)" [attr.aria-label]="'Edit ' + item.name" title="Edit">
                        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === item.id" (click)="toggleActive(item)">
                        {{ item.isActive ? 'Retire' : 'Offer again' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .charge-form { padding: 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-2); }
    .row--off td { opacity: 0.65; }
    .actions { white-space: nowrap; text-align: right; }
    .actions > * + * { margin-left: 0.4rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChargeCatalogPageComponent implements OnInit {
  private readonly rent = inject(RentService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly billingTypes = Object.keys(BILLING_TYPE_LABELS) as UtilityBillingType[];
  readonly billingTimings = Object.keys(BILLING_TIMING_LABELS) as ChargeBillingTiming[];
  readonly typeLabels = BILLING_TYPE_LABELS;
  readonly timingLabels = BILLING_TIMING_LABELS;

  readonly items = signal<ChargeCatalogItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editing = signal<ChargeCatalogItem | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly busyId = signal<number | null>(null);

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(255)]],
    billingType: 'FIXED' as UtilityBillingType,
    billingTiming: 'CURRENT_MONTH' as ChargeBillingTiming,
    unit: ['', [Validators.maxLength(30)]]
  });

  ngOnInit(): void {
    void this.reload();
  }

  startAdd(): void {
    this.editing.set(null);
    this.saveError.set(null);
    this.form.reset({ name: '', description: '', billingType: 'FIXED', billingTiming: 'CURRENT_MONTH', unit: '' });
    this.formOpen.set(true);
  }

  startEdit(item: ChargeCatalogItem): void {
    this.editing.set(item);
    this.saveError.set(null);
    this.form.reset({
      name: item.name,
      description: item.description ?? '',
      billingType: item.billingType,
      billingTiming: item.billingTiming,
      unit: item.unit ?? ''
    });
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.saveError.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const counted = value.billingType === 'METERED' || value.billingType === 'PER_UNIT';
    const request = {
      name: value.name.trim(),
      description: value.description.trim(),
      billingType: value.billingType,
      billingTiming: value.billingTiming,
      // Only a counted charge has a unit; an empty string clears a stale one.
      unit: counted ? value.unit.trim() : ''
    };

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const editing = this.editing();
      await firstValueFrom(editing
        ? this.rent.updateChargeCatalogItem(editing.id, request)
        : this.rent.createChargeCatalogItem(request));
      this.closeForm();
      await this.reload();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(item: ChargeCatalogItem): Promise<void> {
    this.busyId.set(item.id);
    try {
      const updated = await firstValueFrom(this.rent.updateChargeCatalogItem(item.id, { isActive: !item.isActive }));
      this.items.update((items) => items.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.rent.getChargeCatalog(true)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
