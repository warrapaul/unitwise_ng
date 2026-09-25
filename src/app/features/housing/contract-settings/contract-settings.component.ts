import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import {
  AgencyContractSettings,
  BuildingContractSettings,
  ParkingPolicy,
  PetsPolicy,
  ServiceChargeBorneBy,
  StampDutyBorneBy
} from '../models/housing.models';

type ContractSettings = BuildingContractSettings;

type Option<T extends string> = { value: T; label: string };

const PETS: Option<PetsPolicy>[] = [
  { value: 'PERMITTED', label: 'Permitted' },
  { value: 'NOT_PERMITTED', label: 'Not permitted' },
  { value: 'ON_APPROVAL', label: 'With the landlord\'s written approval' }
];
const PARKING: Option<ParkingPolicy>[] = [
  { value: 'INCLUDED', label: 'Included in the rent' },
  { value: 'EXTRA', label: 'At an extra monthly charge' },
  { value: 'NONE', label: 'No parking' }
];
const SERVICE_CHARGE: Option<ServiceChargeBorneBy>[] = [
  { value: 'LANDLORD', label: 'Landlord' },
  { value: 'TENANT', label: 'Tenant' }
];
const STAMP_DUTY: Option<StampDutyBorneBy>[] = [
  { value: 'LANDLORD', label: 'Landlord' },
  { value: 'TENANT', label: 'Tenant' },
  { value: 'SHARED', label: 'Shared equally' }
];

function labelOf<T extends string>(options: Option<T>[], value?: T | null): string {
  return options.find((option) => option.value === value)?.label ?? '-';
}

/**
 * The values a lease states that belong to the property rather than the
 * tenancy: who the landlord is, where rent is paid, and the house rules.
 *
 * Two levels, one form. The agency records them once for every lease it
 * issues; a building overrides any of them, and a value it leaves blank falls
 * back to the agency's. The building adds its LR number, which only a
 * building has. Town comes from the building's address, not from here.
 *
 * Nothing here is needed when the contract wording no longer refers to these
 * values — the readiness check only asks for the ones the document uses.
 *
 * One card, two states (§38): the values, or the form over them.
 */
