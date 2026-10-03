import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
import { ChargeCatalogItem, ChargeTemplate, UtilityBillingType } from '../models/rent.models';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

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
    EmptyStateComponent,
    NgTemplateOutlet,
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
            <button type="button" class="btn btn-primary btn-sm" (click)="startAdd()">Add charge</button>
          </app-permission-gate>
        }
      </ng-container>

      @switch (level()) {
        @case ('agency') { <p class="hint">Applies to every building. A building or room can override a charge by name.</p> }
        @case ('building') { <p class="hint">Applies to every room. Agency charges apply too, unless one here has the same name.</p> }
        @case ('tenant') { <p class="hint">The room's charges apply. Add one here only for an agreed arrangement with this tenant; it replaces the room's charge of the same name while they stay in this room.</p> }
        @default { <p class="hint">Building and agency charges apply here. Add one only if this room differs.</p> }
      }

      @if (formOpen()) {
        <form class="stack charge-form" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
          <!-- Capped columns: four fields on one desktop row, the buttons in the next free column. -->
          <div class="form-grid">
            <!--
              Picked from the platform's list, so Water is spelled one way and an
              override lands on the charge it overrides. "Other" still lets a
              landlord bill something the list does not have.
            -->
            <label class="field">
              <span>Charge</span>
              @if (catalog().length > 0) {
                <select formControlName="choice" [attr.aria-describedby]="'charge-hint'">
                  <option value="">Choose a charge</option>
                  @for (item of catalog(); track item.id) {
                    <option [value]="item.name">{{ item.name }}</option>
                  }
                  <option [value]="OTHER">Other — type a name</option>
                </select>
              }
              @if (catalog().length === 0 || form.controls.choice.value === OTHER) {
                <input formControlName="name" placeholder="Name of the charge">
                @if (catalogMatch(); as match) {
                  <small class="hint">{{ match.name }} is already on the list — it will be used.</small>
                }
              }
              @if (chosenItem()?.description; as description) {
                <small class="hint" id="charge-hint">{{ description }}</small>
              }
              <app-field-error [control]="form.controls.name" label="Charge" />
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
                <span class="input-prefix"><span class="input-prefix__unit">{{ currency }}</span>
                  <input type="number" step="0.01" min="0" formControlName="fixedAmount"></span>
              </label>
            } @else if (form.controls.billingType.value === 'PERCENTAGE_OF_RENT') {
              <label class="field">
                <span>Percentage of rent</span>
                <input type="number" step="0.01" min="0" max="100" formControlName="percentage">
              </label>
            } @else {
              <label class="field">
                <span>Price per unit</span>
                <span class="input-prefix"><span class="input-prefix__unit">{{ currency }}</span>
                  <input type="number" step="0.01" min="0" formControlName="unitRate"></span>
              </label>
              <label class="field"><span>Unit</span><input formControlName="unit" placeholder="m³, kWh"></label>
              @if (form.controls.billingType.value === 'METERED') {
                <label class="field"><span>Meter number</span><input formControlName="meterNumber" placeholder="WM-204"></label>
              }
            }

            <div class="field">
              <label for="charge-billed-for">Billed for</label>
              <select id="charge-billed-for" formControlName="billingTiming">
                <option value="CURRENT_MONTH">The current month</option>
                <option value="PRIOR_MONTH_ARREARS">The month before</option>
                <option value="ADVANCE">The coming month</option>
              </select>
              <!-- The exception to the billing above, so it sits with it rather than alone below the form. -->
              <label class="checkbox-field">
                <input type="checkbox" formControlName="includedInRent">
                <span>Already included in the rent — do not bill separately</span>
              </label>
            </div>

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : (editing() ? 'Save charge' : 'Add charge') }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="closeForm()">Cancel</button>
            </div>
          </div>

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save the charge" [message]="apiError.message" [details]="apiError.details" />
          }
        </form>
      }

      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading charges..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else {
        <!-- Inherited rows on a tint: read-only context from above, set apart from what this level owns. -->
        @if (inherited().length > 0) {
          <div class="inherited">
            <p class="group-label">{{ inheritedLabel() }}</p>
            <ng-container *ngTemplateOutlet="chargeTable; context: { $implicit: inherited(), inherited: true }" />
          </div>
        }

        @if (level() !== 'agency' && inherited().length > 0) {
          <p class="group-label">{{ ownLabel() }}</p>
        }
        @if (own().length === 0) {
          <!-- Empty is where adding starts: the action sits in the space, not only in the header. -->
          @if (canWrite() && !formOpen() && inherited().length === 0) {
            <app-empty-state [title]="emptyLabel()" [description]="emptyHint()" actionLabel="Add charge" (action)="startAdd()" />
          } @else {
            <p class="muted">{{ emptyLabel() }}</p>
          }
        } @else {
          <ng-container *ngTemplateOutlet="chargeTable; context: { $implicit: own(), inherited: false }" />
        }

        @if (level() === 'building' && roomOverrideCount() > 0) {
          <p class="muted">{{ roomOverrideCount() }} room{{ roomOverrideCount() === 1 ? ' has' : 's have' }} a charge of their own.</p>
        }
      }
    </app-section-card>

    <ng-template #chargeTable let-rows let-inherited="inherited">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              <th>Charge type</th>
              <th>Included in rent</th>
              <th>Billed for</th>
              <th>Status</th>
              <th><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (charge of asCharges(rows); track charge.id) {
              <tr [class.charge--off]="!charge.isActive || (inherited && isReplaced(charge))">
                <td><strong>{{ charge.name }}</strong></td>
                <td>{{ amount(charge) }}</td>
                <td>{{ typeLabel(charge) }}</td>
                <td>{{ charge.includedInRent ? 'Yes' : 'No' }}</td>
                <td>{{ timingLabel(charge) }}</td>
                <td>
                  @if (inherited && isReplaced(charge)) {
                    <span class="status-chip status-chip--neutral">Replaced here</span>
                  } @else {
                    <span class="status-chip" [class.status-chip--success]="charge.isActive" [class.status-chip--neutral]="!charge.isActive">
                      {{ charge.isActive ? 'Active' : 'Stopped' }}
                    </span>
                  }
                </td>
                <td class="charge__actions-cell">
                  <app-permission-gate [permissions]="[Permissions.RENT_ARREAR_WRITE]">
                    <div class="charge__actions">
                      @if (inherited) {
                        @if (!isReplaced(charge)) {
                          <button type="button" class="btn btn-secondary btn-sm" (click)="startOverride(charge)">{{ overrideLabel() }}</button>
                        }
                      } @else {
                        <button type="button" class="icon-action" (click)="startEdit(charge)"
                                [attr.aria-label]="'Edit ' + charge.name" title="Edit">
                          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === charge.id" (click)="toggleActive(charge)">
                          {{ charge.isActive ? 'Stop' : 'Resume' }}
                        </button>
                      }
                    </div>
                  </app-permission-gate>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }


    .charge-form {
      padding: 0.85rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }

    .inherited {
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem 0.85rem 0.25rem;
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }
    .inherited .table td, .inherited .table th { background: transparent; }

    .group-label { margin: 0.2rem 0 0; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); }

    .charge--off td { opacity: 0.65; }
    .charge__actions-cell { width: 1%; white-space: nowrap; }
    .charge__actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; }

    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UtilityChargesComponent {
  readonly Permissions = PermissionConstants;
  /** Shown on money fields; the platform's currency until it is configurable per agency. */
  readonly currency = 'KES';

  readonly agencyId = input.required<number>();
  /** Absent: the agency's own list, which every building inherits. */
  readonly buildingId = input<number | null>(null);
  /** Given, the room's view: what it inherits plus its own. Absent, the building's list. */
  readonly roomId = input<number | null>(null);
  /** Given (with a building), the tenant's view: their room's charges plus overrides for them alone. */
  readonly tenantId = input<number | null>(null);

  readonly level = computed<'agency' | 'building' | 'room' | 'tenant'>(() =>
    this.tenantId() !== null && this.buildingId() !== null ? 'tenant'
      : this.roomId() !== null ? 'room' : this.buildingId() !== null ? 'building' : 'agency');

  readonly inheritedLabel = computed(() => {
    switch (this.level()) {
      case 'tenant': return 'From the room, building and agency';
      case 'room': return 'From the building and agency';
      default: return 'From the agency';
    }
  });

  readonly ownLabel = computed(() => {
    switch (this.level()) {
      case 'tenant': return 'This tenant only';
      case 'room': return 'This room only';
      default: return 'This building';
    }
  });

  readonly canWrite = computed(() => this.contextForWrite.can(PermissionConstants.RENT_ARREAR_WRITE));
  private readonly contextForWrite = inject(ActiveContextService);

  /** What adding the first charge does at this level. */
  readonly emptyHint = computed(() => {
    switch (this.level()) {
      case 'agency': return 'Water, garbage, security — charged in every building each month.';
      case 'building': return 'Charged to every room in this building each month.';
      case 'room': return 'Only if this room is charged differently from its building.';
      default: return 'Only for an arrangement agreed with this tenant.';
    }
  });

  readonly emptyLabel = computed(() => {
    switch (this.level()) {
      case 'tenant': return 'None — this tenant pays what their room is charged.';
      case 'room': return 'None — this room pays what the building sets.';
      default: return 'No monthly charges yet.';
    }
  });

  readonly overrideLabel = computed(() => {
    switch (this.level()) {
      case 'tenant': return 'Change for this tenant';
      case 'room': return 'Change for this room';
      default: return 'Change for this building';
    }
  });

  /** On a building's page: the agency's templates, which apply unless the building has one by the same name. */
  private readonly agencyCharges = signal<ChargeTemplate[]>([]);

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

  /** Building-wide charges: no room, no tenant, and not the agency's. */
  private readonly buildingWide = computed(() =>
    this.charges().filter((charge) => !charge.roomId && !charge.tenantId && charge.level !== 'AGENCY'));

  readonly inherited = computed(() => {
    switch (this.level()) {
      // The room's effective list: whatever is not the room's own came from above.
      case 'room': return this.charges().filter((charge) => !charge.roomId && !charge.tenantId);
      case 'tenant': return this.charges().filter((charge) => !charge.tenantId);
      case 'building': return this.agencyCharges().filter((charge) => charge.isActive !== false);
      default: return [];
    }
  });

  readonly own = computed(() => {
    const roomId = this.roomId();
    switch (this.level()) {
      case 'room': return this.charges().filter((charge) => charge.roomId === roomId && !charge.tenantId);
      case 'tenant': return this.charges().filter((charge) => charge.tenantId === this.tenantId());
      case 'building': return this.buildingWide();
      default: return this.charges();
    }
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
    meterNumber: '',
    includedInRent: false,
    /** The catalog entry picked, OTHER for a typed name, or '' for none yet. Drives `name`. */
    choice: ''
  });

  readonly OTHER = '__other__';
  readonly catalog = signal<ChargeCatalogItem[]>([]);
  private readonly choice = toSignal(this.form.controls.choice.valueChanges, { initialValue: '' });
  private readonly typedName = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });

  readonly chosenItem = computed(() => this.catalog().find((item) => item.name === this.choice()) ?? null);

  /** A typed name that is a catalog charge in another spelling — it will be saved as that charge. */
  readonly catalogMatch = computed(() => {
    if (this.choice() !== this.OTHER) {
      return null;
    }
    const typed = (this.typedName() ?? '').trim().toLowerCase();
    return typed ? this.catalog().find((item) => item.name.toLowerCase() === typed) ?? null : null;
  });

  constructor() {
    // The list is the same for every level; a missing one just leaves the free-text name.
    firstValueFrom(this.rent.getChargeCatalog())
      .then((items) => this.catalog.set(items))
      .catch(() => this.catalog.set([]));

    // Picking a charge names it and starts its billing from the catalog's defaults — the landlord
    // can still change them. Only on the operator's own pick: resetForm sets the choice silently.
    this.form.controls.choice.valueChanges.pipe(takeUntilDestroyed()).subscribe((choice) => {
      const item = this.catalog().find((entry) => entry.name === choice);
      if (item) {
        this.form.patchValue({
          name: item.name,
          billingType: item.billingType,
          billingTiming: item.billingTiming,
          unit: item.unit ?? ''
        });
      } else if (choice === this.OTHER) {
        this.form.controls.name.setValue('');
      }
    });

    effect(() => {
      this.agencyId();
      this.buildingId();
      this.roomId();
      this.tenantId();
      void this.reload();
    });
  }

  /** A same-named room charge replaces the building's for that room. */
  isReplaced(charge: ChargeTemplate): boolean {
    const name = charge.name.trim().toLowerCase();
    return this.own().some((mine) => mine.isActive && mine.name.trim().toLowerCase() === name);
  }

  /** The template context is untyped; this types it. */
  asCharges(rows: unknown): ChargeTemplate[] {
    return rows as ChargeTemplate[];
  }

  amount(charge: ChargeTemplate): string {
    switch (charge.billingType) {
      case 'FIXED':
        return `${charge.fixedAmount ?? '-'}`;
      case 'PERCENTAGE_OF_RENT':
        return `${charge.percentage ?? '-'}% of rent`;
      default:
        return `${charge.unitRate ?? '-'} per ${charge.unit || 'unit'}`;
    }
  }

  typeLabel(charge: ChargeTemplate): string {
    switch (charge.billingType) {
      case 'FIXED': return 'Fixed';
      case 'METERED': return 'Metered';
      case 'PER_UNIT': return 'Per unit';
      case 'PERCENTAGE_OF_RENT': return 'Share of rent';
      default: return '-';
    }
  }

  timingLabel(charge: ChargeTemplate): string {
    switch (charge.billingTiming) {
      case 'CURRENT_MONTH': return 'Current month';
      case 'PRIOR_MONTH_ARREARS': return 'Previous month';
      case 'ADVANCE': return 'Next month';
      default: return '-';
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
      meterNumber: from?.meterNumber ?? '',
      includedInRent: from?.includedInRent ?? false,
      choice: this.choiceFor(from?.name)
    }, { emitEvent: false });
  }

  /** An existing name shows as its catalog entry when it is one, otherwise as a typed "Other". */
  private choiceFor(name: string | undefined): string {
    if (!name) {
      return '';
    }
    return this.catalog().some((item) => item.name === name) ? name : this.OTHER;
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const metered = value.billingType === 'METERED' || value.billingType === 'PER_UNIT';
    const base = {
      // A typed name that is already on the list is saved as the listed charge (the server does the same).
      name: this.catalogMatch()?.name ?? value.name.trim(),
      billingType: value.billingType,
      billingTiming: value.billingTiming,
      // Only the figure the chosen type uses, so a switched type leaves no stale rate.
      fixedAmount: value.billingType === 'FIXED' ? value.fixedAmount : null,
      unitRate: metered ? value.unitRate : null,
      percentage: value.billingType === 'PERCENTAGE_OF_RENT' ? value.percentage : null,
      unit: metered ? value.unit || null : null,
      meterNumber: value.billingType === 'METERED' ? value.meterNumber.trim() || null : null,
      includedInRent: value.includedInRent
    };

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const editing = this.editing();
      const buildingId = this.buildingId();
      const tenantId = this.level() === 'tenant' ? this.tenantId() : null;
      if (editing) {
        await firstValueFrom(buildingId === null
          ? this.rent.updateAgencyChargeTemplate(this.agencyId(), editing.id, base)
          : this.rent.updateChargeTemplate(this.agencyId(), buildingId, editing.id, base));
      } else {
        await firstValueFrom(buildingId === null
          ? this.rent.createAgencyChargeTemplate(this.agencyId(), base)
          : tenantId !== null
            ? this.rent.createTenantChargeTemplate(this.agencyId(), buildingId, tenantId, base)
            : this.rent.createChargeTemplate(this.agencyId(), buildingId, { ...base, roomId: this.roomId() }));
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
      message: this.level() === 'tenant'
        ? 'From next month this tenant pays their room\'s charge of that name again, if it has one. Months already billed are unchanged.'
        : this.isRoom()
        ? 'From next month this room is no longer charged it. Months already billed are unchanged.'
        : this.level() === 'agency'
          ? 'From next month no building is charged it, unless one has its own. Months already billed are unchanged.'
          : 'From next month no room is charged it, unless a room has its own. Months already billed are unchanged.',
      confirmLabel: 'Stop charge',
      destructive: true
    })) {
      return;
    }

    this.busyId.set(charge.id);
    try {
      const buildingId = this.buildingId();
      await firstValueFrom(buildingId === null
        ? this.rent.updateAgencyChargeTemplate(this.agencyId(), charge.id, { isActive: !charge.isActive })
        : this.rent.updateChargeTemplate(this.agencyId(), buildingId, charge.id, { isActive: !charge.isActive }));
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
    const buildingId = this.buildingId();
    const tenantId = this.tenantId();
    try {
      if (buildingId === null) {
        this.charges.set(await firstValueFrom(this.rent.getAgencyChargeTemplates(this.agencyId())));
      } else if (tenantId !== null) {
        this.charges.set(await firstValueFrom(this.rent.getChargeTemplatesForTenant(this.agencyId(), buildingId, tenantId)));
      } else if (roomId !== null) {
        this.charges.set(await firstValueFrom(this.rent.getChargeTemplatesForRoom(this.agencyId(), buildingId, roomId)));
      } else {
        const [own, agency] = await Promise.all([
          firstValueFrom(this.rent.getChargeTemplates(this.agencyId(), buildingId)),
          // The agency's list is context, not the page's job: without access to it, show the building's alone.
          firstValueFrom(this.rent.getAgencyChargeTemplates(this.agencyId())).catch(() => [] as ChargeTemplate[])
        ]);
        this.charges.set(own);
        this.agencyCharges.set(agency);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
