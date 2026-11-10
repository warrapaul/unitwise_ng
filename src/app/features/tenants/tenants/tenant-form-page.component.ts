import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { phoneValidator } from '../../../shared/utils/phone.validator';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { MeterFieldsComponent } from '../../rent/components/tenant-meters.component';
import { TenantMeter } from '../../rent/models/rent.models';
import { RentService } from '../../rent/rent.service';
import { formatPhone, personName, proRatedRent, roomTitle } from '../../../shared/utils/format.util';
import { MONEY_LOCALE, formatCurrency } from '../../../shared/utils/format.util';
import { InitialPaymentsComponent, initialPaymentsGroup, toInitialPayments } from '../../rent/components/initial-payments.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';
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
/** An emergency contact is a name and a number: one without the other is no use when it is needed. */
function bothOrNeither(other: string, what: 'name' | 'phone'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const partner = control.parent?.get(other);
    const mine = String(control.value ?? '').trim();
    const theirs = String(partner?.value ?? '').trim();
    return !mine && theirs ? { required: true, [`${what}Missing`]: true } : null;
  };
}

@Component({
  selector: 'app-tenant-form-page',
  standalone: true,
  imports: [DateDisplayDirective, MoneyInputDirective, MeterFieldsComponent, 
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
        <!-- On a phone only the current step keeps its name: five chips wrapped onto three rows. -->
        <ol class="wizard" [attr.aria-label]="'Step ' + (step() + 1) + ' of ' + steps.length">
          @for (label of steps; track label; let index = $index) {
            <li [class.wizard__now]="step() === index" [class.wizard__done]="step() > index">
              <button type="button" class="wizard__btn" [disabled]="index > step()" (click)="goTo(index)"
                      [attr.aria-current]="step() === index ? 'step' : null">
                <span class="wizard__n">{{ step() > index ? '✓' : index + 1 }}</span><span class="wizard__label">{{ label }}</span>
              </button>
            </li>
          }
        </ol>
        <!-- On a phone the chips are numbers only, so their width never changes; the step's name sits here. -->
        <p class="wizard__caption" aria-hidden="true">Step {{ step() + 1 }} of {{ steps.length }}: {{ steps[step()] }}</p>

        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="next()">
          @switch (step()) {
            @case (0) {
              <app-section-card title="Tenant details"
                                [subtitle]="context.active().buildingName ? 'Adding to ' + context.active().buildingName : null">
                <div class="grid-auto">
                  <label class="field">
                    <span>First name</span>
                    <input formControlName="firstName" autocomplete="given-name" autocapitalize="words">
                    <app-field-error [control]="form.controls.firstName" label="First name" />
                  </label>
                  <label class="field">
                    <span>Middle name</span>
                    <input formControlName="middleName" autocomplete="additional-name" autocapitalize="words">
                  </label>
                  <label class="field">
                    <span>Last name</span>
                    <input formControlName="lastName" autocomplete="family-name" autocapitalize="words">
                    <app-field-error [control]="form.controls.lastName" label="Last name" />
                  </label>
                  <label class="field">
                    <span>Phone number</span>
                    <input type="tel" inputmode="tel" autocomplete="tel" formControlName="phoneNumber">
                    <app-field-error [control]="form.controls.phoneNumber" label="Phone number" />
                  </label>
                  <label class="field">
                    <span>National ID</span>
                    <input formControlName="nationalIdNumber" inputmode="numeric" autocomplete="off">
                  </label>
                  <label class="field">
                    <span>Email</span>
                    <input type="email" inputmode="email" autocomplete="email" autocapitalize="none" formControlName="email">
                    <app-field-error [control]="form.controls.email" label="Email" />
                  </label>
                </div>
                <p class="alert alert-info">They log in to Unitwise with this phone number or email, and see the tenancy you create for them.</p>
              </app-section-card>
              <!-- Optional, so folded away; it was a whole step of mostly empty screen. -->
              <details class="emergency" [open]="!!form.controls.emergencyContactName.value || !!form.controls.emergencyContactPhone.value">
                <summary>Emergency contact</summary>
                <p class="hint">If you add one, give both a name and a phone number.</p>
                <div class="grid-auto">
                  <label class="field">
                    <span>Name</span>
                    <input formControlName="emergencyContactName" autocomplete="off" autocapitalize="words">
                    <app-field-error [control]="form.controls.emergencyContactName" label="Name" />
                  </label>
                  <label class="field">
                    <span>Phone</span>
                    <input type="tel" inputmode="tel" autocomplete="off" formControlName="emergencyContactPhone">
                    <app-field-error [control]="form.controls.emergencyContactPhone" label="Phone" />
                  </label>
                  <label class="field">
                    <span>Relationship</span>
                    <!-- A list to pick from, and anything else can still be typed. -->
                    <input formControlName="emergencyContactRelationship" list="relationships" autocapitalize="sentences">
                    <datalist id="relationships">
                      @for (option of relationships; track option) { <option [value]="option"></option> }
                    </datalist>
                  </label>
                </div>
              </details>
            }
            @case (1) {
              <app-section-card title="Room and rent">
                <div class="grid-auto">
                  <label class="field field--full">
                    <span>Room</span>
                    <app-room-picker [vacantOnly]="true" formControlName="intendedRoomId" [agencyId]="context.agencyId()" [buildingId]="context.buildingId()" />
                    <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
                  </label>
                  <!-- Filled from the room once one is chosen; editable after that, never before. -->
                  <fieldset class="terms" [disabled]="!form.controls.intendedRoomId.value">
                    <label class="field">
                      <span>Monthly rent</span>
                      <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="monthlyRent" aria-label="Monthly rent in KES"></span>
                    </label>
                    <label class="field">
                      <span>Security deposit</span>
                      <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="securityDeposit" aria-label="Security deposit in KES"></span>
                    </label>
                  </fieldset>
                </div>
                <p class="hint">{{ form.controls.intendedRoomId.value ? termsHint() : 'Choose a room first: its rent and deposit fill in here.' }}</p>
                <label class="field field--full">
                  <span>Internal notes</span>
                  <textarea formControlName="notes" rows="2"></textarea>
                  <small class="hint">Only your agency sees these; the tenant never does.</small>
                </label>
              </app-section-card>
              <!-- Only for a room with a metered charge. Read at the handover, so the first bill has a start point. -->
              @if (meters().length > 0) {
                <app-section-card title="Meters" subtitle="Optional. You can add these later from the tenant's page.">
                  <app-meter-fields [(meters)]="meters" />
                </app-section-card>
              }
            }
            @case (2) {
              <!-- Money is never inferred from the agreed terms: it is recorded only when they say it arrived. -->
              <app-section-card title="Money received today" subtitle="Optional. Recorded as payments with a receipt.">
                <label class="switch-row">
                  <span>I have received rent or a deposit from them today</span>
                  <input type="checkbox" role="switch" class="switch" [checked]="moneyReceived()" (change)="moneyReceived.set($any($event.target).checked)">
                </label>
                @if (moneyReceived()) {
                  <app-initial-payments [group]="payments" [rent]="firstRent() ?? form.controls.monthlyRent.value ?? roomTerms()?.monthlyRent"
                                        [rentLabel]="firstRent() !== null ? 'first month' : 'monthly'"
                                        [deposit]="form.controls.securityDeposit.value ?? roomTerms()?.securityDeposit" />
                } @else {
                  <p class="hint">Nothing is recorded as paid. You can record payments later from their page.</p>
                }
              </app-section-card>
            }
            @case (3) {
              <app-section-card title="Review and finish">
                <dl class="review">
                  <div><dt>Tenant</dt><dd>{{ fullName() }} <button type="button" class="btn-text edit" (click)="goTo(0)">Edit</button></dd></div>
                  <div><dt>Phone</dt><dd>{{ phoneShown() }}</dd></div>
                  <div><dt>Room</dt><dd>{{ roomLabel() || '-' }}@if (context.active().buildingName) { · {{ context.active().buildingName }} }
                    <button type="button" class="btn-text edit" (click)="goTo(1)">Edit</button></dd></div>
                  <div><dt>Monthly rent</dt><dd>{{ kes(form.controls.monthlyRent.value ?? roomTerms()?.monthlyRent) }}</dd></div>
                  <div><dt>Deposit</dt><dd>{{ kes(form.controls.securityDeposit.value ?? roomTerms()?.securityDeposit) }}</dd></div>
                  @for (line of receivedLines(); track line.label) {
                    <div><dt>{{ line.label }}</dt><dd>{{ line.value }}@if ($first) { <button type="button" class="btn-text edit" (click)="goTo(2)">Edit</button> }</dd></div>
                  }
                </dl>
                @if (duplicates().length > 0) {
                  <ng-container [ngTemplateOutlet]="duplicateWarning" />
                }
                <!-- What happens on Create, in one step: entered in person means checked in person. -->
                <fieldset class="finish">
                  <legend>What happens next</legend>
                  <label class="radio-field">
                    <input type="radio" formControlName="finish" value="MOVE_IN">
                    <span><strong>Move them in now</strong><small>Rent billing starts from the move-in date. You can add a lease later.</small></span>
                  </label>
                  @if (form.controls.finish.value === 'MOVE_IN') {
                    <label class="field move-in">
                      <span>Move-in date</span>
                      <input type="date" formControlName="moveInDate">
                    </label>
                  }
                  <label class="radio-field">
                    <input type="radio" formControlName="finish" value="RESERVE">
                    <span><strong>Hold the room for them</strong><small>Nothing is billed yet. Move them in from their page when they arrive.</small></span>
                  </label>
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

          <div class="button-row button-row--wizard">
            @if (step() < steps.length - 1) {
              <!-- Not a submit: a submitted form shows every later step's errors too. -->
              <button type="button" class="btn btn-primary" [disabled]="checking()" (click)="next()">{{ checking() ? 'Checking...' : 'Next' }}</button>
            } @else {
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="submit()">
                {{ saving() ? 'Saving...' : form.controls.finish.value === 'MOVE_IN' ? 'Add and move in' : 'Add and hold the room' }}
              </button>
            }
            @if (step() > 0) {
              <button type="button" class="btn btn-secondary" (click)="goTo(step() - 1)">Back</button>
            }
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
    .wizard { display: flex; flex-wrap: wrap; gap: var(--space-1-5); margin: 0; padding: 0; list-style: none; }
    .wizard__btn { display: inline-flex; align-items: center; gap: var(--space-1-5); padding: var(--space-1-5) var(--space-3); border: 1px solid var(--border);
                   border-radius: 999px; background: var(--surface); color: var(--text-muted); font: inherit; font-size: var(--text-sm); cursor: pointer; }
    .wizard__btn:disabled { cursor: default; }
    /* Same weight in every state: a bolder current step was wider, and the row jumped as it moved. */
    .wizard__now .wizard__btn { border-color: var(--primary); color: var(--text); box-shadow: inset 0 0 0 1px var(--primary); }
    .wizard__btn { min-height: 2.75rem; }
    .wizard__caption { display: none; margin: 0; font-weight: var(--weight-semibold); }
    .wizard__done .wizard__btn { color: var(--text); }
    .wizard__n { display: inline-grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: 999px;
                 background: var(--surface-2); font-size: var(--text-2xs); font-weight: var(--weight-bold); }
    .wizard__now .wizard__n, .wizard__done .wizard__n { background: var(--primary); color: var(--surface); }
    @media (max-width: 640px) {
      .wizard { display: grid; grid-template-columns: repeat(4, 2.75rem); justify-content: space-between; }
      .wizard .wizard__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      .wizard .wizard__btn { width: 2.75rem; justify-content: center; padding: 0; border-radius: 999px; }
      .wizard__caption { display: block; }
    }
    .emergency { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); background: var(--surface); }
    .emergency > summary { min-height: 2.75rem; display: flex; align-items: center; gap: var(--space-1); cursor: pointer; font-weight: var(--weight-semibold); }
    .emergency[open] > summary { margin-bottom: var(--space-2); }
    /* One field per row on a phone: half-width ID and email fields were too narrow to read. */
    @media (max-width: 640px) { form .grid-auto { grid-template-columns: minmax(0, 1fr) !important; } }
    .review { display: grid; gap: var(--space-3); margin: 0 0 var(--space-3); }
    .review div { display: flex; gap: var(--space-3); }
    .review dt { flex: 0 0 9rem; color: var(--text-muted); font-size: var(--text-sm); }
    @media (max-width: 640px) {
      /* Label over value on a phone: side by side, both were squeezed. */
      .review div { flex-direction: column; gap: 2px; padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); }
      .review dt { flex: none; }
    }
    .review dd { margin: 0; font-weight: var(--weight-semibold); }
    .review .edit { margin-inline-start: var(--space-2); font-weight: var(--weight-regular, 400); font-size: var(--text-sm); }
    /* The terms sit in the grid like any other fields; the fieldset only exists to lock them until a room is chosen. */
    .terms { display: contents; border: 0; margin: 0; padding: 0; }
    .terms:disabled .field { opacity: 0.6; }
    /* Each choice is a full-width card: the whole thing is the target, with its consequence underneath. */
    .finish .radio-field { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3); border: 1px solid var(--border-strong);
                           border-radius: var(--radius-md); cursor: pointer; min-height: 2.75rem; }
    .finish .radio-field:has(input:checked) { border-color: var(--primary); background: var(--primary-soft, var(--surface-muted)); }
    .finish .radio-field small { display: block; color: var(--text-muted); font-size: var(--text-sm); margin-top: 2px; }
    .finish { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
    .finish legend { padding: 0 var(--space-1); font-weight: var(--weight-semibold); }
    .radio-field { display: flex; gap: var(--space-2); align-items: flex-start; }
    .move-in { max-width: 14rem; margin-left: var(--space-6); }
    .dupes { margin: var(--space-1) 0; padding-left: var(--space-5); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantFormPageComponent implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

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

  /** The metered charges on the chosen room. Skipped if they cannot be read: meters are optional here. */
  private async loadRoomMeters(agencyId: number, buildingId: number, roomId: number): Promise<void> {
    try {
      const charges = await firstValueFrom(this.rent.getChargeTemplatesForRoom(agencyId, buildingId, roomId));
      if (this.form.controls.intendedRoomId.value === roomId) {
        this.meters.set(charges
          // The same rule the server uses: read from a meter, and not already part of the rent.
          .filter((charge) => (charge.billingType === 'METERED' || charge.billingType === 'PER_UNIT') && !charge.includedInRent)
          .map((charge) => ({ chargeName: charge.name, unit: charge.unit ?? null, meterNumber: charge.meterNumber ?? null, openingReading: null })));
      }
    } catch {
      this.meters.set([]);
    }
  }

  private async loadRoomTerms(roomId: number | null): Promise<void> {
    const scope = this.context.active();
    this.roomTerms.set(null);
    this.meters.set([]);
    if (roomId === null || scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    void this.loadRoomMeters(scope.agencyId, scope.buildingId, roomId);

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
    phoneNumber: ['', [Validators.required, phoneValidator()]],
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
    emergencyContactName: ['', [bothOrNeither('emergencyContactPhone', 'name')]],
    emergencyContactPhone: ['', [phoneValidator(), bothOrNeither('emergencyContactName', 'phone')]],
    emergencyContactRelationship: [''],
    notes: [''],
    finish: 'MOVE_IN' as 'RESERVE' | 'MOVE_IN',
    moveInDate: todayIso()
  });

  readonly steps = ['Tenant details', 'Room and rent', 'Money received', 'Review'];
  readonly relationships = ['Parent', 'Spouse or partner', 'Sibling', 'Child', 'Relative', 'Friend', 'Employer', 'Guardian'];
  readonly step = signal(0);
  readonly checking = signal(false);
  readonly moneyReceived = signal(false);
  private readonly notifications = inject(NotificationService);
  readonly meters = signal<TenantMeter[]>([]);
  private readonly rent = inject(RentService);
  /** Tenancies in this agency with the same phone, ID or email — found on leaving step 1. */
  readonly duplicates = signal<TenantPreview[]>([]);
  private readonly roomName = signal<string | null>(null);

  /** The controls each step must have valid before moving on. */
  private readonly stepControls: (keyof typeof this.form.controls)[][] = [
    ['firstName', 'lastName', 'phoneNumber', 'email', 'emergencyContactName', 'emergencyContactPhone'],
    ['intendedRoomId', 'monthlyRent', 'securityDeposit'],
    [],
    ['moveInDate']
  ];

  async next(): Promise<void> {
    const controls = this.stepControls[this.step()].map((name) => this.form.controls[name]);
    controls.forEach((control) => control.markAsTouched());
    if (controls.some((control) => control.invalid) || (this.step() === 2 && this.moneyReceived() && this.payments.invalid)) {
      this.payments.markAllAsTouched();
      // To the first thing to fix, as a submit would have done.
      setTimeout(() => {
        const bad = document.querySelector<HTMLElement>('app-tenant-form-page form .ng-invalid.ng-touched:not(form):not([formgroupname])');
        bad?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (bad?.matches('input, select, textarea') ? bad : bad?.querySelector<HTMLElement>('input, select, textarea, button'))?.focus({ preventScroll: true });
      });
      return;
    }
    if (this.step() === 0) {
      await this.checkDuplicates();
    }
    this.step.update((value) => Math.min(value + 1, this.steps.length - 1));
    // Submitting a step marks the whole form touched; a step not yet reached must not open on errors.
    this.stepControls.slice(this.step()).flat().forEach((name) => this.form.controls[name].markAsUntouched());
    this.focusStep();
  }

  goTo(index: number): void {
    if (index <= this.step()) {
      this.step.set(index);
      this.focusStep();
    }
  }

  /** A new step starts at its first field, scrolled into view, not wherever the last one left off. */
  private focusStep(): void {
    setTimeout(() => {
      const first = document.querySelector<HTMLElement>('app-tenant-form-page form :is(input:not([type=hidden]):not([type=radio]), select, textarea, app-room-picker button)');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      first?.focus({ preventScroll: true });
    });
  }

  phoneShown(): string {
    return formatPhone(this.form.controls.phoneNumber.value) || '-';
  }

  /** Each payment on its own row, so the review reads as a list rather than one dotted line. */
  receivedLines(): { label: string; value: string }[] {
    if (!this.moneyReceived()) {
      return [{ label: 'Received today', value: 'Nothing' }];
    }
    const value = this.payments.getRawValue();
    const lines = [
      value.rentAmount ? { label: 'Rent received', value: this.kes(value.rentAmount) } : null,
      value.depositAmount ? { label: 'Deposit received', value: this.kes(value.depositAmount) } : null
    ].filter((line): line is { label: string; value: string } => line !== null);
    return lines.length ? lines : [{ label: 'Received today', value: 'Nothing' }];
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
    return personName(value.firstName, value.middleName, value.lastName);
  }

  roomLabel(): string | null {
    const name = this.roomName();
    return name ? roomTitle(name) : null;
  }

  kes(value: number | string | null | undefined): string {
    return formatCurrency(value);
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

  /** Moving in now, part-way through a month: the pro-rated rent to suggest. Null means the full rent. */
  firstRent(): number | null {
    const value = this.form.getRawValue();
    return value.finish === 'MOVE_IN' ? proRatedRent(value.monthlyRent ?? this.roomTerms()?.monthlyRent, value.moveInDate) : null;
  }

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
      meterOpenings: this.meters().filter((meter) => meter.openingReading !== null || !!meter.meterNumber?.trim()),
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
      this.form.markAsPristine();
      this.notifications.push('success', value.finish === 'MOVE_IN'
        ? `${this.fullName()} added and moved in.`
        : `${this.fullName()} added. The room is held for them.`);
      await this.router.navigateByUrl(RoutePaths.tenantDetail(scope.agencyId, scope.buildingId, created.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