@Component({
  selector: 'app-contract-settings',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    SectionCardComponent,
    DetailGroupComponent,
    ErrorCardComponent,
    ErrorStateComponent,
    LoadingStateComponent,
    FieldErrorComponent,
    FormFeedbackDirective,
    UnitPipe
  ],
  template: `
    <app-section-card [title]="title()" [subtitle]="subtitle()">
      <ng-container actions>
        <div class="icon-row">
          @if (templateLink(); as link) {
            <a class="btn btn-secondary btn-sm" [routerLink]="link">Contract template</a>
          }
          @if (canEdit() && !editing() && !loading() && !error()) {
            <button type="button" class="icon-action" (click)="startEdit()" aria-label="Edit contract details" title="Edit contract details">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
            </button>
          }
        </div>
      </ng-container>

      @if (loading()) {
        <app-loading-state label="Loading contract details..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (!editing()) {
        <!-- One line on where these apply; a landlord sets them once, not per building. -->
        <p class="hint">
          {{ isBuilding() ? 'Only what differs for this building. Anything marked "agency" comes from the agency.' : 'Used for every building and room, unless a building sets its own.' }}
        </p>
        <div class="detail-groups">
          @if (isBuilding()) {
            <app-detail-group label="Premises">
              <div class="lead"><dt>LR number</dt><dd class="mono">{{ settings().lrNumber || '-' }}</dd></div>
            </app-detail-group>
          }

          <app-detail-group label="Landlord">
            <div class="lead"><dt>Name</dt><dd>{{ shown('landlordFullName') }}@if (isInherited('landlordFullName')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>ID / passport</dt><dd class="mono">{{ shown('landlordIdNumber') }}@if (isInherited('landlordIdNumber')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Phone</dt><dd class="mono">{{ shown('landlordPhone') }}@if (isInherited('landlordPhone')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Email</dt><dd>{{ shown('landlordEmail') }}@if (isInherited('landlordEmail')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Postal address</dt><dd>{{ shown('landlordPostalAddress') }}@if (isInherited('landlordPostalAddress')) { <span class="muted inherited">agency</span> }</dd></div>
          </app-detail-group>

          <app-detail-group label="Payment">
            <div><dt>M-Pesa paybill</dt><dd class="mono">{{ shown('mpesaPaybill') }}@if (isInherited('mpesaPaybill')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Account</dt><dd class="mono">{{ shown('mpesaAccount') }}@if (isInherited('mpesaAccount')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Bank account</dt><dd>{{ shown('bankAccount') }}@if (isInherited('bankAccount')) { <span class="muted inherited">agency</span> }</dd></div>
          </app-detail-group>

          <app-detail-group label="House rules">
            <div><dt>Pets</dt><dd>{{ label(PETS, effective('petsPolicy')) }}@if (isInherited('petsPolicy')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Parking</dt><dd>{{ label(PARKING, effective('parkingPolicy')) }}@if (isInherited('parkingPolicy')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Service charge paid by</dt><dd>{{ label(SERVICE_CHARGE, effective('serviceChargeBorneBy')) }}@if (isInherited('serviceChargeBorneBy')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Stamp duty paid by</dt><dd>{{ label(STAMP_DUTY, effective('stampDutyBorneBy')) }}@if (isInherited('stampDutyBorneBy')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Notice period</dt><dd>{{ effective('noticePeriodDays') | unit: 'days' }}@if (isInherited('noticePeriodDays')) { <span class="muted inherited">agency</span> }</dd></div>
            <div><dt>Utilities</dt><dd>{{ shown('utilitiesNote') }}@if (isInherited('utilitiesNote')) { <span class="muted inherited">agency</span> }</dd></div>
          </app-detail-group>
        </div>
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
          @if (isBuilding()) {
            <p class="hint">Leave a value blank to use the agency's.</p>

            <div class="grid-auto">
              <label class="field">
                <span>LR number</span>
                <input formControlName="lrNumber">
                <app-field-error [control]="form.controls.lrNumber" label="LR number" />
              </label>
            </div>
          } @else {
            <p class="hint">Buildings can override any of these; the agency's apply where they do not.</p>
          }

          <div class="grid-auto">
            <label class="field">
              <span>Landlord name</span>
              <input formControlName="landlordFullName" [placeholder]="fallback(\'landlordFullName\')">
              <app-field-error [control]="form.controls.landlordFullName" label="Landlord name" />
            </label>
            <label class="field">
              <span>ID / passport number</span>
              <input formControlName="landlordIdNumber" [placeholder]="fallback(\'landlordIdNumber\')">
              <app-field-error [control]="form.controls.landlordIdNumber" label="ID / passport number" />
            </label>
            <label class="field">
              <span>Phone</span>
              <input type="tel" formControlName="landlordPhone" [placeholder]="fallback(\'landlordPhone\')">
              <app-field-error [control]="form.controls.landlordPhone" label="Phone" />
            </label>
            <label class="field">
              <span>Email</span>
              <input type="email" formControlName="landlordEmail" [placeholder]="fallback(\'landlordEmail\')">
              <app-field-error [control]="form.controls.landlordEmail" label="Email" />
            </label>
            <label class="field field--wide">
              <span>Postal address</span>
              <input formControlName="landlordPostalAddress" [placeholder]="fallback(\'landlordPostalAddress\')">
              <app-field-error [control]="form.controls.landlordPostalAddress" label="Postal address" />
            </label>
          </div>

          <div class="grid-auto">
            <label class="field">
              <span>M-Pesa paybill</span>
              <input formControlName="mpesaPaybill" [placeholder]="fallback(\'mpesaPaybill\')" inputmode="numeric">
              <app-field-error [control]="form.controls.mpesaPaybill" label="M-Pesa paybill" />
            </label>
            <label class="field">
              <span>Account</span>
              <input formControlName="mpesaAccount" [placeholder]="fallback(\'mpesaAccount\')">
              <app-field-error [control]="form.controls.mpesaAccount" label="Account" />
            </label>
            <label class="field">
              <span>Bank account</span>
              <input formControlName="bankAccount" [placeholder]="fallback(\'bankAccount\')">
              <app-field-error [control]="form.controls.bankAccount" label="Bank account" />
            </label>
          </div>

          <div class="grid-auto">
            <label class="field">
              <span>Pets</span>
              <select formControlName="petsPolicy">
                <option value="">{{ unsetOption(PETS, 'petsPolicy') }}</option>
                @for (option of PETS; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Parking</span>
              <select formControlName="parkingPolicy">
                <option value="">{{ unsetOption(PARKING, 'parkingPolicy') }}</option>
                @for (option of PARKING; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Service charge paid by</span>
              <select formControlName="serviceChargeBorneBy">
                <option value="">{{ unsetOption(SERVICE_CHARGE, 'serviceChargeBorneBy') }}</option>
                @for (option of SERVICE_CHARGE; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Stamp duty paid by</span>
              <select formControlName="stampDutyBorneBy">
                <option value="">{{ unsetOption(STAMP_DUTY, 'stampDutyBorneBy') }}</option>
                @for (option of STAMP_DUTY; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Notice period (days)</span>
              <input type="number" min="0" max="365" formControlName="noticePeriodDays" [placeholder]="fallback('noticePeriodDays')">
              <app-field-error [control]="form.controls.noticePeriodDays" label="Notice period" />
            </label>
            <label class="field field--wide">
              <span>Utilities</span>
              <textarea formControlName="utilitiesNote" rows="2" [placeholder]="fallback('utilitiesNote') || 'e.g. Water and electricity are paid by the tenant.'"></textarea>
              <app-field-error [control]="form.controls.utilitiesNote" label="Utilities" />
            </label>
          </div>

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save the contract details" [message]="apiError.message" [details]="apiError.details" />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save contract details' }}
            </button>
            <button type="button" class="btn btn-secondary" (click)="cancelEdit()">Cancel</button>
          </div>
        </form>
      }
    </app-section-card>
  `,
  styles: [`
    .icon-row { display: flex; align-items: center; gap: 0.4rem; }
    .inherited { margin-left: 0.35rem; font-size: 0.78rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContractSettingsComponent {
  readonly PETS = PETS;
  readonly PARKING = PARKING;
  readonly SERVICE_CHARGE = SERVICE_CHARGE;
  readonly STAMP_DUTY = STAMP_DUTY;
  readonly label = labelOf;

  readonly agencyId = input.required<number>();
  /** Given, the building's own settings; absent, the agency's. */
  readonly buildingId = input<number | null>(null);
  readonly title = input('Contract details');
  readonly subtitle = input<string | null>(null);
  /** Open straight on the form — where the card is the answer to "what is missing". */
  readonly startEditing = input(false);
  /** Where the wording these values fill is edited, when the operator may. */
  readonly templateLink = input<string | null>(null);

  /** After a successful save, so a readiness check beside it can run again. */
  readonly saved = output<ContractSettings>();

  private readonly housing = inject(HousingService);
  private readonly context = inject(ActiveContextService);
  private readonly session = inject(AuthSessionService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly isBuilding = computed(() => this.buildingId() !== null);

  /** What the agency sets, for a building's blank fields. Empty at agency level. */
  private readonly agencyDefaults = computed<AgencyContractSettings>(() =>
    this.isBuilding() ? (this.settings().agencyDefaults ?? {}) : {});

  /** The building's own value, else the agency's — what a lease here would state. */
  effective<K extends keyof AgencyContractSettings>(key: K): AgencyContractSettings[K] | null {
    const own = this.settings()[key];
    return own !== null && own !== undefined && own !== '' ? own : (this.agencyDefaults()[key] ?? null);
  }

  /** Blank here, filled by the agency — shown, but marked as not this building's own. */
  isInherited(key: keyof AgencyContractSettings): boolean {
    const own = this.settings()[key];
    const blank = own === null || own === undefined || own === '';
    const inherited = this.agencyDefaults()[key];
    return blank && inherited !== null && inherited !== undefined && inherited !== '';
  }

  shown(key: keyof AgencyContractSettings): string {
    const value = this.effective(key);
    return value === null || value === undefined || value === '' ? '-' : String(value);
  }

  /** "Using agency's: Jane Landlord" in an empty building field, so blank reads as inherited, not missing. */
  fallback(key: keyof AgencyContractSettings): string {
    const inherited = this.agencyDefaults()[key];
    return inherited !== null && inherited !== undefined && inherited !== ''
      ? `Using agency's: ${inherited}` : '';
  }

  unsetOption<T extends string>(options: Option<T>[], key: keyof AgencyContractSettings): string {
    const inherited = this.agencyDefaults()[key] as T | null | undefined;
    return inherited ? `Use agency's (${labelOf(options, inherited)})` : 'Not set';
  }
  /**
   * Checked against the agency on screen, not only the switcher's. With "All my
   * agencies" or another agency active, the active role's permissions did not
   * include this agency's grant, and the Edit icon never appeared.
   */
  readonly canEdit = computed(() => {
    const permission = this.isBuilding() ? PermissionConstants.BUILDING_UPDATE : PermissionConstants.AGENCY_UPDATE;
    return this.context.can(permission)
      || this.context.isSuperAdmin()
      || this.session.hasPermissionInAgency(permission, this.agencyId());
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly settings = signal<ContractSettings>({});
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  // Lengths mirror the @Size on AgencyProfileDtos.ContractSettings.
  readonly form = this.formBuilder.group({
    lrNumber: ['', [Validators.maxLength(50)]],
    landlordFullName: ['', [Validators.maxLength(150)]],
    landlordIdNumber: ['', [Validators.maxLength(50)]],
    landlordPostalAddress: ['', [Validators.maxLength(255)]],
    landlordPhone: ['', [Validators.maxLength(20)]],
    landlordEmail: ['', [Validators.email, Validators.maxLength(200)]],
    mpesaPaybill: ['', [Validators.maxLength(50)]],
    mpesaAccount: ['', [Validators.maxLength(50)]],
    bankAccount: ['', [Validators.maxLength(255)]],
    petsPolicy: '',
    parkingPolicy: '',
    serviceChargeBorneBy: '',
    stampDutyBorneBy: '',
    utilitiesNote: ['', [Validators.maxLength(1000)]],
    noticePeriodDays: [null as number | null, [Validators.min(0), Validators.max(365)]]
  });

  constructor() {
    effect(() => {
      this.agencyId();
      this.buildingId();
      void this.reload();
    });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const agencyId = this.agencyId();
    const buildingId = this.buildingId();

    try {
      this.settings.set(await firstValueFrom(buildingId !== null
        ? this.housing.getBuildingContractSettings(agencyId, buildingId)
        : this.housing.getAgencyContractSettings(agencyId)));
      if (this.startEditing() && this.canEdit()) {
        this.startEdit();
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(): void {
    const value = this.settings();
    this.form.reset({
      lrNumber: value.lrNumber ?? '',
      landlordFullName: value.landlordFullName ?? '',
      landlordIdNumber: value.landlordIdNumber ?? '',
      landlordPostalAddress: value.landlordPostalAddress ?? '',
      landlordPhone: value.landlordPhone ?? '',
      landlordEmail: value.landlordEmail ?? '',
      mpesaPaybill: value.mpesaPaybill ?? '',
      mpesaAccount: value.mpesaAccount ?? '',
      bankAccount: value.bankAccount ?? '',
      petsPolicy: value.petsPolicy ?? '',
      parkingPolicy: value.parkingPolicy ?? '',
      serviceChargeBorneBy: value.serviceChargeBorneBy ?? '',
      stampDutyBorneBy: value.stampDutyBorneBy ?? '',
      utilitiesNote: value.utilitiesNote ?? '',
      noticePeriodDays: value.noticePeriodDays ?? null
    });
    this.saveError.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.saveError.set(null);
    this.editing.set(false);
  }

  /** Every field goes, blanks as null: the endpoint replaces the whole set. */
  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const text = (entry: string) => entry.trim() || null;

    this.saving.set(true);
    this.saveError.set(null);

    const request: ContractSettings = {
      landlordFullName: text(value.landlordFullName),
      landlordIdNumber: text(value.landlordIdNumber),
      landlordPostalAddress: text(value.landlordPostalAddress),
      landlordPhone: text(value.landlordPhone),
      landlordEmail: text(value.landlordEmail),
      mpesaPaybill: text(value.mpesaPaybill),
      mpesaAccount: text(value.mpesaAccount),
      bankAccount: text(value.bankAccount),
      petsPolicy: (value.petsPolicy || null) as PetsPolicy | null,
      parkingPolicy: (value.parkingPolicy || null) as ParkingPolicy | null,
      serviceChargeBorneBy: (value.serviceChargeBorneBy || null) as ServiceChargeBorneBy | null,
      stampDutyBorneBy: (value.stampDutyBorneBy || null) as StampDutyBorneBy | null,
      utilitiesNote: text(value.utilitiesNote),
      noticePeriodDays: value.noticePeriodDays
    };
    const buildingId = this.buildingId();

    try {
      const saved = await firstValueFrom(buildingId !== null
        ? this.housing.updateBuildingContractSettings(this.agencyId(), buildingId, { ...request, lrNumber: text(value.lrNumber) })
        : this.housing.updateAgencyContractSettings(this.agencyId(), request));
      this.settings.set(saved);
      this.editing.set(false);
      this.saved.emit(saved);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
