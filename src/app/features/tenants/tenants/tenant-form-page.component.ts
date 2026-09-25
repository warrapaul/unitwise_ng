import { InitialPaymentsComponent, initialPaymentsGroup, toInitialPayments } from '../../rent/components/initial-payments.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants, PermissionSets } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { HousingService } from '../../housing/housing.service';
import { RoomEffectiveTerms } from '../../housing/models/housing.models';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CreateTenantRequest } from '../models/tenant.models';

/**
 * Adds a tenant to the building currently in context.
 *
 * `createTenantForBuilding` existed in the service with no way to reach it, so
 * an agency admin holding TENANT_CREATE had no route to the operation at all.
 * The endpoint is keyed `{agencyId}/{buildingId}`, which is exactly what the
 * shell's context already holds — hence the guard rather than two more pickers.
 */
@Component({
  selector: 'app-tenant-form-page',
  standalone: true,
  imports: [
    InitialPaymentsComponent,
    ReactiveFormsModule,
    RouterLink,
    ContextGuardComponent,
    SectionCardComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    RoomPickerComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="true" [requirePermission]="Permissions.TENANT_CREATE">
        <!--
          What the backend requires comes first, then the emergency contact —
          optional, but the one thing worth asking while the person is at the
          desk. Rent and deposit last: usually left to the room's own terms.
        -->
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card
            title="New tenant"
            [subtitle]="context.active().buildingName ? 'Adding to ' + context.active().buildingName : null"
          >
            <div class="grid-auto">
              <label class="field">
                <span>First name</span>
                <input formControlName="firstName">
                <app-field-error [control]="form.controls.firstName" label="First name" />
              </label>
              <label class="field">
                <span>Middle name</span>
                <input formControlName="middleName">
              </label>
              <label class="field">
                <span>Last name</span>
                <input formControlName="lastName">
                <app-field-error [control]="form.controls.lastName" label="Last name" />
              </label>
              <label class="field">
                <span>Phone number</span>
                <input type="tel" formControlName="phoneNumber" placeholder="+254712345678">
                <app-field-error
                  [control]="form.controls.phoneNumber"
                  label="Phone number"
                  patternMessage="9-15 digits, optionally starting with +."
                />
              </label>
              <label class="field">
                <span>National ID</span>
                <input formControlName="nationalIdNumber">
                <app-field-error [control]="form.controls.nationalIdNumber" label="National ID" />
              </label>
              <label class="field">
                <span>Tenant type</span>
                <select formControlName="tenantType">
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="FAMILY">Family</option>
                  <option value="STUDENT">Student</option>
                  <option value="CORPORATE">Corporate</option>
                </select>
              </label>
              <label class="field field--full">
                <span>Intended room</span>
                <app-room-picker
                  formControlName="intendedRoomId"
                  [agencyId]="context.agencyId()"
                  [buildingId]="context.buildingId()"
                />
                <app-field-error [control]="form.controls.intendedRoomId" label="Intended room" />
              </label>
              <label class="field">
                <span>Email</span>
                <input type="email" formControlName="email">
                <app-field-error [control]="form.controls.email" label="Email" />
              </label>
              <label class="field field--full">
                <span>Notes</span>
                <textarea formControlName="notes" rows="2"></textarea>
              </label>
            </div>
          </app-section-card>

          <app-section-card title="Emergency contact">
            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="emergencyContactName">
              </label>
              <label class="field">
                <span>Phone</span>
                <input type="tel" formControlName="emergencyContactPhone">
              </label>
              <label class="field">
                <span>Relationship</span>
                <input formControlName="emergencyContactRelationship">
              </label>
            </div>
          </app-section-card>

          <app-section-card title="Rent and deposit">
            <p class="hint">{{ termsHint() }}</p>
            <div class="grid-auto">
              <label class="field">
                <span>Monthly rent</span>
                <input type="number" min="0" formControlName="monthlyRent">
              </label>
              <label class="field">
                <span>Security deposit</span>
                <input type="number" min="0" formControlName="securityDeposit">
              </label>
            </div>

            <!-- Optional money received today; each part is sent only when it has an amount. -->
            <app-initial-payments [group]="payments" [rent]="form.controls.monthlyRent.value ?? roomTerms()?.monthlyRent"
                                  [deposit]="form.controls.securityDeposit.value ?? roomTerms()?.securityDeposit" />
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This tenant already exists' : 'Unable to create the tenant'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Creating...' : 'Create tenant' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.tenants">Cancel</a>
          </div>
        </form>
      </app-context-guard>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantFormPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly PermissionSets = PermissionSets;

  readonly context = inject(ActiveContextService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenants = inject(TenantsService);
  private readonly router = inject(Router);

  /** What this room lets for, resolved room → building → agency. Prefills the terms. */
  readonly roomTerms = signal<RoomEffectiveTerms | null>(null);

  readonly termsHint = computed(() => {
    const terms = this.roomTerms();
    if (!terms) {
      return 'Choose the room to fill in its rent and deposit.';
    }
    const source = terms.sources?.monthlyRent;
    const from = source === 'ROOM' ? 'the room' : source === 'BUILDING' ? 'the building' : 'the agency';
    return terms.monthlyRent === null || terms.monthlyRent === undefined
      ? 'Nothing sets a rent for this room yet — enter one.'
      : `Filled in from ${from}. Change them only for this tenant.`;
  });

  private readonly housing = inject(HousingService);

  constructor() {
    this.form.controls.intendedRoomId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((roomId) => void this.loadRoomTerms(roomId));
  }

  private async loadRoomTerms(roomId: number | null): Promise<void> {
    const scope = this.context.active();
    this.roomTerms.set(null);
    if (roomId === null || scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    try {
      const terms = await firstValueFrom(this.housing.getRoomEffectiveTerms(scope.agencyId, scope.buildingId, roomId));
      if (this.form.controls.intendedRoomId.value !== roomId) {
        return;
      }
      this.roomTerms.set(terms);
      // Only fields the operator has not typed into follow the room.
      const num = (value: number | string | null | undefined) => value === null || value === undefined ? null : Number(value);
      if (this.form.controls.monthlyRent.pristine) {
        this.form.controls.monthlyRent.setValue(num(terms.monthlyRent));
      }
      if (this.form.controls.securityDeposit.pristine) {
        this.form.controls.securityDeposit.setValue(num(terms.securityDeposit));
      }
    } catch {
      // The terms are a convenience; the form still submits without them.
    }
  }

  private differsFromDefault(value: number | null, fallback: number | string | null | undefined): number | null {
    if (value === null) {
      return null;
    }
    return fallback !== null && fallback !== undefined && Number(fallback) === Number(value) ? null : value;
  }

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{9,15}$/)]],
    // Optional: someone without an account may not have it to hand; verification asks later.
    nationalIdNumber: [''],
    email: ['', [Validators.email]],
    // Defaulted, but the DTO demands it — marked so the form says so too.
    // Defaults to Individual, which covers most tenancies; not marked required.
    tenantType: ['INDIVIDUAL'],
    // The backend requires it: landlordCreateTenant is authorised with
    // hasRoomAccess(agencyId, buildingId, intendedRoomId, 'TENANT_CREATE').
    intendedRoomId: [null as number | null, [Validators.required]],
    monthlyRent: [null as number | null, [Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.min(0)]],
    emergencyContactName: [''],
    emergencyContactPhone: [''],
    emergencyContactRelationship: [''],
    notes: ['']
  });

  readonly payments = initialPaymentsGroup(this.formBuilder);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const scope = this.context.active();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    const value = this.form.getRawValue();
    const request: CreateTenantRequest = {
      firstName: value.firstName,
      middleName: value.middleName || null,
      lastName: value.lastName,
      phoneNumber: value.phoneNumber,
      nationalIdNumber: value.nationalIdNumber || null,
      email: value.email || null,
      tenantType: value.tenantType as CreateTenantRequest['tenantType'],
      intendedRoomId: value.intendedRoomId,
      creationMode: 'LANDLORD_ASSISTED',
      // Unchanged from the room's own figure: send nothing, so the tenant keeps
      // following the room → building → agency rent instead of pinning today's.
      monthlyRent: this.differsFromDefault(value.monthlyRent, this.roomTerms()?.monthlyRent),
      securityDeposit: this.differsFromDefault(value.securityDeposit, this.roomTerms()?.securityDeposit),
      emergencyContactName: value.emergencyContactName || null,
      emergencyContactPhone: value.emergencyContactPhone || null,
      emergencyContactRelationship: value.emergencyContactRelationship || null,
      notes: value.notes || null,
      ...toInitialPayments(this.payments)
    };

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const created = await firstValueFrom(
        this.tenants.createTenantForBuilding(scope.agencyId, scope.buildingId, request)
      );
      // Land on the tenant just created (§32.4).
      await this.router.navigateByUrl(RoutePaths.tenantDetail(scope.agencyId, scope.buildingId, created.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
