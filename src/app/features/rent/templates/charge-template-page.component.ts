import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ContextSwitcherComponent } from '../../../shared/components/context-switcher/context-switcher.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { HousingService } from '../../housing/housing.service';
import { RoomPreview } from '../../housing/models/housing.models';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import {
  UtilityBillingType, ChargeTemplate } from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-charge-template-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    ContextSwitcherComponent,
    ContextGuardComponent,
    EntityPickerComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Rent charge templates">
        <p class="hint">Templates seed each month's charges when arrears are generated.</p>
        <app-context-switcher />
      </app-section-card>

      <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">

      @if (!scope()) {
        <app-empty-state title="Select a building" description="Charge templates are defined per building." />
      } @else {
        <app-section-card [title]="editing() ? 'Edit template' : 'New template'">
          <ng-container actions>
            @if (editing()) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="cancelEdit()">Cancel edit</button>
            }
          </ng-container>

          <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Water">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">A name is required.</small>
                }
              </label>

              <label class="field">
                <span>Billing type</span>
                <select formControlName="billingType">
                  <option value="FIXED">Fixed monthly amount</option>
                  <option value="METERED">Metered</option>
                  <option value="PER_UNIT">Per unit</option>
                  <option value="PERCENTAGE_OF_RENT">Share of the rent</option>
                </select>
              </label>

              <label class="field">
                <span>Billing timing</span>
                <select formControlName="billingTiming">
                  <option value="CURRENT_MONTH">Current month</option>
                  <option value="PRIOR_MONTH_ARREARS">Prior month arrears</option>
                  <option value="ADVANCE">Advance</option>
                </select>
              </label>

              @if (!editing()) {
                <label class="field">
                  <span>Applies to</span>
                  <select formControlName="target">
                    <option value="BUILDING">Every room in this building</option>
                    <option value="ROOM">One room</option>
                    <option value="TENANT">One tenant (override)</option>
                  </select>
                  <small class="hint">A tenant override takes priority over room and building templates with the same name.</small>
                </label>
              }

              @if (form.controls.billingType.value === 'FIXED') {
                <label class="field">
                  <span>Fixed amount</span>
                  <input type="number" step="0.01" min="0" formControlName="fixedAmount">
                </label>
              } @else if (form.controls.billingType.value === 'METERED' || form.controls.billingType.value === 'PER_UNIT') {
                <label class="field">
                  <span>Unit rate</span>
                  <input type="number" step="0.01" min="0" formControlName="unitRate">
                </label>
                <label class="field"><span>Unit</span><input formControlName="unit" placeholder="m³"></label>
              }

              <!--
                Shown only for the type that uses it. It used to be permanent,
                beside a type list that never offered the one it belonged to,
                so it was a field nothing could ever act on.
              -->
              @if (form.controls.billingType.value === 'PERCENTAGE_OF_RENT') {
                <label class="field">
                  <span>Percentage of rent</span>
                  <input type="number" step="0.01" min="0" max="100" formControlName="percentage">
                </label>
              }

              @if (form.controls.billingType.value === 'METERED') {
                <label class="field">
                  <span>Meter number</span>
                  <input formControlName="meterNumber" placeholder="WM-204">
                </label>
              }

              @if (!editing() && form.controls.target.value === 'ROOM') {
                <label class="field">
                  <span>Room</span>
                  <select formControlName="roomId">
                    <option [ngValue]="null">Select room</option>
                    @for (room of rooms(); track room.id) {
                      <option [ngValue]="room.id">{{ room.name || ('Room ' + (room.roomNumber ?? room.id)) }}</option>
                    }
                  </select>
                </label>
              }

              @if (!editing() && form.controls.target.value === 'TENANT') {
                <label class="field">
                  <span>Tenant</span>
                  <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Search for the tenant" />
                </label>
              }

              @if (editing()) {
                <label class="checkbox-field">
                  <input type="checkbox" formControlName="isActive">
                  <span>Active</span>
                </label>
              }

              <label class="checkbox-field">
                <input type="checkbox" formControlName="includedInRent">
                <span>Included in rent (do not bill separately)</span>
              </label>
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>

            @if (saveError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'Template already exists' : 'Unable to save template'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : (editing() ? 'Save template' : 'Create template') }}
              </button>
            </div>
          </form>
        </app-section-card>

        @if (loading()) {
          <app-loading-state label="Loading templates..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (templates().length === 0) {
          <app-empty-state title="No templates" description="Add a template so charges are generated each month." />
        } @else {
          <section class="panel table-shell">
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Template</th><th>Billing</th><th>Rate</th><th>Timing</th><th>Scope</th><th>Status</th><th class="actions-col">Actions</th></tr>
                </thead>
                <tbody>
                  @for (template of templates(); track template.id) {
                    <tr>
                      <td>
                        <div class="cell-stack">
                          <strong>{{ template.name }}</strong>
                          <span class="muted">{{ template.description || '-' }}</span>
                        </div>
                      </td>
                      <td>{{ template.billingType | humanLabel }}</td>
                      <td>{{ rateLabel(template) }}</td>
                      <td>{{ template.billingTiming | humanLabel }}</td>
                      <td>{{ template.tenantId ? 'Tenant override' : (template.roomName || (template.roomId ? 'Room ' + template.roomId : 'All rooms')) }}</td>
                      <td>
                        <app-status-chip [status]="template.isActive ? 'ACTIVE' : 'INACTIVE'" />
                      </td>
                      <td class="actions-col">
                        <button
                          type="button"
                          class="icon-action"
                          aria-label="Edit charge template"
                          title="Edit charge template"
                          (click)="startEdit(template)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChargeTemplatePageComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly housing = inject(HousingService);
  private readonly context = inject(ActiveContextService);
  readonly pickers = inject(EntityPickerRegistry);

  readonly scope = this.context.active;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly templates = signal<ChargeTemplate[]>([]);
  readonly rooms = signal<RoomPreview[]>([]);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly editing = signal<ChargeTemplate | null>(null);

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: '',
    billingType: 'FIXED',
    billingTiming: 'CURRENT_MONTH',
    fixedAmount: [null as number | null, [Validators.min(0)]],
    unitRate: [null as number | null, [Validators.min(0)]],
    percentage: [null as number | null, [Validators.min(0), Validators.max(100)]],
    unit: '',
    meterNumber: '',
    includedInRent: false,
    target: 'BUILDING',
    roomId: [null as number | null],
    tenantId: [null as number | null],
    isActive: true
  });


  startEdit(template: ChargeTemplate): void {
    this.editing.set(template);
    this.saveError.set(null);
    this.form.patchValue({
      name: template.name,
      description: template.description ?? '',
      billingType: template.billingType ?? 'FIXED',
      billingTiming: template.billingTiming ?? 'CURRENT_MONTH',
      fixedAmount: template.fixedAmount === null || template.fixedAmount === undefined ? null : Number(template.fixedAmount),
      unitRate: template.unitRate === null || template.unitRate === undefined ? null : Number(template.unitRate),
      percentage: template.percentage === null || template.percentage === undefined ? null : Number(template.percentage),
      unit: template.unit ?? '',
      meterNumber: template.meterNumber ?? '',
      includedInRent: template.includedInRent ?? false,
      roomId: template.roomId ?? null,
      tenantId: template.tenantId ?? null,
      isActive: template.isActive ?? true
    });
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.saveError.set(null);
    this.form.reset({
      name: '',
      description: '',
      billingType: 'FIXED',
      billingTiming: 'CURRENT_MONTH',
      fixedAmount: null,
      unitRate: null,
      percentage: null,
      unit: '',
      meterNumber: '',
      includedInRent: false,
      target: 'BUILDING',
      roomId: null,
      tenantId: null,
      isActive: true
    });
  }

  async submit(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const editing = this.editing();
    if (!editing && value.target === 'ROOM' && !value.roomId) {
      this.form.controls.roomId.setErrors({ required: true });
      this.form.controls.roomId.markAsTouched();
      return;
    }
    if (!editing && value.target === 'TENANT' && !value.tenantId) {
      this.form.controls.tenantId.setErrors({ required: true });
      this.form.controls.tenantId.markAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    const base = {
      name: value.name,
      description: value.description || null,
      billingType: value.billingType as UtilityBillingType,
      billingTiming: value.billingTiming as 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE',
      fixedAmount: value.billingType === 'FIXED' ? value.fixedAmount : null,
      unitRate: value.billingType === 'METERED' || value.billingType === 'PER_UNIT' ? value.unitRate : null,
      percentage: value.billingType === 'PERCENTAGE_OF_RENT' ? value.percentage : null,
      unit: value.billingType === 'METERED' || value.billingType === 'PER_UNIT' ? value.unit || null : null,
      meterNumber: value.billingType === 'METERED' ? value.meterNumber || null : null,
      includedInRent: value.includedInRent
    };

    try {
      if (editing) {
        const updated = await firstValueFrom(this.rentService.updateChargeTemplate(
          scope.agencyId,
          scope.buildingId,
          editing.id,
          { ...base, isActive: value.isActive }
        ));
        this.templates.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await firstValueFrom(value.target === 'TENANT'
          ? this.rentService.createTenantChargeTemplate(scope.agencyId, scope.buildingId, value.tenantId!, base)
          : this.rentService.createChargeTemplate(scope.agencyId, scope.buildingId, {
              ...base,
              roomId: value.target === 'ROOM' ? value.roomId : null
            }));
        this.templates.update((items) => [...items, created]);
      }

      this.cancelEdit();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  rateLabel(template: ChargeTemplate): string {
    if (template.billingType === 'FIXED') {
      return String(template.fixedAmount ?? '-');
    }

    if (template.unitRate === null || template.unitRate === undefined) {
      return '-';
    }

    return template.unit ? `${template.unitRate} / ${template.unit}` : String(template.unitRate);
  }

  async reload(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [templates, building] = await Promise.all([
        firstValueFrom(this.rentService.getChargeTemplates(scope.agencyId, scope.buildingId)),
        firstValueFrom(this.housing.getBuilding(scope.agencyId, scope.buildingId))
      ]);
      this.templates.set(templates);
      this.rooms.set((building.floors ?? []).flatMap((floor) => floor.rooms ?? []));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  constructor() {
    effect(() => {
      const scope = this.scope();
      if (scope.agencyId !== null && scope.buildingId !== null) {
        void this.reload();
      }
    });
  }
}
