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

import { CreateTenantRequest, TenantPreview } from '../models/tenant.models';
import { NgTemplateOutlet } from '@angular/common';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { todayIso } from '../../../shared/utils/date.util';

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
    FormFeedbackDirective,
    NgTemplateOutlet,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="true" [requirePermission]="Permissions.TENANT_CREATE">
        <!-- One step at a time; nothing is sent until "Create tenant" on the last one. -->
        <ol class="wizard" aria-label="Steps">
          @for (label of steps; track label; let index = $index) {
            <li [class.wizard__now]="step() === index" [class.wizard__done]="step() > index">
              <button type="button" class="wizard__btn" [disabled]="index > step()" (click)="goTo(index)"
                      [attr.aria-current]="step() === index ? 'step' : null">
                <span class="wizard__n">{{ step() > index ? '✓' : index + 1 }}</span>{{ label }}
              </button>
            </li>
          }
        </ol>

        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="next()">
          @switch (step()) {
            @case (0) {
              <app-section-card title="Who they are"
                                [subtitle]="context.active().buildingName ? 'Adding to ' + context.active().buildingName : null">
                <div class="grid-auto">
                  <label class="field">
                    <span>First name</span>
                    <input formControlName="firstName">
                    <app-field-error [control]="form.controls.firstName" label="First name" />
                  </label>
                  <label class="field">
                    <span>Middle name <span class="muted">(optional)</span></span>
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
                    <app-field-error [control]="form.controls.phoneNumber" label="Phone number"
                                     patternMessage="9-15 digits, optionally starting with +." />
                  </label>
                  <label class="field">
                    <span>National ID <span class="muted">(optional)</span></span>
                    <input formControlName="nationalIdNumber">
                  </label>
                  <label class="field">
                    <span>Email <span class="muted">(optional)</span></span>
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
                </div>
                <p class="hint">They get a UnitWise login with this phone or email, and can see the tenancy you create for them.</p>
              </app-section-card>
            }
            @case (1) {
              <app-section-card title="Room and agreed terms">
                <div class="grid-auto">
                  <label class="field field--full">
                    <span>Room</span>
                    <app-room-picker formControlName="intendedRoomId" [agencyId]="context.agencyId()" [buildingId]="context.buildingId()" />
                    <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
                  </label>
                  <label class="field">
                    <span>Agreed monthly rent (KES)</span>
                    <input type="number" min="0" formControlName="monthlyRent">
                  </label>
                  <label class="field">
                    <span>Agreed security deposit (KES)</span>
                    <input type="number" min="0" formControlName="securityDeposit">
                  </label>
                </div>
                <p class="hint">{{ termsHint() }} These are what they owe — money actually received comes later.</p>
                <label class="field field--full">
                  <span>Internal notes <span class="muted">(only your agency sees these)</span></span>
                  <textarea formControlName="notes" rows="2"></textarea>
                </label>
              </app-section-card>
            }
            @case (2) {
              <app-section-card title="Emergency contact" subtitle="Optional — worth asking while they are here.">
                <div class="grid-auto">
                  <label class="field"><span>Name</span><input formControlName="emergencyContactName"></label>
                  <label class="field"><span>Phone</span><input type="tel" formControlName="emergencyContactPhone"></label>
                  <label class="field"><span>Relationship</span><input formControlName="emergencyContactRelationship"></label>
                </div>
              </app-section-card>
            }
            @case (3) {
              <!-- Money is never inferred from the agreed terms: it is recorded only when they say it arrived. -->
              <app-section-card title="Money received today" subtitle="Optional. Recorded as payments with a receipt.">
                <label class="checkbox-field">
                  <input type="checkbox" [checked]="moneyReceived()" (change)="moneyReceived.set($any($event.target).checked)">
                  <span>I have received rent or a deposit from them today</span>
                </label>
                @if (moneyReceived()) {
                  <app-initial-payments [group]="payments" [rent]="form.controls.monthlyRent.value ?? roomTerms()?.monthlyRent"
                                        [deposit]="form.controls.securityDeposit.value ?? roomTerms()?.securityDeposit" />
                } @else {
                  <p class="muted">Nothing will be recorded as paid. You can record payments later from the tenant's page.</p>
                }
              </app-section-card>
            }
            @case (4) {
              <app-section-card title="Review and finish">
                <dl class="review">
                  <div><dt>Tenant</dt><dd>{{ fullName() }} · {{ form.controls.phoneNumber.value }}</dd></div>
                  <div><dt>Room</dt><dd>{{ roomLabel() || '-' }}</dd></div>
                  <div><dt>Agreed rent</dt><dd>{{ kes(form.controls.monthlyRent.value ?? roomTerms()?.monthlyRent) }} / month</dd></div>
                  <div><dt>Agreed deposit</dt><dd>{{ kes(form.controls.securityDeposit.value ?? roomTerms()?.securityDeposit) }}</dd></div>
                  <div><dt>Received today</dt><dd>{{ receivedSummary() }}</dd></div>
                </dl>
                @if (duplicates().length > 0) {
                  <ng-container [ngTemplateOutlet]="duplicateWarning" />
                }
                <!-- What happens on Create, in one step: entered in person means checked in person. -->
                <fieldset class="finish">
                  <legend>Then</legend>
                  <label class="radio-field">
                    <input type="radio" formControlName="finish" value="RESERVE">
                    <span><strong>Verify and reserve the room</strong> — prepare the lease or move them in from their page.</span>
                  </label>
                  <label class="radio-field">
                    <input type="radio" formControlName="finish" value="MOVE_IN">
                    <span><strong>Verify and move them in now</strong> — billing starts; a lease can be added later.</span>
                  </label>
                  @if (form.controls.finish.value === 'MOVE_IN') {
                    <label class="field move-in">
                      <span>Move-in date</span>
                      <input type="date" formControlName="moveInDate">
                    </label>
                  }
                </fieldset>
              </app-section-card>
            }
          }

          @if (step() === 0 && duplicates().length > 0) {
            <ng-container [ngTemplateOutlet]="duplicateWarning" />
          }

          @if (saveError(); as apiError) {
            <app-error-card [title]="apiError.status === 409 ? 'Cannot use that room or person' : 'Unable to create the tenant'"
                            [message]="apiError.message" [details]="apiError.details" />
          }

          <div class="button-row">
            @if (step() < steps.length - 1) {
              <button type="submit" class="btn btn-primary" [disabled]="checking()">{{ checking() ? 'Checking...' : 'Next' }}</button>
            } @else {
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="submit()">
                {{ saving() ? 'Creating...' : 'Create tenant' }}
              </button>
            }
            @if (step() > 0) {
              <button type="button" class="btn btn-secondary" (click)="goTo(step() - 1)">Back</button>
            }
            <a class="btn btn-secondary" [routerLink]="RoutePaths.tenants">Cancel</a>
          </div>
        </form>

        <ng-template #duplicateWarning>
          <div class="alert alert-warning" role="status">
            <strong>Already a tenant in this agency:</strong>
            <ul class="dupes">
              @for (match of duplicates(); track match.id) {
                <li>
                  <a [routerLink]="tenantLink(match)">{{ match.firstName }} {{ match.lastName }}</a>
                  — {{ match.roomName || match.intendedRoomName || 'no room' }}@if (match.buildingName) { · {{ match.buildingName }} }
                  ({{ match.status | humanLabel }})
                </li>
              }
            </ul>
            <span>Continuing adds another tenancy for the same person — right when they rent more than one room.</span>
          </div>
        </ng-template>
      </app-context-guard>
    </section>
  `,
  styles: [`
    .wizard { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
    .wizard__btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.7rem; border: 1px solid var(--border);
                   border-radius: 999px; background: var(--surface); color: var(--text-muted); font: inherit; font-size: 0.86rem; cursor: pointer; }
    .wizard__btn:disabled { cursor: default; }
    .wizard__now .wizard__btn { border-color: var(--primary); color: var(--text); font-weight: 600; }
    .wizard__done .wizard__btn { color: var(--text); }
    .wizard__n { display: inline-grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: 999px;
                 background: var(--surface-2); font-size: 0.72rem; font-weight: 700; }
    .wizard__now .wizard__n, .wizard__done .wizard__n { background: var(--primary); color: var(--surface); }
    .review { display: grid; gap: 0.4rem; margin: 0 0 0.75rem; }
    .review div { display: flex; gap: 0.75rem; }
    .review dt { flex: 0 0 8rem; color: var(--text-muted); font-size: 0.86rem; }
    .review dd { margin: 0; font-weight: 600; }
    .finish { display: grid; gap: 0.5rem; margin: 0; padding: 0.75rem; border: 1px solid var(--border); border-radius: 12px; }
    .finish legend { padding: 0 0.3rem; font-weight: 600; }
    .radio-field { display: flex; gap: 0.5rem; align-items: flex-start; }
    .move-in { max-width: 14rem; margin-left: 1.6rem; }
    .dupes { margin: 0.3rem 0; padding-left: 1.2rem; }
  `],
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
      // For the review line; the terms carry no name. A failure leaves it blank.
      firstValueFrom(this.housing.getRoom(scope.agencyId, scope.buildingId, roomId))
        .then((room) => this.roomName.set(room.name || (room.roomNumber ? `Room ${room.roomNumber}` : null)), () => this.roomName.set(null));
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
    notes: [''],
    finish: 'RESERVE' as 'RESERVE' | 'MOVE_IN',
    moveInDate: todayIso()
  });

  readonly steps = ['Person', 'Room and terms', 'Emergency contact', 'Money received', 'Review'];
  readonly step = signal(0);
  readonly checking = signal(false);
  readonly moneyReceived = signal(false);
  /** Tenancies in this agency with the same phone, ID or email — found on leaving step 1. */
  readonly duplicates = signal<TenantPreview[]>([]);
  private readonly roomName = signal<string | null>(null);

  /** The controls each step must have valid before moving on. */
  private readonly stepControls: (keyof typeof this.form.controls)[][] = [
    ['firstName', 'lastName', 'phoneNumber', 'email', 'tenantType'],
    ['intendedRoomId', 'monthlyRent', 'securityDeposit'],
    [],
    [],
    ['moveInDate']
  ];

  async next(): Promise<void> {
    const controls = this.stepControls[this.step()].map((name) => this.form.controls[name]);
    controls.forEach((control) => control.markAsTouched());
    if (controls.some((control) => control.invalid) || (this.step() === 3 && this.moneyReceived() && this.payments.invalid)) {
      this.payments.markAllAsTouched();
      return;
    }
    if (this.step() === 0) {
      await this.checkDuplicates();
    }
    this.step.update((value) => Math.min(value + 1, this.steps.length - 1));
  }

  goTo(index: number): void {
    if (index <= this.step()) {
      this.step.set(index);
    }
  }

  /** Only within this agency — the server never searches other agencies. A match warns; it does not block. */
  private async checkDuplicates(): Promise<void> {
    const agencyId = this.context.agencyId();
    const value = this.form.getRawValue();
    if (agencyId === null) {
      return;
    }
    this.checking.set(true);
    try {
      this.duplicates.set(await firstValueFrom(this.tenants.findPossibleDuplicates(agencyId, {
        phone: value.phoneNumber || undefined,
        nationalId: value.nationalIdNumber || undefined,
        email: value.email || undefined
      })));
    } catch {
      this.duplicates.set([]);
    } finally {
      this.checking.set(false);
    }
  }

  fullName(): string {
    const value = this.form.getRawValue();
    return [value.firstName, value.middleName, value.lastName].filter(Boolean).join(' ');
  }

  roomLabel(): string | null {
    return this.roomName();
  }

  kes(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return `KES ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  receivedSummary(): string {
    if (!this.moneyReceived()) {
      return 'Nothing';
    }
    const value = this.payments.getRawValue();
    const parts = [value.rentAmount ? `Rent ${this.kes(value.rentAmount)}` : null, value.depositAmount ? `Deposit ${this.kes(value.depositAmount)}` : null];
    return parts.filter(Boolean).join(' · ') || 'Nothing';
  }

  tenantLink(match: TenantPreview): string | null {
    const agencyId = this.context.agencyId();
    return agencyId !== null && match.buildingId ? RoutePaths.tenantDetail(agencyId, match.buildingId, match.id) : null;
  }

  readonly payments = initialPaymentsGroup(this.formBuilder);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Back to the first step with something to fix.
      const firstBad = this.stepControls.findIndex((names) => names.some((name) => this.form.controls[name].invalid));
      if (firstBad >= 0) {
        this.step.set(firstBad);
      }
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
      // Only money they said arrived — never the agreed figures.
      ...(this.moneyReceived() ? toInitialPayments(this.payments) : { initialRentPayment: null, depositPayment: null }),
      finish: value.finish,
      moveInDate: value.finish === 'MOVE_IN' ? value.moveInDate || null : null
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
