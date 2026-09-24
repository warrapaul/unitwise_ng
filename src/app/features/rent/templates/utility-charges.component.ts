import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { ChargeTemplate, UtilityBillingType } from '../models/rent.models';

type Timing = 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE';

/**
 * What a building or a room is charged each month on top of rent — water,
 * garbage, electricity.
 *
 * Set once on the building and every room is billed; a room that differs gets
 * its own charge of the same name, which replaces the building's for that room
 * only. So the building page manages the building's list, and the room page
 * shows what it inherits and holds only its exceptions.
 *
 * One row per charge. The old utilities table listed a copy per room, so a
 * twenty-room building showed Electricity twenty times.
 */
@Component({
  selector: 'app-utility-charges',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FieldErrorComponent,
    FormFeedbackDirective
  ],
  template: `
    <app-section-card title="Monthly charges">
      <ng-container actions>
        @if (!formOpen()) {
          <app-permission-gate [permissions]="[Permissions.RENT_ARREAR_WRITE]">
            <button type="button" class="btn btn-secondary btn-sm" (click)="startAdd()">Add charge</button>
          </app-permission-gate>
        }
      </ng-container>

      @if (isRoom()) {
        <p class="hint">Charges set on the building already apply here. Add one only if this room is charged differently.</p>
      } @else {
        <p class="hint">Set a charge here once and every room pays it. A room that differs can have its own on the room's page.</p>
      }

      @if (formOpen()) {
        <form class="stack charge-form" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
          <div class="grid-auto">
            <label class="field">
              <span>Name</span>
              <input formControlName="name" placeholder="Water">
              <app-field-error [control]="form.controls.name" label="Name" />
            </label>

            <label class="field">
              <span>How it is charged</span>
              <select formControlName="billingType">
                <option value="FIXED">Same amount every month</option>
                <option value="METERED">By meter reading</option>
                <option value="PER_UNIT">Per unit used</option>
                <option value="PERCENTAGE_OF_RENT">Share of the rent</option>
              </select>
            </label>

            @if (form.controls.billingType.value === 'FIXED') {
              <label class="field">
                <span>Amount</span>
                <input type="number" step="0.01" min="0" formControlName="fixedAmount">
              </label>
            } @else if (form.controls.billingType.value === 'PERCENTAGE_OF_RENT') {
              <label class="field">
                <span>Percentage of rent</span>
                <input type="number" step="0.01" min="0" max="100" formControlName="percentage">
              </label>
            } @else {
              <label class="field">
                <span>Price per unit</span>
                <input type="number" step="0.01" min="0" formControlName="unitRate">
              </label>
              <label class="field"><span>Unit</span><input formControlName="unit" placeholder="m³, kWh"></label>
            }

            <label class="field">
              <span>Billed for</span>
              <select formControlName="billingTiming">
                <option value="CURRENT_MONTH">The current month</option>
                <option value="PRIOR_MONTH_ARREARS">The month before</option>
                <option value="ADVANCE">The coming month</option>
              </select>
            </label>
          </div>

          <label class="checkbox-field">
            <input type="checkbox" formControlName="includedInRent">
            <span>Already included in the rent — do not bill separately</span>
          </label>

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save the charge" [message]="apiError.message" [details]="apiError.details" />
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
      } @else {
        @if (isRoom() && inherited().length > 0) {
          <p class="group-label">From the building</p>
          <ul class="charges">
            @for (charge of inherited(); track charge.id) {
              <li class="charge" [class.charge--replaced]="isReplaced(charge)">
                <div class="charge__body">
                  <strong>{{ charge.name }}</strong>
                  <span class="muted">{{ describe(charge) }}</span>
                  @if (isReplaced(charge)) {
                    <span class="muted">Replaced for this room</span>
                  }
                </div>
                @if (!isReplaced(charge)) {
                  <app-permission-gate [permissions]="[Permissions.RENT_ARREAR_WRITE]">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="startOverride(charge)">Change for this room</button>
                  </app-permission-gate>
                }
              </li>
            }
          </ul>
        }

        @if (isRoom()) {
          <p class="group-label">This room only</p>
        }
        @if (own().length === 0) {
          <p class="muted">{{ isRoom() ? 'None — this room pays what the building sets.' : 'No monthly charges yet.' }}</p>
        } @else {
          <ul class="charges">
            @for (charge of own(); track charge.id) {
              <li class="charge" [class.charge--off]="!charge.isActive">
                <div class="charge__body">
                  <strong>{{ charge.name }}</strong>
                  <span class="muted">{{ describe(charge) }}</span>
                  @if (!charge.isActive) {
                    <span class="muted">Stopped</span>
                  }
                </div>
                <app-permission-gate [permissions]="[Permissions.RENT_ARREAR_WRITE]">
                  <div class="charge__actions">
                    <button type="button" class="icon-action" (click)="startEdit(charge)"
                            [attr.aria-label]="'Edit ' + charge.name" title="Edit">
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === charge.id" (click)="toggleActive(charge)">
                      {{ charge.isActive ? 'Stop' : 'Resume' }}
                    </button>
                  </div>
                </app-permission-gate>
              </li>
            }
          </ul>
        }

        @if (!isRoom() && roomOverrideCount() > 0) {
          <p class="muted">{{ roomOverrideCount() }} room{{ roomOverrideCount() === 1 ? ' has' : 's have' }} a charge of their own.</p>
        }
      }
    </app-section-card>
  `,
  styles: [`
    :host { display: block; }

    .charge-form {
      padding: 0.85rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }

    .group-label { margin: 0.2rem 0 0; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); }

    .charges { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }

    .charge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
      flex-wrap: wrap;
      padding: 0.6rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    .charge--off, .charge--replaced { opacity: 0.65; }

    .charge__body { display: grid; gap: 0.1rem; min-width: 0; flex: 1 1 12rem; }
    .charge__actions { display: flex; align-items: center; gap: 0.4rem; }

    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UtilityChargesComponent {
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  /** Given, the room's view: what it inherits plus its own. Absent, the building's list. */
  readonly roomId = input<number | null>(null);

  private readonly rent = inject(RentService);
  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly isRoom = computed(() => this.roomId() !== null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly charges = signal<ChargeTemplate[]>([]);

  readonly formOpen = signal(false);
  readonly editing = signal<ChargeTemplate | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly busyId = signal<number | null>(null);

  /** Building-wide charges: no room, no tenant. */
  private readonly buildingWide = computed(() =>
    this.charges().filter((charge) => !charge.roomId && !charge.tenantId));

  readonly inherited = computed(() => this.isRoom() ? this.buildingWide() : []);

  readonly own = computed(() => {
    const roomId = this.roomId();
    return roomId !== null
      ? this.charges().filter((charge) => charge.roomId === roomId && !charge.tenantId)
      : this.buildingWide();
  });

  readonly roomOverrideCount = computed(() =>
    new Set(this.charges().filter((charge) => !!charge.roomId && !charge.tenantId).map((charge) => charge.roomId)).size);

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    billingType: 'FIXED' as UtilityBillingType,
    billingTiming: 'CURRENT_MONTH' as Timing,
    fixedAmount: [null as number | null, [Validators.min(0)]],
    unitRate: [null as number | null, [Validators.min(0)]],
    percentage: [null as number | null, [Validators.min(0), Validators.max(100)]],
    unit: '',
    includedInRent: false
  });

  constructor() {
    effect(() => {
      this.agencyId();
      this.buildingId();
      this.roomId();
      void this.reload();
    });
  }

  /** A same-named room charge replaces the building's for that room. */
  isReplaced(charge: ChargeTemplate): boolean {
    const name = charge.name.trim().toLowerCase();
    return this.own().some((mine) => mine.isActive && mine.name.trim().toLowerCase() === name);
  }

  describe(charge: ChargeTemplate): string {
    if (charge.includedInRent) {
      return 'Included in rent';
    }

    switch (charge.billingType) {
      case 'FIXED':
        return `${charge.fixedAmount ?? '-'} a month`;
      case 'PERCENTAGE_OF_RENT':
        return `${charge.percentage ?? '-'}% of rent`;
      default:
        return `${charge.unitRate ?? '-'}${charge.unit ? ' per ' + charge.unit : ' per unit'}`;
    }
  }

  startAdd(): void {
    this.editing.set(null);
    this.resetForm();
    this.formOpen.set(true);
  }

  /** A room charge of the same name, prefilled from the building's, for this room to differ. */
  startOverride(charge: ChargeTemplate): void {
    this.editing.set(null);
    this.resetForm(charge);
    this.formOpen.set(true);
  }

  startEdit(charge: ChargeTemplate): void {
    this.editing.set(charge);
    this.resetForm(charge);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.saveError.set(null);
  }

  private resetForm(from?: ChargeTemplate): void {
    const num = (value: number | string | null | undefined) => value === null || value === undefined ? null : Number(value);
    this.saveError.set(null);
    this.form.reset({
      name: from?.name ?? '',
      billingType: from?.billingType ?? 'FIXED',
      billingTiming: (from?.billingTiming as Timing | undefined) ?? 'CURRENT_MONTH',
      fixedAmount: num(from?.fixedAmount),
      unitRate: num(from?.unitRate),
      percentage: num(from?.percentage),
      unit: from?.unit ?? '',
      includedInRent: from?.includedInRent ?? false
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const metered = value.billingType === 'METERED' || value.billingType === 'PER_UNIT';
    const base = {
      name: value.name.trim(),
      billingType: value.billingType,
      billingTiming: value.billingTiming,
      // Only the figure the chosen type uses, so a switched type leaves no stale rate.
      fixedAmount: value.billingType === 'FIXED' ? value.fixedAmount : null,
      unitRate: metered ? value.unitRate : null,
      percentage: value.billingType === 'PERCENTAGE_OF_RENT' ? value.percentage : null,
      unit: metered ? value.unit || null : null,
      includedInRent: value.includedInRent
    };

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const editing = this.editing();
      if (editing) {
        await firstValueFrom(this.rent.updateChargeTemplate(this.agencyId(), this.buildingId(), editing.id, base));
      } else {
        await firstValueFrom(this.rent.createChargeTemplate(this.agencyId(), this.buildingId(), {
          ...base,
          roomId: this.roomId()
        }));
      }
      this.closeForm();
      await this.reload();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** There is no delete: a charge is stopped, which keeps the months already billed readable. */
  async toggleActive(charge: ChargeTemplate): Promise<void> {
    if (charge.isActive && !await this.confirm.ask({
      title: `Stop charging ${charge.name}?`,
      message: this.isRoom()
        ? 'From next month this room is no longer charged it. Months already billed are unchanged.'
        : 'From next month no room is charged it, unless a room has its own. Months already billed are unchanged.',
      confirmLabel: 'Stop charge',
      destructive: true
    })) {
      return;
    }

    this.busyId.set(charge.id);
    try {
      await firstValueFrom(this.rent.updateChargeTemplate(this.agencyId(), this.buildingId(), charge.id, {
        isActive: !charge.isActive
      }));
      await this.reload();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const roomId = this.roomId();
    try {
      this.charges.set(await firstValueFrom(roomId !== null
        ? this.rent.getChargeTemplatesForRoom(this.agencyId(), this.buildingId(), roomId)
        : this.rent.getChargeTemplates(this.agencyId(), this.buildingId())));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
