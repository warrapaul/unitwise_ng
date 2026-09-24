import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ProfileGrant, ShareCodeMode } from '../models/profile-grant.models';
import { HousingService } from '../../housing/housing.service';
import { AgencyPublicIdentity } from '../../housing/models/housing.models';
import { ProfileGrantsService } from './profile-grants.service';

/**
 * Who may read this person's identity documents, and until when.
 *
 * The documents belong to the person, not to any one landlord: someone renting
 * from three agencies uploads their national ID once, and each agency sees it
 * only for as long as they allow. Everything here is owner-only on the backend
 * — there is no permission an administrator could hold that reaches it, and no
 * operation by which an agency grants itself access.
 *
 * The access counter is shown rather than merely logged. Knowing an agency
 * opened your documents nine times last week is the part of consent that makes
 * it meaningful instead of ceremonial.
 */
@Component({
  selector: 'app-my-profile-grants-page',
  standalone: true,
  imports: [
    PluralPipe,
    ReactiveFormsModule,
    DatePipe,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    EmptyStateComponent,
    StatusChipComponent,
    FieldErrorComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (pending().length > 0) {
        <app-section-card
          title="Waiting for your answer"
          subtitle="Nothing is shared until you accept."
        >
          @for (grant of pending(); track grant.id) {
            <article class="request">
              <header class="request__head">
                <div>
                  <p class="request__who">
                    {{ grant.agencyName || 'An agency' }} is asking to see your renter profile
                  </p>
                  @if (grant.purpose) {
                    <p class="muted">{{ grant.purpose }}</p>
                  }
                  @if (grant.requestedAt) {
                    <p class="muted">Asked {{ grant.requestedAt | date: 'd MMM y' }}</p>
                  }
                </div>
              </header>

              <!--
                One decision. A grant covers the renter profile and the
                documents behind it together, because that is what the profile
                is — what you state plus the evidence for it. Splitting it into
                per-document checkboxes asked the person to make six decisions
                about a single question, and the answer to all six was always
                the same.
              -->
              <p class="muted">
                Accepting shares your renter profile and the documents in it, including anything
                you add later. They keep seeing it until you stop sharing or it expires. If they
                verify you, the copy they take then stays theirs even after you stop.
              </p>

              @if (actionError(); as apiError) {
                <app-error-card title="Unable to share" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="decline(grant)">
                  Decline
                </button>
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="approve(grant)">
                  {{ busy() ? 'Sharing...' : 'Accept' }}
                </button>
              </div>
            </article>
          }
        </app-section-card>
      }

      <app-section-card
        title="What you are sharing"
        subtitle="Stop any of these at any time. An agency that already verified you keeps the copy it took then — stopping the share ends live access, not their record."
      >
        <ng-container actions>
          <button type="button" class="btn btn-secondary" (click)="startShareCode()">Create a share code</button>
        </ng-container>

        @if (loading()) {
          <app-loading-state label="Loading..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (settled().length === 0) {
          <app-empty-state
            title="You are not sharing anything"
            description="When a landlord asks, the request appears here and nothing moves until you answer it."
          />
        } @else {
          <ul class="grants">
            @for (grant of settled(); track grant.id) {
              <li class="grant">
                <div class="grant__body">
                  <p class="grant__who">
                    {{ grant.agencyName || (grant.codeMode === 'OPEN' ? 'Any agency — not used yet' : 'An agency') }}
                    <app-status-chip [status]="grant.status" />
                    @if (grant.grantType === 'PUSH_CODE') {
                      <span class="status-chip status-chip--info">{{ grant.codeMode === 'OPEN' ? 'Open code' : 'Share code' }}</span>
                    }
                  </p>

                  @if (grant.purpose) {
                    <p class="muted">{{ grant.purpose }}</p>
                  }

                  <p class="muted">
                    {{ (grant.documents ?? []).length | plural: 'document' }}@if (grant.expiresAt) {<span>
                      · {{ grant.currentlyValid ? 'until' : 'ended' }} {{ grant.expiresAt | date: 'd MMM y' }}</span>}
                  </p>

                  @if (grant.revokedReason) {
                    <p class="muted">You stopped this: {{ grant.revokedReason }}</p>
                  }
                </div>

                @if (grant.currentlyValid) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="revoke(grant)">
                    Stop sharing
                  </button>
                }
              </li>
            }
          </ul>
        }
      </app-section-card>

      @if (creatingCode()) {
        <app-section-card
          title="Create a share code"
          subtitle="For handing over in person, or before a landlord has set anything up."
        >
          @if (issuedCode(); as code) {
            <!--
              Only the hash is stored, so this is the only moment the code can
              ever be shown. Say so plainly rather than letting someone close
              the page expecting to find it again.
            -->
            <div class="issued">
              <p class="issued__label">Give them this code</p>
              <p class="issued__code mono">{{ code }}</p>
              <p class="muted">
                It will not be shown again. If you lose it, create another — this one stays valid
                until it is redeemed or expires.
              </p>
              <div class="button-row">
                <button type="button" class="btn btn-primary" (click)="finishShareCode()">Done</button>
              </div>
            </div>
          } @else {
            <form class="stack" [formGroup]="codeForm" appFormFeedback (ngSubmit)="createShareCode()">
              <!--
                A tenant cannot search agencies, so an agency is named by the
                public code it gives out, confirmed by name before anything is
                issued. "Any agency" exists for when nobody has one to hand —
                it is a bearer code, so it is short-lived and binds to the
                first agency that uses it.
              -->
              <fieldset class="choice">
                <legend>Who can use it</legend>
                <label class="checkbox-field">
                  <input type="radio" formControlName="mode" value="AGENCY">
                  <span>One agency, by its agency code</span>
                </label>
                <label class="checkbox-field">
                  <input type="radio" formControlName="mode" value="OPEN">
                  <span>Any agency, once</span>
                </label>
              </fieldset>

              @if (codeForm.controls.mode.value === 'AGENCY') {
                <label class="field">
                  <span>Agency code</span>
                  <input
                    formControlName="agencyCode"
                    class="mono"
                    placeholder="e.g. K7MPX2QR"
                    autocapitalize="characters"
                    autocomplete="off"
                    (blur)="lookUpAgency()"
                  >
                  <app-field-error [control]="codeForm.controls.agencyCode" label="Agency code" />
                  @if (lookingUp()) {
                    <small class="hint">Checking...</small>
                  } @else if (agency(); as found) {
                    <div class="agency-found">
                      @if (found.logoUrl) {
                        <img [src]="found.logoUrl" alt="" width="28" height="28">
                      }
                      <strong>{{ found.name }}</strong>
                    </div>
                  } @else if (lookupError(); as message) {
                    <small class="error-text">{{ message }}</small>
                  } @else {
                    <small class="hint">Ask the agency for it. The share code will only work for them.</small>
                  }
                </label>
              } @else {
                <p class="hint">
                  Whoever redeems it first gets your profile and documents, and then it works for nobody
                  else. Only give it to someone you trust — anyone who sees it could use it. You will be
                  told who redeemed it and can stop sharing at once.
                </p>
              }

              <!-- Same grant as an in-app approval, so the same scope: the
                   profile and the documents behind it, not a selection. -->
              <p class="muted">
                The code shares your renter profile and the documents in it — including anything
                you add later — exactly as approving a request in the app would.
              </p>

              <div class="grid-auto">
                <label class="field">
                  <span>Why</span>
                  <input formControlName="purpose" placeholder="Verification for a new tenancy">
                </label>
                <label class="field">
                  <span>Code valid for</span>
                  <select formControlName="validForHours">
                    @for (option of validityOptions(); track option.hours) {
                      <option [value]="option.hours" [selected]="option.hours === +codeForm.controls.validForHours.value">
                        {{ option.label }}
                      </option>
                    }
                  </select>
                  <small class="hint">How long it can be redeemed, not how long access lasts.</small>
                </label>
              </div>

              @if (actionError(); as apiError) {
                <app-error-card title="Unable to create the code" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="busy()">
                  {{ busy() ? 'Creating...' : 'Create code' }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="finishShareCode()">Cancel</button>
              </div>
            </form>
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    .request {
      display: grid;
      gap: 0.75rem;
      padding: 0.9rem 1rem;
      border: 1px solid var(--warning-border);
      border-radius: var(--radius-lg);
      background: var(--warning-tint);
    }

    .request + .request { margin-top: 0.6rem; }
    .request__who { margin: 0; font-weight: 700; }

    .grants { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }

    .grant {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    .grant__body { display: grid; gap: 0.25rem; min-width: 0; flex: 1; }

    .grant__who {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin: 0;
      font-weight: 700;
    }

    .documents {
      display: grid;
      gap: 0.4rem;
      margin: 0;
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    legend { padding: 0 0.4rem; font-weight: 700; }

    .issued { display: grid; gap: 0.5rem; justify-items: start; }
    .issued__label { margin: 0; font-weight: 700; }

    .issued__code {
      margin: 0;
      padding: 0.5rem 0.9rem;
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      font-size: 1.5rem;
      letter-spacing: 0.15em;
    }

    p { margin: 0; }

    .choice { display: grid; gap: 0.4rem; margin: 0; padding: 0; border: 0; }
    .choice legend { padding: 0; margin-bottom: 0.4rem; font-weight: 600; font-size: 0.9rem; }

    .agency-found { display: flex; align-items: center; gap: 0.5rem; }
    .agency-found img { border-radius: var(--radius-sm); object-fit: cover; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyProfileGrantsPageComponent implements OnInit {
  private readonly grants = inject(ProfileGrantsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly confirmDialog = inject(ConfirmService);
  private readonly housing = inject(HousingService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly all = signal<ProfileGrant[]>([]);

  readonly busy = signal(false);
  readonly actionError = signal<ApiError | null>(null);

  readonly creatingCode = signal(false);
  readonly issuedCode = signal<string | null>(null);


  /** A date input needs a floor, and today would already be in the past by evening. */
  readonly tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  /** Requests nobody has answered — the only thing on this page that needs doing. */
  readonly pending = computed(() => this.all().filter((grant) => grant.status === 'PENDING'));

  readonly settled = computed(() => this.all().filter((grant) => grant.status !== 'PENDING'));







  readonly codeForm = this.formBuilder.group({
    mode: 'AGENCY' as ShareCodeMode,
    agencyCode: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,12}$/)]],
    purpose: '',
    validForHours: 72
  });

  /** The agency the typed code resolves to, confirmed by name before a code is issued. */
  readonly agency = signal<AgencyPublicIdentity | null>(null);
  readonly lookingUp = signal(false);
  readonly lookupError = signal<string | null>(null);

  private readonly mode = toSignal(this.codeForm.controls.mode.valueChanges, { initialValue: 'AGENCY' as ShareCodeMode });

  /** An open code is a bearer credential, so the server caps it at a day. */
  readonly validityOptions = computed(() => this.mode() === 'OPEN'
    ? [{ hours: 1, label: '1 hour' }, { hours: 6, label: '6 hours' }, { hours: 24, label: '24 hours' }]
    : [{ hours: 24, label: '24 hours' }, { hours: 72, label: '3 days' }, { hours: 168, label: '7 days' }]);

  constructor() {
    this.codeForm.controls.mode.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => {
      const code = this.codeForm.controls.agencyCode;
      code.setValidators(mode === 'AGENCY'
        ? [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,12}$/)]
        : []);
      code.updateValueAndValidity();
      this.codeForm.controls.validForHours.setValue(mode === 'OPEN' ? 6 : 72);
    });

    // A changed code is a different agency until looked up again.
    this.codeForm.controls.agencyCode.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.agency.set(null);
      this.lookupError.set(null);
    });
  }

  /**
   * Resolve the typed code to a name. The server answers an exact code only,
   * and its "not found" is rendered as given (§39) — never improved on.
   */
  async lookUpAgency(): Promise<AgencyPublicIdentity | null> {
    const control = this.codeForm.controls.agencyCode;
    const code = control.value.trim().toUpperCase();
    if (control.invalid || !code) {
      return null;
    }

    const current = this.agency();
    if (current?.agencyCode === code) {
      return current;
    }

    this.lookingUp.set(true);
    this.lookupError.set(null);

    try {
      const found = await firstValueFrom(this.housing.getAgencyByCode(code));
      this.agency.set(found);
      return found;
    } catch (error) {
      this.lookupError.set(extractErrorMessage(error));
      return null;
    } finally {
      this.lookingUp.set(false);
    }
  }

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const page = await firstValueFrom(this.grants.getMyGrants({ size: 100 }));
      this.all.set(page.items ?? []);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }





  /**
   * Share the profile and everything in it.
   *
   * No ids are sent: the server resolves access through the owner, so the
   * grant follows the library rather than freezing a list. Anything uploaded
   * afterwards is covered by this same consent, and one revocation closes it
   * all. Expiry is left to the server's default.
   */
  async approve(grant: ProfileGrant): Promise<void> {
    if (!await this.confirmDialog.ask({
      title: `Share your profile with ${grant.agencyName || 'this agency'}?`,
      message: 'They will see your renter profile and the documents in it. You can stop sharing '
        + 'at any time.',
      confirmLabel: 'Share'
    })) {
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.grants.approveGrant(grant.id, {
        scopes: ['PROFILE', 'DOCUMENTS']
      }));

      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async decline(grant: ProfileGrant): Promise<void> {
    if (!await this.confirmDialog.ask({
      title: `Decline ${grant.agencyName || 'this request'}?`,
      message: 'They are told you declined. They can ask again, and you can still share later.',
      confirmLabel: 'Decline'
    })) {
      return;
    }

    await this.run(() => firstValueFrom(this.grants.declineGrant(grant.id)));
  }

  async revoke(grant: ProfileGrant): Promise<void> {
    if (!await this.confirmDialog.ask({
      title: `Stop sharing with ${grant.agencyName || 'this agency'}?`,
      message: 'Their access to your profile and documents closes immediately. If they already '
        + 'verified you, the copy they took at the time stays with them — that is what your '
        + 'lease rests on, and stopping the share does not undo it.',
      confirmLabel: 'Stop sharing',
      destructive: true
    })) {
      return;
    }

    await this.run(() => firstValueFrom(this.grants.revokeGrant(grant.id)));
  }

  startShareCode(): void {
    this.creatingCode.set(true);
    this.issuedCode.set(null);
    this.actionError.set(null);
    this.codeForm.reset({ mode: 'AGENCY', agencyCode: '', purpose: '', validForHours: 72 });
    this.agency.set(null);
    this.lookupError.set(null);
  }

  finishShareCode(): void {
    this.creatingCode.set(false);
    this.issuedCode.set(null);
  }

  async createShareCode(): Promise<void> {
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }

    const value = this.codeForm.getRawValue();
    const open = value.mode === 'OPEN';

    // Never issue a code for an agency the person has not seen named.
    if (!open && !await this.lookUpAgency()) {
      return;
    }

    if (open && !await this.confirmDialog.ask({
      title: 'Create a code any agency can use?',
      message: 'The first agency to enter it gets your renter profile and documents. Anyone who '
        + 'sees the code could be that agency.',
      confirmLabel: 'Create open code'
    })) {
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);

    try {
      const grant = await firstValueFrom(this.grants.createShareCode({
        ...(open
          ? { openToAnyAgency: true }
          : { agencyCode: value.agencyCode.trim().toUpperCase() }),
        scopes: ['PROFILE', 'DOCUMENTS'],
        purpose: value.purpose || null,
        validForHours: Number(value.validForHours)
      }));

      // Returned exactly once. Put it on screen before anything else can
      // navigate away, because no later read will ever carry it again.
      this.issuedCode.set(grant.shareCode ?? null);
      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);

    try {
      await action();
      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
