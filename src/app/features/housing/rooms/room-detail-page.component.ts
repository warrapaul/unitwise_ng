import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
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
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-room-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    ContextGuardComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    UnitPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.buildingDetail(agencyId(), buildingId())" label="Back to building" />
      <app-context-guard [agencyId]="agencyId()" [buildingId]="buildingId()" requirePermission="BUILDING_READ">
      @if (loading()) {
        <app-loading-state label="Loading room..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (room(); as detail) {
        <app-section-card
          [title]="detail.name || ('Room ' + detail.roomNumber)"
          [subtitle]="detail.buildingName || null"
        >
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.ROOM_UPDATE, Permissions.ROOM_DELETE, Permissions.ROOM_READ]">
                <button type="button" class="btn btn-primary btn-outline" (click)="toggleEdit()">
                  {{ editing() ? 'Close editor' : 'Edit room' }}
                </button>
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                  {{ deleting() ? 'Deleting...' : 'Delete room' }}
                </button>
              </app-permission-gate>
              <app-permission-gate
                [permissions]="[Permissions.CONTRACT_TEMPLATE_MANAGE, Permissions.CONTRACT_TEMPLATE_MANAGE_ALL]"
                [agencyId]="agencyId()"
              >
                <a
                  class="btn btn-secondary"
                  [routerLink]="RoutePaths.roomContractTemplate(agencyId(), buildingId(), roomId())"
                >Contract template</a>
              </app-permission-gate>
            </div>
          </ng-container>

          <!--
            One card, two states. Showing the record and its editor at the same
            time made the operator read the same nine values twice and left it
            ambiguous which set was live. Editing replaces the view; the header,
            title and actions stay put so the page never appears to navigate.
          -->
          @if (!editing()) {
          <dl class="detail-grid">
            <div><dt>Floor</dt><dd>{{ detail.floorName || detail.floorId || '-' }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd><span class="status-chip" [ngClass]="roomStatusClass(detail.status)">{{ detail.status | humanLabel }}</span></dd>
            </div>
            <div><dt>Maintenance</dt><dd>{{ detail.maintenanceStatus | humanLabel }}</dd></div>
            <div><dt>Monthly rent</dt><dd>{{ detail.monthlyRent ?? '-' }}</dd></div>
            <div><dt>Security deposit</dt><dd>{{ detail.securityDeposit ?? '-' }}</dd></div>
            <div><dt>Payment due day</dt><dd>{{ detail.paymentDueDay ?? '-' }}</dd></div>
            <div><dt>Arrears generation day</dt><dd>{{ detail.rentArrearsGenerateDay ?? '-' }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFeeAmount ?? '-' }}</dd></div>
            <div><dt>Grace period</dt><dd>{{ detail.gracePeriodDays | unit: 'days' }}</dd></div>
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
                  <input type="number" min="0" formControlName="roomNumber">
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="VACANT">Vacant</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="UNDER_MAINTENANCE">Under maintenance</option>
                  </select>
                </label>
                <label class="field"><span>Monthly rent</span><input type="number" step="0.01" min="0" formControlName="monthlyRent"></label>
                <label class="field"><span>Security deposit</span><input type="number" step="0.01" min="0" formControlName="securityDeposit"></label>
                <label class="field">
                  <span>Payment due day</span>
                  <input type="number" min="1" max="31" formControlName="paymentDueDay">
                  @if (form.controls.paymentDueDay.invalid && form.controls.paymentDueDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field">
                  <span>Arrears generation day</span>
                  <input type="number" min="1" max="31" formControlName="rentArrearsGenerateDay">
                  @if (form.controls.rentArrearsGenerateDay.invalid && form.controls.rentArrearsGenerateDay.touched) {
                    <small class="error-text">Enter a day between 1 and 31.</small>
                  }
                </label>
                <label class="field"><span>Late fee</span><input type="number" step="0.01" min="0" formControlName="lateFeeAmount"></label>
                <label class="field"><span>Grace period (days)</span><input type="number" min="0" formControlName="gracePeriodDays"></label>
                <label class="field">
                  <span>Amenities</span>
                  <input formControlName="amenities" placeholder="Balcony, Parking">
                  <small class="hint">Separate each amenity with a comma.</small>
                </label>
              </div>

              <label class="field field--wide">
                <span>Description</span>
                <textarea formControlName="description" rows="2"></textarea>
              </label>

              <label class="field field--wide">
                <span>Additional terms</span>
                <textarea formControlName="additionalTermsAndConditions" rows="3"></textarea>
              </label>

              @if (saveError(); as apiError) {
                <app-error-card title="Unable to save room" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : 'Save room' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="toggleEdit()">Cancel</button>
              </div>
            </form>
          }
        </app-section-card>

        <app-section-card title="Utilities">
          <app-permission-gate [permissions]="[Permissions.BUILDING_FLOOR_MANAGE, Permissions.ROOM_UPDATE, Permissions.ROOM_DELETE, Permissions.ROOM_READ]">
            <ng-container actions>
              <button type="button" class="btn btn-secondary btn-sm" (click)="toggleUtilityForm()">
                {{ showUtilityForm() ? 'Close' : 'Add utility' }}
              </button>
            </ng-container>
          </app-permission-gate>

          @if (showUtilityForm()) {
            <form [formGroup]="utilityForm" appFormFeedback (ngSubmit)="addUtility()">
              <div class="grid-auto">
                <label class="field">
                  <span>Name</span>
                  <input formControlName="name" placeholder="Water">
                  @if (utilityForm.controls.name.invalid && utilityForm.controls.name.touched) {
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
                @switch (utilityForm.controls.billingType.value) {
                  @case ('FIXED') {
                    <label class="field">
                      <span>Fixed amount</span>
                      <input type="number" step="0.01" min="0" formControlName="fixedAmount">
                    </label>
                  }
                  @case ('PERCENTAGE_OF_RENT') {
                    <label class="field">
                      <span>Percentage of rent</span>
                      <input type="number" step="0.01" min="0" max="100" formControlName="percentage">
                    </label>
                  }
                  @default {
                    <label class="field">
                      <span>Unit rate</span>
                      <input type="number" step="0.01" min="0" formControlName="unitRate">
                    </label>
                    <label class="field"><span>Unit</span><input formControlName="unit" placeholder="m³"></label>
                    <label class="field"><span>Meter number</span><input formControlName="meterNumber"></label>
                  }
                }
              </div>

              <div class="checkbox-row">
                <label class="checkbox-field"><input type="checkbox" formControlName="includedInRent"><span>Included in rent</span></label>
                <label class="checkbox-field"><input type="checkbox" formControlName="isActive"><span>Active</span></label>
              </div>

              @if (utilityError(); as apiError) {
                <app-error-card title="Unable to add utility" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="addingUtility()">
                  {{ addingUtility() ? 'Adding...' : 'Add utility' }}
                </button>
              </div>
            </form>
          }

          @if ((room()?.utilities ?? []).length === 0) {
            <p class="muted">No utilities attached to this room.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Utility</th><th>Billing</th><th>Rate</th><th>Timing</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (utility of room()?.utilities ?? []; track utility.id) {
                    <tr>
                      <td>
                        <div class="cell-stack">
                          <strong>{{ utility.name }}</strong>
                          <span class="muted">{{ utility.meterNumber || utility.description || '-' }}</span>
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
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
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

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly roomId = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly room = signal<RoomDetail | null>(null);
  readonly deleting = signal(false);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly showUtilityForm = signal(false);
  readonly addingUtility = signal(false);
  readonly utilityError = signal<ApiError | null>(null);

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
    additionalTermsAndConditions: '',
    amenities: ''
  });

  readonly utilityForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    billingType: 'FIXED',
    billingTiming: 'CURRENT_MONTH',
    fixedAmount: [null as number | null, [Validators.min(0)]],
    unitRate: [null as number | null, [Validators.min(0)]],
    percentage: [null as number | null, [Validators.min(0), Validators.max(100)]],
    unit: '',
    meterNumber: '',
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
      const room = await firstValueFrom(
        this.housing.getRoom(Number(this.agencyId()), Number(this.buildingId()), Number(this.roomId()))
      );
      this.room.set(room);
      this.patchForm(room);
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

  async toggleUtilityForm(): Promise<void> {
    this.showUtilityForm.update((value) => !value);
    this.utilityError.set(null);
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
          rentArrearsGenerateDay: value.rentArrearsGenerateDay,
          lateFeeAmount: value.lateFeeAmount,
          gracePeriodDays: value.gracePeriodDays,
          additionalTermsAndConditions: value.additionalTermsAndConditions || null,
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

  async addUtility(): Promise<void> {
    if (this.utilityForm.invalid) {
      this.utilityForm.markAllAsTouched();
      return;
    }

    this.addingUtility.set(true);
    this.utilityError.set(null);

    const value = this.utilityForm.getRawValue();

    try {
      await firstValueFrom(this.housing.addRoomUtility(
        Number(this.agencyId()),
        Number(this.buildingId()),
        Number(this.roomId()),
        {
          name: value.name,
          billingType: value.billingType as UtilityBillingType,
          billingTiming: value.billingTiming as 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE',
          // Only the figure the chosen type actually uses. Sending all three
          // would leave a stale rate behind on a charge that no longer meters.
          fixedAmount: value.billingType === 'FIXED' ? value.fixedAmount : null,
          unitRate: value.billingType === 'METERED' || value.billingType === 'PER_UNIT' ? value.unitRate : null,
          percentage: value.billingType === 'PERCENTAGE_OF_RENT' ? value.percentage : null,
          unit: value.unit || null,
          meterNumber: value.meterNumber || null,
          includedInRent: value.includedInRent,
          isActive: value.isActive
        }
      ));

      this.utilityForm.reset({
        name: '',
        billingType: 'FIXED',
        billingTiming: 'CURRENT_MONTH',
        fixedAmount: null,
        percentage: null,
        unitRate: null,
        unit: '',
        meterNumber: '',
        includedInRent: false,
        isActive: true
      });
      this.showUtilityForm.set(false);
      await this.reload();
    } catch (error) {
      this.utilityError.set(toApiError(error));
    } finally {
      this.addingUtility.set(false);
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

  roomStatusClass(status?: string | null): string {
    switch (status) {
      case 'VACANT':
        return 'status-chip--success';
      case 'OCCUPIED':
        return 'status-chip--info';
      case 'UNDER_MAINTENANCE':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
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
      additionalTermsAndConditions: room.additionalTermsAndConditions ?? '',
      amenities: (room.amenities ?? []).join(', ')
    });
  }

  private parseAmenities(value: string): string[] | null {
    const amenities = value.split(',').map((item) => item.trim()).filter(Boolean);
    return amenities.length > 0 ? amenities : null;
  }
}
