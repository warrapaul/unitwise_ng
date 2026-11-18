import { ConfirmService } from '../../../shared/services/confirm.service';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { formatCurrency } from '../../../shared/utils/format.util';
import { viewChild, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { UsersService } from '../../users/users.service';
import { UserIdentity } from '../../users/models/user.models';
import { TenantsService } from '../tenants.service';
import { TenantFormPageComponent } from './tenant-form-page.component';
import { ActivatedRoute } from '@angular/router';
import { HousingService } from '../../housing/housing.service';
import { RoomEffectiveTerms } from '../../housing/models/housing.models';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/**
 * Add somebody who already has an account as a tenant of this agency.
 *
 * Two steps, and the split is the security model rather than a wizard
 * convention. A userUid is an identifier, not an authenticator — it is nine
 * characters, it is designed to be quoted to a prospective landlord, and it is
 * displayed in the holder's own app. So step one confirms identity and nothing
 * else: a name, a photo, and whether the account can log in. It deliberately
 * does not show their phone number, their national ID, or whether they rent
 * anywhere else, because a landlord who typed a uid has not yet been given
 * permission to know any of that.
 *
 * Step two creates a tenancy the person's other landlords cannot see, and by
 * default asks them to share their documents. That request grants nothing on
 * its own — only they can answer it.
 */
type AddMode = 'code' | 'uid' | 'manual';

@Component({
  selector: 'app-add-existing-tenant-page',
  standalone: true,
  imports: [MoneyInputDirective, 
    TenantFormPageComponent,
    ReactiveFormsModule,
    SectionCardComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    BackLinkComponent,
    ContextGuardComponent,
    RoomPickerComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.tenants" label="Back to tenants" />

      <!--
        The order matters and is not the obvious one. A document request has
        to point at a tenancy, so the tenancy is created first — as an
        invitation, awaiting their acceptance, not as a verified tenant. The
        verified record is what you produce at the end, after reading what
        they share. Saying so up front stops "Add tenant" reading as if it
        finished the job.
      -->
      <!--
        Two ways in. Entering the details works for everyone, so it leads; a
        share code already is the tenant's consent and creates the tenancy
        ready to verify; a Unitwise ID only finds them — they still accept.
      -->
      <!-- How to add them: two described choices, one always selected (Enter their details by default). -->
      <div class="methods" role="radiogroup" aria-label="How to add the tenant">
        <label class="method" [class.method--on]="mode() === 'manual'">
          <input type="radio" name="add-method" value="manual" [checked]="mode() === 'manual'" (change)="switchMode('manual')">
          <span class="method__text">
            <strong>Enter their details</strong>
            <span>For anyone. You type their details, choose the room and verify them yourself.</span>
          </span>
        </label>
        <label class="method" [class.method--on]="mode() === 'code'">
          <input type="radio" name="add-method" value="code" [checked]="mode() === 'code'" (change)="switchMode('code')">
          <span class="method__text">
            <strong>Use their share code</strong>
            <span>For a tenant already on Unitwise. Their code shares their profile and documents with you.</span>
          </span>
        </label>
      </div>

      @if (mode() === 'manual') {
        <!-- The full details form, entered by the landlord for someone not on Unitwise. -->
        <app-tenant-form-page />
      } @else {
      @if (mode() === 'uid') {
      <ol class="steps">
        <li class="steps__item" [class.steps__item--now]="!identity()">
          <span class="steps__n">1</span> Find them by their Unitwise ID
        </li>
        <li class="steps__item" [class.steps__item--now]="!!identity()">
          <span class="steps__n">2</span> Invite them to a room
        </li>
        <li class="steps__item">
          <span class="steps__n">3</span> They accept, sharing their tenant profile and documents
        </li>
        <li class="steps__item">
          <span class="steps__n">4</span> You check the details, correct them, and verify
        </li>
      </ol>
      }

      @if (mode() === 'uid') {
        <!--
          One card, one commit. Search only finds them; nothing is sent until
          Send invitation — so the search is outlined, and the primary action
          waits at the foot of the card with Cancel.
        -->
        <form class="narrow" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card title="Invite by Unitwise ID">
            <div class="uid-form">
              <label class="field uid-field">
                <span>Unitwise ID</span>
                <input
                  name="uid"
                  class="mono"
                  [value]="uid()"
                  (input)="onUidInput($event)"
                 
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="12"
                  (keydown.enter)="$event.preventDefault(); lookup()"
                >
              </label>
              <button type="button" class="btn btn-secondary" [disabled]="!uid().trim() || looking()" (click)="lookup()">
                {{ looking() ? 'Searching…' : 'Search' }}
              </button>
            </div>

            @if (lookupError(); as message) {
              <p class="error-text">{{ message }}</p>
            }

            @if (identity(); as person) {
              <div class="identity">
                <span class="identity__photo" aria-hidden="true">{{ initials(person) }}</span>
                <div class="identity__body">
                  <strong>{{ fullName(person) }}</strong>
                  <span class="muted">{{ identityStatus(person) }}</span>
                </div>
              </div>

              <!-- The building is needed to create the tenancy, not to find the person. -->
              <app-context-guard
                [requireBuilding]="true"
                [requirePermission]="Permissions.TENANT_CREATE"
                action="this tenant is moving into"
              >
                <div class="grid-auto">
                  <label class="field">
                    <span>Room</span>
                    <app-room-picker
                      formControlName="intendedRoomId"
                      [agencyId]="context.agencyId()"
                      [buildingId]="context.buildingId()"
                    />
                    <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
                  </label>
                  <label class="field">
                    <span>Monthly rent</span>
                    <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="monthlyRent" [placeholder]="rentPlaceholder()"></span>
                    <small class="hint">{{ rentHint() }}</small>
                  </label>
                </div>
              </app-context-guard>
            }
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This person is already a tenant here' : 'Unable to send the invitation'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="!identity() || !context.buildingId() || saving()"
                    [attr.aria-describedby]="!identity() || !context.buildingId() ? 'invite-why' : null">
              {{ saving() ? 'Sending…' : 'Send invitation' }}
            </button>
          </div>
          @if (!identity()) {
            <p class="hint" id="invite-why">Look up the person by their Unitwise ID first.</p>
          } @else if (!context.buildingId()) {
            <p class="hint" id="invite-why">Pick the building they are moving into, in the switcher at the top.</p>
          }
        </form>
      } @else {
        <app-context-guard
          [requireBuilding]="true"
          [requirePermission]="Permissions.TENANT_CREATE"
          action="this tenant is moving into"
        >
        <form class="narrow" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card
            title="Add a tenant with their share code"
            [subtitle]="context.active().buildingName ? 'Moving into ' + context.active().buildingName : null"
          >
            <p class="alert alert-info">The tenant creates the code on their Unitwise profile, under Sharing, and reads or sends it to you.
              A code works once and expires after 3 days.</p>
            <div class="grid-auto">
              <label class="field field--full">
                <span>Share code</span>
                <input
                  class="mono share-code"
                  formControlName="shareCode"
                  autocapitalize="characters"
                  autocomplete="one-time-code"
                  spellcheck="false"
                  (input)="upperCaseCode($event)"
                  (paste)="pasteCode($event)"
                >
                <app-field-error [control]="form.controls.shareCode" label="Share code" />
              </label>

              <label class="field field--full">
                <span>Room</span>
                <app-room-picker [vacantOnly]="true"
                  formControlName="intendedRoomId"
                  [agencyId]="context.agencyId()"
                  [buildingId]="context.buildingId()"
                />
                <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
              </label>

              <!-- Only once a room is chosen: before that there is no rent to show or change. -->
              @if (form.controls.intendedRoomId.value) {
                <label class="field">
                  <span>Monthly rent</span>
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="monthlyRent" aria-label="Monthly rent in KES"></span>
                  <small class="hint">{{ rentHint() }}</small>
                </label>
              }
            </div>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This person is already a tenant here' : 'That code did not work'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Checking the code…' : 'Find tenant' }}
            </button>
          </div>
        </form>
        </app-context-guard>
      }
      }
    </section>
  `,
  styles: [`
    .share-code { width: 100%; max-width: none; text-transform: uppercase; font-size: var(--text-lg); letter-spacing: 0.08em; }
    form {
      display: grid;
      gap: var(--space-4);
    }

    .uid-form {
      display: flex;
      align-items: end;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    /* Nine characters: a field that size, not the card's width. */
    .uid-field { flex: 0 1 13rem; }

    .identity {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2-5) 0;
      border-top: 1px solid var(--border);
    }

    .identity__photo {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      color: var(--text-muted);
      font-weight: var(--weight-bold);
      font-size: var(--text-sm);
    }

    .identity__body { display: grid; gap: var(--space-0-5); min-width: 0; }

    /* Forms of three or four short fields read best at a measure, not the page width. */
    .narrow { width: 100%; max-width: 44rem; }

    p { margin: 0; }
    .points { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }

    /* The sequence, stated before the first field rather than discovered. */
    .methods { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); }
    /* Selectable cards: a radio circle, a hover border, and the chosen one filled and outlined. */
    .method { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3) var(--space-4); min-height: 2.75rem;
              border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface); cursor: pointer; }
    .method:hover { border-color: var(--primary); }
    .method:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
    .method--on { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); background: var(--primary-soft); }
    .method input { margin-top: 0.25rem; accent-color: var(--primary); }
    .method__text { display: grid; gap: var(--space-0-5); }
    .method__text span { color: var(--text-muted); font-size: var(--text-sm); }
    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5) var(--space-5);
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      list-style: none;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .steps__item { display: flex; align-items: center; gap: var(--space-2); }

    /* A sequence reads down on a phone; wrapped, steps 1 and 2 shared a line and 3 did not. */
    @media (max-width: 700px) {
      .steps { flex-direction: column; gap: var(--space-2); }
    }

    .steps__n {
      display: inline-grid;
      place-items: center;
      width: 1.35rem;
      height: 1.35rem;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: var(--text-xs);
      font-weight: var(--weight-bold);
    }

    .steps__item--now { color: var(--text); font-weight: var(--weight-semibold); }

    .steps__item--now .steps__n {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--surface);
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddExistingTenantPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly context = inject(ActiveContextService);

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly users = inject(UsersService);
  private readonly tenants = inject(TenantsService);
  private readonly router = inject(Router);
  private readonly housing = inject(HousingService);

  readonly uid = signal('');
  readonly looking = signal(false);
  readonly lookupError = signal<string | null>(null);
  readonly identity = signal<UserIdentity | null>(null);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    // The agency and building come from the shell's context, which is what the
    // route is keyed on; only the room is chosen here.
    intendedRoomId: [null as number | null, [Validators.required]],
    tenantType: 'INDIVIDUAL',
    monthlyRent: [null as number | null, [Validators.min(0)]],
    shareCode: ''
  });

  /** What this room lets for with no override, and which level set it. */
  readonly roomTerms = signal<RoomEffectiveTerms | null>(null);

  readonly rentPlaceholder = computed(() => {
    const rent = this.roomTerms()?.monthlyRent;
    return rent !== null && rent !== undefined ? String(rent) : 'No rent set';
  });

  readonly rentHint = computed(() => {
    const terms = this.roomTerms();
    if (!terms) {
      return 'Choose a room to see its rent.';
    }

    const source = terms.sources?.monthlyRent;
    if (terms.monthlyRent === null || terms.monthlyRent === undefined || source === 'UNSET') {
      return 'Nothing sets a rent for this room — enter one.';
    }

    const from = source === 'ROOM' ? 'the room' : source === 'BUILDING' ? 'the building' : 'the agency';
    return `Leave blank to use ${formatCurrency(terms.monthlyRent)}, set by ${from}.`;
  });

  /** Details first: it works whether or not the tenant has an account. */
  readonly mode = signal<AddMode>('manual');

  /** The details form, while it is the open tab: leaving it with something typed asks first. */
  private readonly wizard = viewChild(TenantFormPageComponent);
  private readonly confirmService = inject(ConfirmService);

  async switchMode(mode: AddMode): Promise<void> {
    if (mode === this.mode()) {
      return;
    }
    if (this.wizard()?.hasUnsavedChanges() && !(await this.confirmService.ask({
      title: 'Switch and lose what you entered?',
      message: 'The details typed for this tenant are not kept when you change method.',
      confirmLabel: 'Switch', cancelLabel: 'Keep editing', destructive: true
    }))) {
      // The browser already moved the radio; put it back on the method still in use.
      const current = document.querySelector<HTMLInputElement>(`input[name="add-method"][value="${this.mode()}"]`);
      if (current) {
        current.checked = true;
      }
      return;
    }
    this.setMode(mode);
  }

  /** Leaving the page with the wizard half filled asks too. */
  hasUnsavedChanges(): boolean {
    return this.wizard()?.hasUnsavedChanges() ?? false;
  }

  setMode(mode: AddMode): void {
    this.mode.set(mode);
    this.saveError.set(null);
    const code = this.form.controls.shareCode;
    code.setValidators(mode === 'code' ? [Validators.required] : []);
    code.updateValueAndValidity();
  }

  /** A pasted code often carries spaces, a line break or "Code:" around it: keep only the code. */
  pasteCode(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const cleaned = text.toUpperCase().replace(/^.*?:\s*/, '').replace(/[^A-Z0-9-]/g, '');
    if (cleaned) {
      event.preventDefault();
      this.form.controls.shareCode.setValue(cleaned);
      this.form.controls.shareCode.markAsDirty();
    }
  }

  /** Stored uppercase and matched exactly; a lowercase paste must not read as a bad code. */
  upperCaseCode(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase().trim();
    if (input.value !== upper) {
      this.form.controls.shareCode.setValue(upper);
    }
  }

  constructor() {
    // Deep links pick the tab (?mode=code|uid); otherwise the details form.
    const requested = inject(ActivatedRoute).snapshot.queryParamMap.get('mode');
    this.setMode(requested === 'code' ? 'code' : 'manual');

    this.form.controls.intendedRoomId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((roomId) => void this.loadRoomTerms(roomId));
  }

  private async loadRoomTerms(roomId: number | null): Promise<void> {
    this.roomTerms.set(null);
    const scope = this.context.active();
    if (roomId === null || scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    try {
      const terms = await firstValueFrom(this.housing.getRoomEffectiveTerms(scope.agencyId, scope.buildingId, roomId));
      if (this.form.controls.intendedRoomId.value === roomId) {
        this.roomTerms.set(terms);
      }
    } catch {
      // The hint falls back to a generic line; the invitation still works.
    }
  }

  /**
   * Uppercased as they type. A uid is stored uppercase, the lookup is exact,
   * and somebody reading one off a phone screen types it however it looked —
   * so a lowercase paste would 404 on a person who is really there.
   */
  onUidInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();

    if (input.value !== upper) {
      input.value = upper;
    }

    this.uid.set(upper.trim());
  }

  fullName(person: UserIdentity): string {
    return [person.officialFirstName, person.officialLastName].filter(Boolean).join(' ')
      || 'Name not stated yet';
  }

  /** One line on whether they can accept — the detail is theirs to act on, not the agent's. */
  identityStatus(person: UserIdentity): string {
    if (person.accountActive === false) {
      return "Account not claimed — they can't accept yet.";
    }
    if (person.hasTenancyProfile && person.officialIdentityComplete) {
      return 'Has a tenant profile.';
    }
    return person.hasTenancyProfile
      ? 'Profile incomplete — they finish it before accepting.'
      : 'No tenant profile yet — they create one before accepting.';
  }

  initials(person: UserIdentity): string {
    return [person.officialFirstName, person.officialLastName]
      .filter(Boolean)
      .map((part) => part!.charAt(0).toUpperCase())
      .join('') || '?';
  }

  async lookup(): Promise<void> {
    const uid = this.uid().trim();
    if (!uid) {
      return;
    }

    this.looking.set(true);
    this.lookupError.set(null);
    this.identity.set(null);

    try {
      this.identity.set(await firstValueFrom(this.users.getUserIdentityByUid(uid)));
    } catch (error) {
      this.lookupError.set(
        toApiError(error).status === 404
          ? `No account with Unitwise ID "${uid}". Check the characters with them — it is not a phone number or an email.`
          : extractErrorMessage(error)
      );
    } finally {
      this.looking.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.mode() === 'code') {
      await this.submitShareCode();
      return;
    }

    const person = this.identity();
    if (!person || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const scope = this.context.active();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);

    try {
      const tenant = await firstValueFrom(this.tenants.addExistingUserAsTenant(
        scope.agencyId,
        scope.buildingId,
        {
          userUid: person.userUid ?? this.uid().trim(),
          intendedRoomId: value.intendedRoomId!,
          tenantType: value.tenantType as never,
          // Blank uses the room -> building -> agency rent.
          monthlyRent: value.monthlyRent,
          // Always both: one acceptance shares the profile and the documents
          // behind it, so there is nothing to opt out of here.
          requestDocuments: true
        }
      ));

      await this.router.navigateByUrl(
        RoutePaths.tenantDetail(scope.agencyId, scope.buildingId, tenant.id)
      );
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async submitShareCode(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const scope = this.context.active();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);

    try {
      const tenant = await firstValueFrom(this.tenants.createFromShareCode(scope.agencyId, scope.buildingId, {
        shareCode: value.shareCode.trim().toUpperCase(),
        intendedRoomId: value.intendedRoomId!,
        monthlyRent: value.monthlyRent
      }));

      // Straight to the record: their shared details are on it, waiting to be checked.
      await this.router.navigateByUrl(RoutePaths.tenantDetail(scope.agencyId, scope.buildingId, tenant.id));
    } catch (error) {
      // Rendered as given: a wrong, expired and used code all answer the same (§39).
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
