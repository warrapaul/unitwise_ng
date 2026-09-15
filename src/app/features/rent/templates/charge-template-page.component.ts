import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { ChargeTemplate } from '../models/rent.models';
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

              @if (form.controls.billingType.value === 'FIXED') {
                <label class="field">
                  <span>Fixed amount</span>
                  <input type="number" step="0.01" min="0" formControlName="fixedAmount">
                </label>
              } @else {
                <label class="field">
                  <span>Unit rate</span>
                  <input type="number" step="0.01" min="0" formControlName="unitRate">
                </label>
                <label class="field"><span>Unit</span><input formControlName="unit" placeholder="m³"></label>
              }

              <label class="field">
                <span>Percentage</span>
                <input type="number" step="0.01" min="0" max="100" formControlName="percentage">
                <small class="hint">Only for charges billed as a share of rent.</small>
              </label>

              @if (!editing()) {
                <label class="field">
                  <span>Room ID</span>
                  <input type="number" min="1" formControlName="roomId">
                  <small class="hint">Leave empty to apply to every room in the building.</small>
                </label>
              } @else {
                <label class="checkbox-field">
                  <input type="checkbox" formControlName="isActive">
                  <span>Active</span>
                </label>
              }
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
                      <td>{{ template.roomName || (template.roomId ? 'Room ' + template.roomId : 'All rooms') }}</td>
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
  private readonly context = inject(ActiveContextService);

  readonly scope = this.context.active;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly templates = signal<ChargeTemplate[]>([]);

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
    roomId: [null as number | null],
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
      roomId: template.roomId ?? null,
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
      roomId: null,
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

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    const base = {
      name: value.name,
      description: value.description || null,
      billingType: value.billingType as 'FIXED' | 'METERED' | 'PER_UNIT',
      billingTiming: value.billingTiming as 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE',
      fixedAmount: value.billingType === 'FIXED' ? value.fixedAmount : null,
      unitRate: value.billingType === 'FIXED' ? null : value.unitRate,
      percentage: value.percentage,
      unit: value.unit || null
    };

    try {
      const editing = this.editing();
      if (editing) {
        const updated = await firstValueFrom(this.rentService.updateChargeTemplate(
          scope.agencyId,
          scope.buildingId,
          editing.id,
          { ...base, isActive: value.isActive }
        ));
        this.templates.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await firstValueFrom(this.rentService.createChargeTemplate(
          scope.agencyId,
          scope.buildingId,
          { ...base, roomId: value.roomId }
        ));
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
      this.templates.set(await firstValueFrom(this.rentService.getChargeTemplates(scope.agencyId, scope.buildingId)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
