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
@Component({
  selector: 'app-add-existing-tenant-page',
  standalone: true,
  imports: [
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
      <ol class="steps">
        <li class="steps__item" [class.steps__item--now]="!identity()">
          <span class="steps__n">1</span> Find them by user ID
        </li>
        <li class="steps__item" [class.steps__item--now]="!!identity()">
          <span class="steps__n">2</span> Invite them and ask for their documents
        </li>
        <li class="steps__item">
          <span class="steps__n">3</span> They accept and choose what to share
        </li>
        <li class="steps__item">
          <span class="steps__n">4</span> You check the details, correct them, and verify
        </li>
      </ol>

      <app-section-card
        title="Find the person"
        subtitle="Ask them for their user UID — the nine characters shown in their own app."
      >
        <!--
          Not a <form>. Only ReactiveFormsModule is imported here, so a bare
          form gets no NgForm directive, (ngSubmit) binds to an event that
          never fires, and a submit button performs a NATIVE submit — which
          reloads the whole app. The symptom is a page that appears to do
          nothing except re-authenticate.
        -->
        <div class="uid-form">
          <label class="field">
            <span>User UID</span>
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

            <p class="muted identity__note">
              Identity only. Their contact details, ID number and any tenancies elsewhere stay
              private until they choose to share them.
            </p>
          </article>
        }
      </app-section-card>

      @if (identity()) {
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
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card
            title="The tenancy"
            [subtitle]="context.active().buildingName ? 'Moving into ' + context.active().buildingName : 'Where they are moving in, and on what terms.'"
          >
            <div class="grid-auto">
              <label class="field field--full">
                <span>Room</span>
                <app-room-picker
                  formControlName="intendedRoomId"
                  [agencyId]="context.agencyId()"
                  [buildingId]="context.buildingId()"
                />
                <app-field-error [control]="form.controls.intendedRoomId" label="Room" />
              </label>

              <label class="field">
                <span>Tenancy type</span>
                <select formControlName="tenantType">
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="FAMILY">Family</option>
                  <option value="CORPORATE">Corporate</option>
                  <option value="STUDENT">Student</option>
                </select>
              </label>

              <label class="field">
                <span>Monthly rent</span>
                <input type="number" step="0.01" formControlName="monthlyRent" placeholder="Room default">
                <small class="hint">Leave blank to use the room, building or agency rate.</small>
              </label>
            </div>
          </app-section-card>

          <!--
            No identity card here any more. The fields it held defaulted to the
            account's real values, so a uid was enough to copy a stranger's
            national ID into an agency's records. The tenancy is created
            nameless and is filled in when the person approves the request —
            from the details they stated themselves, not from their account.
          -->
          <app-section-card title="Emergency contact" subtitle="Optional, and only what they have given you.">
            <div class="grid-auto">
              <label class="field"><span>Name</span><input formControlName="emergencyContactName"></label>
              <label class="field"><span>Phone</span><input formControlName="emergencyContactPhone"></label>
              <label class="field"><span>Relationship</span><input formControlName="emergencyContactRelationship"></label>
              <label class="field">
                <span>Contact person</span>
                <input formControlName="contactPerson">
                <small class="hint">For a corporate tenancy.</small>
              </label>
            </div>

            <label class="field field--wide">
              <span>Your notes</span>
              <textarea formControlName="notes" rows="2" placeholder="Private to your agency"></textarea>
            </label>
          </app-section-card>

          <app-section-card
            title="Documents"
            subtitle="They decide what to share, and can stop at any time."
          >
            <label class="checkbox-field">
              <input type="checkbox" formControlName="requestDocuments">
              <span>Ask them to share their identity documents</span>
            </label>

            <p class="muted">
              This is what saves someone already verified elsewhere from uploading everything
              again. It asks — it grants nothing, and nothing of theirs is readable until they
              approve. What they share appears on their tenancy page, where you check it before
              verifying. Turn this off if you are collecting and uploading their documents
              yourself.
            </p>

            @if (form.controls.requestDocuments.value) {
              <label class="field field--wide">
                <span>Why you need them</span>
                <input formControlName="documentRequestPurpose" [placeholder]="defaultPurpose()">
                <small class="hint">Shown to them before they decide.</small>
              </label>
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
    .identity__note { grid-column: 1 / -1; margin: 0; font-size: 0.8rem; }

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
    monthlyRent: [null as number | null],
    contactPerson: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    notes: '',
    requestDocuments: true,
    documentRequestPurpose: ''
  });

  readonly defaultPurpose = computed(() => 'Verification for a tenancy');

  /**
   * Name the act, not the screen. Submitting sends an invitation — the
   * verified tenant record comes later, after their documents are read.
   */
  submitLabel(): string {
    return this.form.controls.requestDocuments.value
      ? 'Send invitation and request'
      : 'Send invitation';
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
          ? `No account with UID "${uid}". Check the characters with them — it is not a phone number or an email.`
          : extractErrorMessage(error)
      );
    } finally {
      this.looking.set(false);
    }
  }

  async submit(): Promise<void> {
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
          // Blank means "use their account", which is the whole point of the
          // overrides being optional — an empty box must not blank a real name.
          monthlyRent: value.monthlyRent,
          contactPerson: value.contactPerson || null,
          emergencyContactName: value.emergencyContactName || null,
          emergencyContactPhone: value.emergencyContactPhone || null,
          emergencyContactRelationship: value.emergencyContactRelationship || null,
          notes: value.notes || null,
          requestDocuments: value.requestDocuments,
          documentRequestPurpose: value.documentRequestPurpose || null
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
}
