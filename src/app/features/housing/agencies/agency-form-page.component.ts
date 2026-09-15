import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, effect } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { HousingService } from '../housing.service';
import { AgencyStatus } from '../models/housing.models';

@Component({
  selector: 'app-agency-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    EntityPickerComponent,
    FieldErrorComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading agency..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit agency' : 'New agency'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field"><span>Registration number</span><input formControlName="registrationNumber"></label>

              @if (!isEdit()) {
                <!--
                  The backend gates this field, not the form:
                  canCreateAgencyForOwner() lets AGENCY_CREATE name yourself as
                  owner and requires AGENCY_CREATE_FOR_OTHERS to name anyone
                  else. Offering a free-text owner picker to someone without it
                  is offering a request the server will reject.
                -->
                @if (canCreateForOthers()) {
                  <label class="field">
                    <span>Owner</span>
                    <app-entity-picker
                      [config]="pickers.user"
                      [required]="true"
                      formControlName="ownerId"
                      placeholder="Search for the owner"
                    />
                    <app-field-error [control]="form.controls.ownerId" label="Owner" />
                  </label>
                } @else {
                  <p class="field">
                    <span class="field__label">Owner</span>
                    <span class="muted">You will own this agency.</span>
                  </p>
                }
              }

              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>
          </app-section-card>

          <app-section-card title="Default rent terms">
            <p class="hint">Buildings and rooms inherit these unless they override them.</p>

            <div class="grid-auto">
              <label class="field"><span>Monthly rent</span><input type="number" step="0.01" min="0" formControlName="monthlyRent"></label>
              <label class="field"><span>Security deposit</span><input type="number" step="0.01" min="0" formControlName="securityDeposit"></label>
              <label class="field">
                <span>Payment due day</span>
                <input type="number" min="1" max="31" formControlName="paymentDueDay">
                @if (form.controls.paymentDueDay.invalid && form.controls.paymentDueDay.touched) {
                  <small class="error-text">Enter a day between 1 and 31.</small>
                }
              </label>
              <label class="field"><span>Late fee amount</span><input type="number" step="0.01" min="0" formControlName="lateFeeAmount"></label>
              <label class="field"><span>Grace period (days)</span><input type="number" min="0" formControlName="gracePeriodDays"></label>
            </div>

            <label class="field field--wide">
              <span>Terms and conditions</span>
              <textarea formControlName="termsAndConditions" rows="4"></textarea>
            </label>
          </app-section-card>

          <app-section-card title="Profile">
            <div class="grid-auto" formGroupName="agencyProfile">
              <label class="field"><span>Logo URL</span><input formControlName="logoUrl"></label>
              <label class="field"><span>Website</span><input formControlName="website"></label>
              <label class="field"><span>Phone number</span><input formControlName="phoneNumber"></label>
              <label class="field">
                <span>Email</span>
                <input type="email" formControlName="email">
                @if (form.controls.agencyProfile.controls.email.invalid && form.controls.agencyProfile.controls.email.touched) {
                  <small class="error-text">Enter a valid email address.</small>
                }
              </label>
            </div>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Agency already exists' : 'Unable to save agency'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create agency') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.agencies">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyFormPageComponent implements OnInit {
  private readonly context = inject(ActiveContextService);
  private readonly session = inject(AuthSessionService);

  /** Naming someone else as owner needs its own permission (see the template). */
  readonly canCreateForOthers = computed(() => this.context.can(PermissionConstants.AGENCY_CREATE_FOR_OTHERS));

  readonly RoutePaths = RoutePaths;
  readonly pickers = inject(EntityPickerRegistry);

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly housing = inject(HousingService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: '',
    registrationNumber: '',
    ownerId: [null as number | null, [Validators.required, Validators.min(1)]],
    status: 'ACTIVE',
    monthlyRent: [null as number | null, [Validators.min(0)]],
    securityDeposit: [null as number | null, [Validators.min(0)]],
    paymentDueDay: [null as number | null, [Validators.min(1), Validators.max(31)]],
    lateFeeAmount: [null as number | null, [Validators.min(0)]],
    gracePeriodDays: [null as number | null, [Validators.min(0)]],
    termsAndConditions: '',
    agencyProfile: this.formBuilder.group({
      logoUrl: '',
      website: '',
      phoneNumber: '',
      email: ['', [Validators.email]]
    })
  });

  constructor() {
    effect(() => {
      if (!this.canCreateForOthers()) {
        this.form.controls.ownerId.setValue(this.session.currentUserId());
      }
    });
  }

  ngOnInit(): void {
    if (this.isEdit()) {
      // Ownership transfer isn't part of the update contract.
      this.form.controls.ownerId.clearValidators();
      this.form.controls.ownerId.updateValueAndValidity();
    }

    void this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.id();
    if (!agencyId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const agency = await firstValueFrom(this.housing.getAgency(Number(agencyId)));
      this.form.patchValue({
        name: agency.name,
        description: agency.description ?? '',
        registrationNumber: agency.registrationNumber ?? '',
        ownerId: agency.ownerId ?? null,
        status: agency.status ?? 'ACTIVE',
        monthlyRent: agency.monthlyRent === null || agency.monthlyRent === undefined ? null : Number(agency.monthlyRent),
        securityDeposit: agency.securityDeposit === null || agency.securityDeposit === undefined ? null : Number(agency.securityDeposit),
        paymentDueDay: agency.paymentDueDay ?? null,
        lateFeeAmount: agency.lateFeeAmount === null || agency.lateFeeAmount === undefined ? null : Number(agency.lateFeeAmount),
        gracePeriodDays: agency.gracePeriodDays ?? null,
        termsAndConditions: agency.termsAndConditions ?? '',
        agencyProfile: {
          logoUrl: agency.agencyProfile?.logoUrl ?? '',
          website: agency.agencyProfile?.website ?? '',
          phoneNumber: agency.agencyProfile?.phoneNumber ?? '',
          email: agency.agencyProfile?.email ?? ''
        }
      });
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    const profile = value.agencyProfile;
    const hasProfile = !!(profile.logoUrl || profile.website || profile.phoneNumber || profile.email);

    const base = {
      name: value.name,
      description: value.description || null,
      registrationNumber: value.registrationNumber || null,
      status: value.status as AgencyStatus,
      monthlyRent: value.monthlyRent,
      securityDeposit: value.securityDeposit,
      paymentDueDay: value.paymentDueDay,
      lateFeeAmount: value.lateFeeAmount,
      gracePeriodDays: value.gracePeriodDays,
      termsAndConditions: value.termsAndConditions || null,
      agencyProfile: hasProfile
        ? {
          logoUrl: profile.logoUrl || null,
          website: profile.website || null,
          phoneNumber: profile.phoneNumber || null,
          email: profile.email || null
        }
        : null
    };

    try {
      const agencyId = this.id();
      const saved = agencyId
        ? await firstValueFrom(this.housing.updateAgency(Number(agencyId), base))
        : await firstValueFrom(this.housing.createAgency({ ...base, ownerId: value.ownerId! }));

      await this.router.navigateByUrl(RoutePaths.agencyDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
