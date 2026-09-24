import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  imports: [
    TenantFormPageComponent,
    ReactiveFormsModule,
    RouterLink,
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
        Three ways in. Entering the details works for everyone, so it leads; a
        share code already is the tenant's consent and creates the tenancy
        ready to verify; a Unitwise ID only finds them — they still accept.
      -->
      <nav class="tabs" aria-label="How to add them">
        <button type="button" class="tabs__tab" [class.tabs__tab--active]="mode() === 'manual'"
                [attr.aria-pressed]="mode() === 'manual'" (click)="setMode('manual')">No account yet</button>
        <button type="button" class="tabs__tab" [class.tabs__tab--active]="mode() === 'code'"
                [attr.aria-pressed]="mode() === 'code'" (click)="setMode('code')">Share code</button>
        <button type="button" class="tabs__tab" [class.tabs__tab--active]="mode() === 'uid'"
                [attr.aria-pressed]="mode() === 'uid'" (click)="setMode('uid')">Unitwise ID</button>
      </nav>

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
          <span class="steps__n">3</span> They accept, sharing their renter profile and documents
        </li>
        <li class="steps__item">
          <span class="steps__n">4</span> You check the details, correct them, and verify
        </li>
      </ol>
      } @else {
      <ol class="steps">
        <li class="steps__item steps__item--now">
          <span class="steps__n">1</span> Enter the code they gave you, and the room
        </li>
        <li class="steps__item">
          <span class="steps__n">2</span> You check their shared details and verify
        </li>
      </ol>
      }

      @if (mode() === 'uid') {
      <!-- A nine-character code needs a field, not the width of the screen. -->
      <div class="narrow">
      <app-section-card title="Find the person">
        <!--
          Not a <form>. Only ReactiveFormsModule is imported here, so a bare
          form gets no NgForm directive, (ngSubmit) binds to an event that
          never fires, and a submit button performs a NATIVE submit — which
          reloads the whole app. The symptom is a page that appears to do
          nothing except re-authenticate.
        -->
        <div class="uid-form">
          <label class="field">
            <span>Unitwise ID</span>
            <!--
              The placeholder used to be a realistic-looking uid, which read as
              a filled field: the box appeared to contain a value, Find was
              disabled because it did not, and clicking it did nothing at all.
              A placeholder has to be unmistakably an instruction.
            -->
            <input
              name="uid"
              class="mono"
              [value]="uid()"
              (input)="onUidInput($event)"
              placeholder="Type or paste their ID"
              autocomplete="off"
              spellcheck="false"
              maxlength="12"
              (keyup.enter)="lookup()"
            >
            <small class="hint">The nine characters shown in their own app.</small>
          </label>
          <button type="button" class="btn btn-primary" [disabled]="!uid().trim() || looking()" (click)="lookup()">
            {{ looking() ? 'Looking up...' : 'Find' }}
          </button>
        </div>

        @if (lookupError(); as message) {
          <p class="error-text">{{ message }}</p>
        }

        @if (identity(); as person) {
          <article class="identity">
            <!-- No photograph is returned any more; initials are all there is. -->
            <span class="identity__photo identity__photo--blank" aria-hidden="true">
              {{ initials(person) }}
            </span>

            <div class="identity__body">
              <p class="identity__name">{{ fullName(person) }}</p>
              <p class="muted mono">{{ person.userUid }}</p>

              <!--
                The renter profile itself is not readable here and no call is
                made for it — that is the design. A uid confirms who somebody
                is; their profile arrives only when they approve the request.
                All this says is whether there is one to ask for.
              -->
              @if (person.hasTenancyProfile && person.officialIdentityComplete) {
                <p class="muted">
                  They have a renter profile. You will see it once they approve your request.
                </p>
              } @else if (person.hasTenancyProfile) {
                <p class="muted">
                  They have started a renter profile but not stated their legal name and ID yet.
                  They will be asked to finish it before they can accept.
                </p>
              } @else {
                <p class="muted">
                  They have not filled in a renter profile yet. You can still invite them — the
                  request prompts them to complete it before they can accept.
                </p>
              }

              @if (person.accountActive === false) {
                <p class="muted">
                  This account has not been claimed, so they cannot accept an invitation or share
                  documents yet. You can still create the tenancy and manage it yourself.
                </p>
              }
            </div>
          </article>
        }
      </app-section-card>
      </div>
      }

      @if (mode() === 'code' || identity()) {
        <!--
          The building is needed to create the tenancy, not to look somebody
          up. Guarding the whole page meant an admin who had not picked one
          clicked through to "Select a building" and never saw the uid field —
          which is the only thing this screen is for.
        -->
        <app-context-guard
          [requireBuilding]="true"
          [requirePermission]="Permissions.TENANT_CREATE"
          action="this tenant is moving into"
        >
        <!--
          Only what the invitation needs: the room and its terms. Everything
          else about the person — contacts, identity, employer — arrives from
          their renter profile when they accept, so asking for it here was a
          screen of empty fields between finding them and inviting them.
        -->
        <form class="narrow" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card
            title="The tenancy"
            [subtitle]="context.active().buildingName ? 'Moving into ' + context.active().buildingName : null"
          >
            <div class="grid-auto">
              @if (mode() === 'code') {
                <label class="field">
                  <span>Share code</span>
                  <input
                    class="mono"
                    formControlName="shareCode"
                    placeholder="The code they gave you"
                    autocapitalize="characters"
                    autocomplete="off"
                    spellcheck="false"
                    (input)="upperCaseCode($event)"
                  >
                  <app-field-error [control]="form.controls.shareCode" label="Share code" />
                </label>
              }

              <label class="field">
                <span>Room</span>
                <app-room-picker
                  formControlName="intendedRoomId"
                  [agencyId]="context.agencyId()"
                  [buildingId]="context.buildingId()"
                />
                <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
              </label>

              @if (mode() === 'uid') {
              <label class="field">
                <span>Tenancy type</span>
                <select formControlName="tenantType">
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="FAMILY">Family</option>
                  <option value="CORPORATE">Corporate</option>
                  <option value="STUDENT">Student</option>
                </select>
              </label>
              }

              <label class="field">
                <span>Monthly rent</span>
                <input type="number" step="0.01" min="0" formControlName="monthlyRent" [placeholder]="rentPlaceholder()">
                <small class="hint">{{ rentHint() }}</small>
              </label>
            </div>

            @if (mode() === 'uid') {
              <p class="muted">
                The invitation also asks for their renter profile and the documents in it. Accepting
                shares both; nothing is readable until they do.
              </p>
            } @else {
              <p class="muted">
                The code shares their renter profile and documents with you now. The tenancy is
                created with their details, ready for you to check and verify.
              </p>
            }
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This person is already a tenant here' : 'Unable to add the tenant'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Sending...' : submitLabel() }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.tenants">Cancel</a>
          </div>
        </form>
        </app-context-guard>
      }
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .uid-form {
      display: flex;
      align-items: end;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .uid-form .field { flex: 1 1 14rem; }

    .identity {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.4rem 1rem;
      align-items: center;
      margin-top: 1rem;
      padding: 0.9rem 1rem;
      border: 1px solid var(--primary-ring);
      border-radius: var(--radius-lg);
      background: var(--primary-tint);
    }

    .identity__photo {
      width: 4rem;
      height: 4rem;
      border-radius: 999px;
      object-fit: cover;
    }

    .identity__photo--blank {
      display: inline-grid;
      place-items: center;
      background: var(--surface-2);
      color: var(--text-muted);
      font-weight: 700;
    }

    .identity__body { display: grid; gap: 0.2rem; min-width: 0; }
    .identity__name { margin: 0; font-size: 1.05rem; font-weight: 700; }

    /* Forms of three or four short fields read best at a measure, not the page width. */
    .narrow { width: 100%; max-width: 44rem; }

    p { margin: 0; }

    /* The sequence, stated before the first field rather than discovered. */
    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 1.25rem;
      margin: 0;
      padding: 0.7rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      list-style: none;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .steps__item { display: flex; align-items: center; gap: 0.45rem; }

    /* A sequence reads down on a phone; wrapped, steps 1 and 2 shared a line and 3 did not. */
    @media (max-width: 700px) {
      .steps { flex-direction: column; gap: 0.45rem; }
    }

    .steps__n {
      display: inline-grid;
      place-items: center;
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: 0.74rem;
      font-weight: 700;
    }

    .steps__item--now { color: var(--text); font-weight: 600; }

    .steps__item--now .steps__n {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--surface);
    }

    @media (max-width: 560px) {
      .identity { grid-template-columns: 1fr; justify-items: start; }
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
    return `Leave blank to use ${terms.monthlyRent}, set by ${from}.`;
  });

  submitLabel(): string {
    return this.mode() === 'code' ? 'Create tenant' : 'Send invitation';
  }

  /** Details first: it works whether or not the tenant has an account. */
  readonly mode = signal<AddMode>('manual');

  setMode(mode: AddMode): void {
    this.mode.set(mode);
    this.saveError.set(null);
    const code = this.form.controls.shareCode;
    code.setValidators(mode === 'code' ? [Validators.required] : []);
    code.updateValueAndValidity();
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
    this.setMode(requested === 'code' || requested === 'uid' ? requested : 'manual');

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
