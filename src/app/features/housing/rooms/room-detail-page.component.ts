import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { RentTermKey, RoomEffectiveTerms } from '../models/housing.models';
import { dueDayLabel, floorLabel, formatCurrency } from '../../../shared/utils/format.util';
import { RoomOverviewComponent } from './room-overview.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal, computed } from '@angular/core';
import { UtilityChargesComponent } from '../../rent/templates/utility-charges.component';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import {
  UtilityBillingType, RoomDetail, RoomUtility } from '../models/housing.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-room-detail-page',
  standalone: true,
  imports: [StatusChipComponent, MoneyInputDirective, RoomOverviewComponent,
    DangerZoneComponent,
    UtilityChargesComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    ContextGuardComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.buildingDetail(agencyId(), buildingId())" label="Back to building" />
      <app-context-guard [agencyId]="agencyId()" [buildingId]="buildingId()" requirePermission="BUILDING_READ">
      @if (loading()) {
        <app-loading-state label="Loading room…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (room(); as detail) {
        <app-section-card
          [title]="detail.name || ('Room ' + detail.roomNumber)"
          [subtitle]="detail.buildingName || null"
        >
          <!-- Edit only, on the name's row; Contract template sits with the room's details below. -->
          <ng-container actions>
            <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.ROOM_UPDATE]">
              <button type="button" class="icon-action" (click)="toggleEdit()"
                      [attr.aria-label]="editing() ? 'Close editor' : 'Edit room'" [title]="editing() ? 'Close editor' : 'Edit room'"
                      [attr.aria-pressed]="editing()">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
              </button>
            </app-permission-gate>
          </ng-container>

          <!--
            One card, two states. Showing the record and its editor at the same
            time made the operator read the same nine values twice and left it
            ambiguous which set was live. Editing replaces the view; the header,
            title and actions stay put so the page never appears to navigate.
          -->
          @if (!editing()) {
          <dl class="detail-grid">
            <div><dt>Floor</dt><dd>{{ floorName(detail.floorName) }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Maintenance</dt><dd>{{ detail.maintenanceStatus | humanLabel }}</dd></div>
            <!-- What this room pays, wherever it was set. -->
            @for (term of termRows; track term.key) {
              <div>
                <dt>{{ term.label }}</dt>
                <dd>
                  {{ termText(term.key, terms()?.[term.key]) }}
                </dd>
              </div>
            }
            <div><dt>Bills created on day</dt><dd>{{ detail.rentArrearsGenerateDay ?? '-' }}</dd></div>
            <div><dt>Amenities</dt><dd>{{ (detail.amenities ?? []).join(', ') || '-' }}</dd></div>
            <!--
              Every room has a contract; most inherit one. Saying which level it
              came from is what stops an operator editing the agency document
              expecting this room to follow, when the room forked long ago.
            -->
            <div>
              <dt>Contract</dt>
              <dd>
                @if (detail.contractTemplateCustomized) {
                  <span class="status-chip status-chip--success">Customized for this room</span>
                } @else if (detail.contractTemplateSource) {
                  <span class="status-chip status-chip--neutral">
                    Inherited from {{ detail.contractTemplateSource | humanLabel }}
                  </span>
                } @else {
                  -
                }
              </dd>
            </div>
          </dl>

          @if (detail.description) {
            <p class="muted">{{ detail.description }}</p>
          }
          } @else {
            <form [formGroup]="form" appFormFeedback (ngSubmit)="save()">
              <div class="grid-auto">
                <label class="field"><span>Name</span><input formControlName="name"></label>
                <label class="field">
                  <span>Room number</span>
                  <input type="number" min="0" formControlName="roomNumber" inputmode="numeric">
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="VACANT">Vacant</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="UNDER_MAINTENANCE">Under maintenance</option>
                  </select>
                </label>
                <label class="field"><span>Monthly rent</span><span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="monthlyRent" aria-label="Monthly rent in KES"></span>@if (defaultOffer('monthlyRent'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('monthlyRent')">{{ offer }}</button> }</label>
                <label class="field"><span>Security deposit</span><span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="securityDeposit" aria-label="Security deposit in KES"></span>@if (defaultOffer('securityDeposit'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('securityDeposit')">{{ offer }}</button> }</label>
                <label class="field">
                  <span>Rent due on day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay" inputmode="numeric">
                  @if (defaultOffer('paymentDueDay'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('paymentDueDay')">{{ offer }}</button> }
                  @if (form.controls.paymentDueDay.invalid && form.controls.paymentDueDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field">
                  <span>Bills created on day</span>
                  <input type="number" min="1" max="31" formControlName="rentArrearsGenerateDay" inputmode="numeric">
                  @if (form.controls.rentArrearsGenerateDay.invalid && form.controls.rentArrearsGenerateDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field"><span>Late fee</span><span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="lateFeeAmount" aria-label="Late fee in KES"></span>@if (defaultOffer('lateFeeAmount'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('lateFeeAmount')">{{ offer }}</button> }</label>
                <label class="field"><span>Grace period (days)</span><input type="number" min="0" formControlName="gracePeriodDays" inputmode="numeric">@if (defaultOffer('gracePeriodDays'); as offer) { <button type="button" class="link-button use-default" (click)="useDefault('gracePeriodDays')">{{ offer }}</button> }</label>
                <label class="field">
                  <span>Amenities</span>
                  <input formControlName="amenities">
                  <small class="hint">Separate each amenity with a comma.</small>
                </label>
              </div>

              <label class="field field--wide">
                <span>Description</span>
                <textarea formControlName="description" rows="2"></textarea>
              </label>

              @if (saveError(); as apiError) {
                <app-error-card title="Unable to save room" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving…' : 'Save room' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">Cancel</button>
              </div>
            </form>
          }
        </app-section-card>

        <!-- Who lives here, this month's rent, maintenance, past tenants, applications. -->
        <app-room-overview [agencyId]="numericAgencyId()" [buildingId]="numericBuildingId()" [roomId]="numericRoomId()" />

        <!--
          What this room is charged each month. The building's charges apply
          already; a room only needs its own where it differs .
        -->
        <app-utility-charges [agencyId]="numericAgencyId()" [buildingId]="numericBuildingId()" [roomId]="numericRoomId()" />

        <app-permission-gate
          [permissions]="[Permissions.CONTRACT_TEMPLATE_MANAGE, Permissions.CONTRACT_TEMPLATE_MANAGE_ALL]"
          [agencyId]="agencyId()"
        >
          <!-- A room can have its own contract wording; most use the building's. -->
          <section class="panel another">
            <span class="muted">Contract for this room</span>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.roomContractTemplate(agencyId(), buildingId(), roomId())">Contract template</a>
          </section>
        </app-permission-gate>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.ROOM_DELETE, Permissions.BUILDING_FLOOR_MANAGE]">
          <app-danger-zone label="Delete room" [busy]="deleting()" (pressed)="remove(detail)" />
        </app-permission-gate>
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .use-default { justify-self: start; padding: 0; min-height: 2rem; font-size: var(--text-sm); text-align: left; }
    .another { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-3) var(--space-5); }

    form {
      display: grid;
      gap: var(--space-5);
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .checkbox-row {
      display: flex;
      gap: var(--space-5);
      flex-wrap: wrap;
    }

    .chip-row {
      display: flex;
      gap: var(--space-1-5);
      flex-wrap: wrap;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomDetailPageComponent implements OnInit {
  readonly dueDay = dueDayLabel;
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly roomId = input.required<string>();
  readonly numericAgencyId = computed(() => Number(this.agencyId()));
  readonly numericBuildingId = computed(() => Number(this.buildingId()));
  readonly numericRoomId = computed(() => Number(this.roomId()));

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly room = signal<RoomDetail | null>(null);
  /** Effective values with the level each came from. */
  readonly terms = signal<RoomEffectiveTerms | null>(null);
  readonly floorName = floorLabel;
  readonly termRows: { key: RentTermKey; label: string }[] = [
    { key: 'monthlyRent', label: 'Monthly rent' }, { key: 'securityDeposit', label: 'Security deposit' },
    { key: 'paymentDueDay', label: 'Rent due' }, { key: 'lateFeeAmount', label: 'Late fee' }, { key: 'gracePeriodDays', label: 'Grace period' }
  ];

  termText(key: RentTermKey, value: number | string | null | undefined): string {
    if (value === null || value === undefined) {
      return '-';
    }
    return key === 'paymentDueDay' ? dueDayLabel(Number(value)) : key === 'gracePeriodDays' ? `${value} days` : formatCurrency(value);
  }

  /** The building's values: what this room pays when it sets none. */
  private readonly buildingTerms = signal<Partial<Record<RentTermKey, number | string | null>>>({});
  private readonly usedDefaults = new Set<RentTermKey>();

  /** "Use building default (KES 25,000)", only while the field holds something else. */
  defaultOffer(key: RentTermKey): string | null {
    this.formValue();
    const value = this.buildingTerms()[key];
    const current = this.form.controls[key].value;
    // Only under a value that differs from the building's.
    if (value === null || value === undefined || current === null || Number(current) === Number(value)) {
      return null;
    }
    return `Use building default (${this.termText(key, value)})`;
  }

  useDefault(key: RentTermKey): void {
    const value = this.buildingTerms()[key];
    if (value === null || value === undefined) {
      return;
    }
    this.form.controls[key].setValue(Number(value));
    this.form.controls[key].markAsDirty();
    this.usedDefaults.add(key);
  }

  private async loadBuildingTerms(): Promise<void> {
    try {
      const building = await firstValueFrom(this.housing.getBuilding(Number(this.agencyId()), Number(this.buildingId())));
      this.buildingTerms.set(building.effectiveTerms ?? {});
    } catch {
      this.buildingTerms.set({});
    }
  }

  private async loadTerms(): Promise<void> {
    try {
      const terms = await firstValueFrom(this.housing.getRoomEffectiveTerms(Number(this.agencyId()), Number(this.buildingId()), Number(this.roomId())));
      this.terms.set(terms);
      // The edit form shows what the room pays now, wherever it was set, not blanks that read as zero.
      if (!this.form.dirty) {
        const patch: Partial<Record<RentTermKey, number | null>> = {};
        for (const { key } of this.termRows) {
          const value = terms[key];
          patch[key] = value === null || value === undefined ? null : Number(value);
        }
        this.form.patchValue(patch, { emitEvent: true });
        this.form.markAsPristine();
      }
    } catch {
      this.terms.set(null);
    }
  }

  readonly deleting = signal(false);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    name: '',
    roomNumber: [null as number | null, [Validators.min(0)]],
    description: '',
    status: 'VACANT',
    monthlyRent: [null as number | null, [Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.min(0)]],
    paymentDueDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
    rentArrearsGenerateDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
    lateFeeAmount: [null as number | null, [Validators.min(0)]],
    gracePeriodDays: [null as number | null, [Validators.min(0)]],
    amenities: ''
  });
  /** Re-reads the default offers as the form changes. */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: null });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const room = await firstValueFrom(
        this.housing.getRoom(Number(this.agencyId()), Number(this.buildingId()), Number(this.roomId()))
      );
      this.room.set(room);
      this.patchForm(room);
      void this.loadTerms();
      void this.loadBuildingTerms();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  toggleEdit(): void {
    this.editing.update((value) => !value);
    this.saveError.set(null);

    const room = this.room();
    if (this.editing() && room) {
      this.patchForm(room);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      const updated = await firstValueFrom(this.housing.updateRoom(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.roomId()),
        {
          name: value.name || null,
          roomNumber: value.roomNumber,
          description: value.description || null,
          status: value.status as 'VACANT' | 'OCCUPIED' | 'UNDER_MAINTENANCE',
          monthlyRent: value.monthlyRent,
          securityDeposit: value.securityDeposit,
          paymentDueDay: value.paymentDueDay,
          // Emptied fields the room used to set go back to the building's value.
          // Back to the building's value: emptied fields the room used to set, and "Use building default" ones.
          // Follows the building after saving: emptied fields, and any equal to the building's value.
          inherit: this.termRows.map((term) => term.key).filter((key) => {
            const current = (value as Record<string, unknown>)[key];
            const building = this.buildingTerms()[key];
            return current === null || (building !== null && building !== undefined && Number(current) === Number(building));
          }),
          rentArrearsGenerateDay: value.rentArrearsGenerateDay,
          lateFeeAmount: value.lateFeeAmount,
          gracePeriodDays: value.gracePeriodDays,
          amenities: this.parseAmenities(value.amenities)
        }
      ));

      this.room.set(updated);
      this.editing.set(false);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(room: RoomDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete "${room.name || 'room ' + room.roomNumber}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.housing.deleteRoom(Number(this.agencyId()), Number(this.buildingId()), room.id));
      await this.router.navigateByUrl(RoutePaths.buildingDetail(this.agencyId(), this.buildingId()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
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


  private patchForm(room: RoomDetail): void {
    this.form.patchValue({
      name: room.name ?? '',
      roomNumber: room.roomNumber ?? null,
      description: room.description ?? '',
      status: room.status ?? 'VACANT',
      monthlyRent: room.monthlyRent === null || room.monthlyRent === undefined ? null : Number(room.monthlyRent),
      securityDeposit: room.securityDeposit === null || room.securityDeposit === undefined ? null : Number(room.securityDeposit),
      paymentDueDay: room.paymentDueDay ?? null,
      rentArrearsGenerateDay: room.rentArrearsGenerateDay ?? null,
      lateFeeAmount: room.lateFeeAmount === null || room.lateFeeAmount === undefined ? null : Number(room.lateFeeAmount),
      gracePeriodDays: room.gracePeriodDays ?? null,
      amenities: (room.amenities ?? []).join(', ')
    });
  }

  private parseAmenities(value: string): string[] | null {
    const amenities = value.split(',').map((item) => item.trim()).filter(Boolean);
    return amenities.length > 0 ? amenities : null;
  }
}
