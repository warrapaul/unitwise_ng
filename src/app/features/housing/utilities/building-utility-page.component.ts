import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import {
  UtilityBillingType, RoomUtility } from '../models/housing.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-building-utility-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    ContextGuardComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-context-guard [agencyId]="agencyId()" [buildingId]="buildingId()" requirePermission="BUILDING_READ">
      <app-section-card [title]="editing() ? 'Edit utility' : 'Building utilities'">
        <ng-container actions>
          <div class="action-bar">
            @if (editing()) {
              <button type="button" class="btn btn-secondary" (click)="cancelEdit()">Cancel edit</button>
            }
            <a class="btn btn-secondary" [routerLink]="RoutePaths.buildingDetail(agencyId(), buildingId())">Back to building</a>
          </div>
        </ng-container>

        <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE]">
          <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Electricity">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
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
                <label class="field"><span>Unit</span><input formControlName="unit" placeholder="kWh"></label>
                <label class="field"><span>Meter number</span><input formControlName="meterNumber"></label>
              }

              @if (form.controls.billingType.value === 'PERCENTAGE_OF_RENT') {
                <label class="field">
                  <span>Percentage of rent</span>
                  <input type="number" step="0.01" min="0" max="100" formControlName="percentage">
                </label>
              }
            </div>

            <label class="field field--wide">
              <span>Notes</span>
              <textarea formControlName="notes" rows="2"></textarea>
            </label>

            <div class="checkbox-row">
              <label class="checkbox-field"><input type="checkbox" formControlName="includedInRent"><span>Included in rent</span></label>
              <label class="checkbox-field"><input type="checkbox" formControlName="isActive"><span>Active</span></label>
            </div>

            @if (saveError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'Utility already exists' : 'Unable to save utility'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : (editing() ? 'Save utility' : 'Add utility') }}
              </button>
            </div>
          </form>
        </app-permission-gate>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading utilities..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (utilities().length === 0) {
        <app-empty-state title="No utilities" description="Add a utility so it can be billed to rooms." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Utility</th><th>Billing</th><th>Rate</th><th>Timing</th><th>Status</th><th class="actions-col">Actions</th></tr>
              </thead>
              <tbody>
                @for (utility of utilities(); track utility.id) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ utility.name }}</strong>
                        <span class="muted">{{ utility.notes || utility.description || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ utility.billingType | humanLabel }}</td>
                    <td>{{ rateLabel(utility) }}</td>
                    <td>{{ utility.billingTiming | humanLabel }}</td>
                    <td>
                      <div class="chip-row">
                        <app-status-chip [status]="utility.isActive ? 'ACTIVE' : 'INACTIVE'" />
                        @if (utility.includedInRent) {
                          <span class="status-chip status-chip--info">In rent</span>
                        }
                      </div>
                    </td>
                    <td class="actions-col">
                      <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE]">
                        <div class="row-actions">
                          <button
                            type="button"
                            class="icon-action"
                            aria-label="Edit utility"
                            title="Edit utility"
                            (click)="startEdit(utility)"
                          ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            [disabled]="busyId() === utility.id"
                            (click)="applyToAll(utility)"
                          >
                            Apply to all rooms
                          </button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            [disabled]="busyId() === utility.id"
                            (click)="removeFromAll(utility)"
                          >
                            Remove from all
                          </button>
                          <button
                            type="button"
                            class="icon-action icon-action--danger"
                            aria-label="Delete utility"
                            title="Delete utility"
                            [disabled]="busyId() === utility.id"
                            (click)="remove(utility)"
                          ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                        </div>
                      </app-permission-gate>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (notice()) {
          <section class="alert alert-success" role="status">{{ notice() }}</section>
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

    .checkbox-row {
      display: flex;
      gap: 1.15rem;
      flex-wrap: wrap;
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingUtilityPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  private readonly context = inject(ActiveContextService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly utilities = signal<RoomUtility[]>([]);
  readonly notice = signal<string | null>(null);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly editing = signal<RoomUtility | null>(null);
  readonly busyId = signal<number | null>(null);

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    billingType: 'FIXED',
    billingTiming: 'CURRENT_MONTH',
    fixedAmount: [null as number | null, [Validators.min(0)]],
    unitRate: [null as number | null, [Validators.min(0)]],
    percentage: [null as number | null, [Validators.min(0), Validators.max(100)]],
    unit: '',
    meterNumber: '',
    notes: '',
    includedInRent: false,
    isActive: true
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.utilities.set(await firstValueFrom(
        this.housing.getBuildingUtilities(Number(this.agencyId()), Number(this.buildingId()))
      ));
      this.context.syncFromRoute(Number(this.agencyId()), Number(this.buildingId()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(utility: RoomUtility): void {
    this.editing.set(utility);
    this.saveError.set(null);
    this.form.patchValue({
      name: utility.name,
      billingType: utility.billingType ?? 'FIXED',
      billingTiming: utility.billingTiming ?? 'CURRENT_MONTH',
      fixedAmount: utility.fixedAmount === null || utility.fixedAmount === undefined ? null : Number(utility.fixedAmount),
      unitRate: utility.unitRate === null || utility.unitRate === undefined ? null : Number(utility.unitRate),
      percentage: utility.percentage === null || utility.percentage === undefined ? null : Number(utility.percentage),
      unit: utility.unit ?? '',
      meterNumber: utility.meterNumber ?? '',
      notes: utility.notes ?? '',
      includedInRent: utility.includedInRent ?? false,
      isActive: utility.isActive ?? true
    });
  }

  async cancelEdit(): Promise<void> {
    this.editing.set(null);
    this.saveError.set(null);
    this.form.reset({
      name: '',
      billingType: 'FIXED',
      billingTiming: 'CURRENT_MONTH',
      fixedAmount: null,
      unitRate: null,
      percentage: null,
      unit: '',
      meterNumber: '',
      notes: '',
      includedInRent: false,
      isActive: true
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.notice.set(null);

    const value = this.form.getRawValue();
    const request = {
      name: value.name,
      billingType: value.billingType as UtilityBillingType,
      billingTiming: value.billingTiming as 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE',
      // Only the figure the chosen type uses, so switching type does not leave
      // a stale rate on a charge that no longer meters.
      fixedAmount: value.billingType === 'FIXED' ? value.fixedAmount : null,
      unitRate: value.billingType === 'METERED' || value.billingType === 'PER_UNIT' ? value.unitRate : null,
      percentage: value.billingType === 'PERCENTAGE_OF_RENT' ? value.percentage : null,
      unit: value.unit || null,
      meterNumber: value.meterNumber || null,
      notes: value.notes || null,
      includedInRent: value.includedInRent,
      isActive: value.isActive
    };

    try {
      const editing = this.editing();
      if (editing) {
        const updated = await firstValueFrom(
          this.housing.updateUtility(Number(this.agencyId()), Number(this.buildingId()), editing.id, request)
        );
        this.utilities.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        await firstValueFrom(
          this.housing.addBuildingUtility(Number(this.agencyId()), Number(this.buildingId()), request)
        );
        // One create writes a row for every room in the building, so the list is
        // refetched rather than guessed at.
        await this.reload();
      }

      this.cancelEdit();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async applyToAll(utility: RoomUtility): Promise<void> {
    if (!await this.confirm.ask({ title: `Apply "${utility.name}" to every room in this building?` })) {
      return;
    }

    this.busyId.set(utility.id);
    this.error.set(null);
    this.notice.set(null);

    try {
      await firstValueFrom(
        this.housing.applyUtilityToAllRooms(Number(this.agencyId()), Number(this.buildingId()), utility.id)
      );
      this.notice.set(`"${utility.name}" applied to every room.`);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async removeFromAll(utility: RoomUtility): Promise<void> {
    if (!await this.confirm.ask({
      title: `Remove "${utility.name}" from every room in this building?`,
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }

    this.busyId.set(utility.id);
    this.error.set(null);
    this.notice.set(null);

    try {
      await firstValueFrom(
        this.housing.removeUtilityFromAllRooms(Number(this.agencyId()), Number(this.buildingId()), utility.id)
      );
      this.notice.set(`"${utility.name}" removed from every room.`);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(utility: RoomUtility): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the utility "${utility.name}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.busyId.set(utility.id);
    this.error.set(null);

    try {
      await firstValueFrom(this.housing.deleteUtility(Number(this.agencyId()), Number(this.buildingId()), utility.id));
      this.utilities.update((items) => items.filter((item) => item.id !== utility.id));
      if (this.editing()?.id === utility.id) {
        this.cancelEdit();
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  rateLabel(utility: RoomUtility): string {
    if (utility.billingType === 'FIXED') {
      return String(utility.fixedAmount ?? '-');
    }

    if (utility.unitRate === null || utility.unitRate === undefined) {
      return '-';
    }

    return utility.unit ? `${utility.unitRate} / ${utility.unit}` : String(utility.unitRate);
  }
}
