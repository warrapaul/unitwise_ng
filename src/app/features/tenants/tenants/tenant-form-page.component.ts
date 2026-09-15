import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
        <app-section-card
          title="New tenant"
          [subtitle]="context.active().buildingName ? 'Adding to ' + context.active().buildingName : null"
        >

          <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
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
              </label>
              <label class="field">
                <span>Email</span>
                <input type="email" formControlName="email">
                <app-field-error [control]="form.controls.email" label="Email" />
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
              <label class="field">
                <span>Monthly rent</span>
                <input type="number" min="0" formControlName="monthlyRent">
              </label>
              <label class="field">
                <span>Security deposit</span>
                <input type="number" min="0" formControlName="securityDeposit">
              </label>
              <label class="field">
                <span>Emergency contact</span>
                <input formControlName="emergencyContactName">
              </label>
              <label class="field">
                <span>Emergency phone</span>
                <input type="tel" formControlName="emergencyContactPhone">
              </label>
              <label class="field">
                <span>Relationship</span>
                <input formControlName="emergencyContactRelationship">
              </label>
              <label class="field field--full">
                <span>Room</span>
                <app-room-picker
                  formControlName="intendedRoomId"
                  [agencyId]="context.agencyId()"
                  [buildingId]="context.buildingId()"
                />
                <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
              </label>
              <label class="field field--full">
                <span>Notes</span>
                <textarea formControlName="notes" rows="3"></textarea>
              </label>
            </div>

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
        </app-section-card>
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

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{9,15}$/)]],
    nationalIdNumber: ['', [Validators.required]],
    email: ['', [Validators.email]],
    // Defaulted, but the DTO demands it — marked so the form says so too.
    tenantType: ['INDIVIDUAL', [Validators.required]],
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
      monthlyRent: value.monthlyRent,
      securityDeposit: value.securityDeposit,
      emergencyContactName: value.emergencyContactName || null,
      emergencyContactPhone: value.emergencyContactPhone || null,
      emergencyContactRelationship: value.emergencyContactRelationship || null,
      notes: value.notes || null
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
