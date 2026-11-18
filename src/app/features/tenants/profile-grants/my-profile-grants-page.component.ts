import { todayIso } from '../../../shared/utils/date.util';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { UidShareComponent } from '../../../shared/components/uid-share/uid-share.component';

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
    UidShareComponent,
    ReactiveFormsModule,
    DatePipe,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    EmptyStateComponent,
    StatusChipComponent,
    FieldErrorComponent,
    FormFeedbackDirective,
    DialogComponent
  ],
  template: `
    <section class="stack">
      @if (pending().length > 0) {
        <app-section-card
          title="Waiting for your answer"
          subtitle="Accepting shares your tenant profile and its documents. You can stop any time."
        >
          @for (grant of pending(); track grant.id) {
            <article class="request">
              <header class="request__head">
                <div>
                  <p class="request__who">
                    {{ grant.agencyName || 'A landlord' }} is asking to see your tenant profile
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
                One decision per request: a grant covers the profile and its
                documents together. What accepting means is said once, in the
                card's subtitle, not repeated under every request.
              -->
              <div class="button-row">
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="approve(grant)">
                  {{ busy() ? 'Sharing…' : 'Accept' }}
                </button>
                <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="decline(grant)">
                  Decline
                </button>
              </div>
            </article>
          }

          @if (actionError(); as apiError) {
            <app-error-card title="Unable to share" [message]="apiError.message" [details]="apiError.details" />
          }
        </app-section-card>
      }

      <app-section-card
        title="Shared with"
        subtitle="Stop any of these at any time."
      >
        <ng-container actions>
          <button type="button" class="btn btn-secondary" (click)="startShareCode()">Create a share code</button>
        </ng-container>

        @if (loading()) {
          <app-loading-state label="Loading…" />
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
                    {{ grant.agencyName || (grant.codeMode === 'OPEN' ? 'Any landlord — not used yet' : 'A landlord') }}
                    <app-status-chip [status]="grant.status" />
                    @if (grant.grantType === 'PUSH_CODE') {
                      <span class="status-chip status-chip--info">{{ grant.codeMode === 'OPEN' ? 'Open code' : 'Share code' }}</span>
                    }
                  </p>

                  @if (grant.purpose) {
                    <p class="muted">Reason: {{ grant.purpose }}</p>
                  }

                  <!-- What they see, then how long: one fact per line. -->
                  <p class="muted">Sees: {{ seesLine(grant) }}</p>
                  @if (grant.expiresAt) {
                    <p class="muted">{{ grant.currentlyValid ? 'Until' : 'Ended' }} {{ grant.expiresAt | date: 'd MMM y' }}</p>
                  }

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
        <app-dialog [title]="issuedCode() ? 'Your share code' : 'Create a share code'" width="30rem" (closed)="finishShareCode()">
          @if (issuedCode(); as code) {
            <!-- Only the hash is stored, so this is the one time the code can be shown. -->
            <div class="issued">
              <app-uid-share variant="compact" [uid]="code" label="Give them this code" codeName="share code" [hint]="null" />
              <p>Works until {{ codeExpiry() }}. Shown only once — copy or share it now.</p>
              <p class="muted">Changed your mind? Stop it under Shared with.</p>
            </div>
          } @else {
            <form id="share-code-form" class="stack" [formGroup]="codeForm" appFormFeedback (ngSubmit)="createShareCode()">
              <!--
                A tenant cannot search agencies, so an agency is named by the public code it gives out,
                confirmed by name before anything is issued. "Any landlord" is a bearer code: short-lived,
                bound to the first landlord who uses it.
              -->
              <fieldset class="choice">
                <legend>Who can use it</legend>
                <label class="checkbox-field">
                  <input type="radio" formControlName="mode" value="OPEN">
                  <span><strong>Any landlord, once</strong><br><span class="muted">Whoever enters it first.</span></span>
                </label>
                <label class="checkbox-field">
                  <input type="radio" formControlName="mode" value="AGENCY">
                  <span><strong>One landlord</strong><br><span class="muted">Only the landlord whose code you enter.</span></span>
                </label>
              </fieldset>

              @if (codeForm.controls.mode.value === 'AGENCY') {
                <label class="field">
                  <span>Landlord’s code</span>
                  <span class="paste-row">
                    <input formControlName="agencyCode" class="mono" autocapitalize="characters" autocomplete="off" (blur)="lookUpAgency()">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="pasteCode()">Paste</button>
                    <button type="button" class="btn btn-primary btn-sm" [disabled]="lookingUp()" (click)="lookUpAgency()">Find</button>
                  </span>
                  <app-field-error [control]="codeForm.controls.agencyCode" label="Landlord’s code" />
                  @if (lookingUp()) {
                    <small class="hint">Checking…</small>
                  } @else if (agency(); as found) {
                    <div class="agency-found">
                      @if (found.logoUrl) { <img [src]="found.logoUrl" alt="" width="28" height="28"> }
                      <strong>{{ found.name }}</strong>
                    </div>
                  } @else if (lookupError()) {
                    <small class="error-text" role="alert">No landlord found with that code.</small>
                  } @else {
                    <small class="hint">Ask them for it.</small>
                  }
                </label>
              } @else {
                <p class="alert alert-warning">Anyone who sees this code can use it. Send it only to the landlord you mean.</p>
              }

              <!-- One landlord: nothing more to fill in until that landlord is found. -->
              @if (codeForm.controls.mode.value === 'OPEN' || agency()) {
              <div class="grid-auto">
                <label class="field">
                  <span>Reason</span>
                  <input formControlName="purpose" maxlength="200">
                </label>
                <label class="field">
                  <span>Code expires in</span>
                  <select formControlName="validForHours">
                    @for (option of validityOptions(); track option.hours) {
                      <option [ngValue]="option.hours">{{ option.label }}</option>
                    }
                  </select>
                </label>
                <label class="field">
                  <span>Access lasts</span>
                  <select formControlName="accessDays">
                    <option [ngValue]="7">1 week</option>
                    <option [ngValue]="30">30 days</option>
                    <option [ngValue]="90">90 days</option>
                    <option [ngValue]="365">1 year</option>
                  </select>
                </label>
              </div>

              <div class="info">
                <p>They see your tenant profile and its documents — never your Unitwise account. Using the code is your approval: you are not asked again.</p>
                <label class="checkbox-field"><input type="checkbox" formControlName="agreed"><span>I understand</span></label>
                <app-field-error [control]="codeForm.controls.agreed" label="This" />
              </div>
              }

              @if (actionError(); as apiError) {
                <app-error-card title="Unable to create the code" [message]="apiError.message" [details]="apiError.details" />
              }
            </form>
          }
          <div dialog-actions>
            @if (issuedCode()) {
              <button type="button" class="btn btn-primary" (click)="finishShareCode()">Done</button>
            } @else {
              <button type="button" class="btn btn-secondary" (click)="finishShareCode()">Cancel</button>
              <button type="submit" form="share-code-form" class="btn btn-primary" [disabled]="busy() || (codeForm.controls.mode.value === 'AGENCY' && !agency())">{{ busy() ? 'Creating…' : 'Create code' }}</button>
            }
          </div>
        </app-dialog>
      }
    </section>
  `,
  styles: [`
    .request {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-4);
      border: 1px solid var(--warning-border);
      border-radius: var(--radius-lg);
      background: var(--warning-tint);
    }

    .request + .request { margin-top: var(--space-2-5); }
    .request__who { margin: 0; font-weight: var(--weight-bold); }

    .grants { display: grid; gap: var(--space-2-5); margin: 0; padding: 0; list-style: none; }

    .grant {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    .grant__body { display: grid; gap: var(--space-1); min-width: 0; flex: 1; }

    .grant__who {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin: 0;
      font-weight: var(--weight-bold);
    }

    .documents {
      display: grid;
      gap: var(--space-1-5);
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    legend { padding: 0 var(--space-1-5); font-weight: var(--weight-bold); }

    .issued { display: grid; gap: var(--space-2); justify-items: start; }
    .issued__label { margin: 0; font-weight: var(--weight-bold); }

    .issued__code {
      margin: 0;
      padding: var(--space-2) var(--space-4);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      font-size: var(--text-2xl);
      letter-spacing: 0.15em;
    }

    p { margin: 0; }
    .points { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }

    .choice { display: grid; gap: var(--space-1-5); margin: 0; padding: 0; border: 0; }
    .choice legend { padding: 0; margin-bottom: var(--space-1-5); font-weight: var(--weight-semibold); font-size: var(--text-md); }

    .agency-found { display: flex; align-items: center; gap: var(--space-2); }
    .paste-row { display: flex; gap: var(--space-2); }
    .paste-row input { flex: 1; min-width: 0; }
    .info { display: grid; gap: var(--space-2); padding: var(--space-3); border-left: 3px solid var(--primary); border-radius: var(--radius-xs); background: var(--surface-2); }
    .info p { margin: 0; }
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
  readonly tomorrow = todayIso(1);

  /** Requests nobody has answered — the only thing on this page that needs doing. */
  readonly pending = computed(() => this.all().filter((grant) => grant.status === 'PENDING'));

  readonly settled = computed(() => this.all().filter((grant) => grant.status !== 'PENDING'));







  readonly codeForm = this.formBuilder.group({
    // Any landlord by default: most tenants have no landlord's code to hand.
    mode: 'OPEN' as ShareCodeMode,
    agencyCode: ['', [Validators.pattern(/^[A-Za-z0-9]{6,12}$/)]],
    purpose: 'Renting a room',
    validForHours: 6,
    accessDays: 7,
    agreed: [false, [Validators.requiredTrue]]
  });

  /** When the code just issued stops working. */
  readonly codeExpiry = signal('');

  /** "your tenant profile and 2 documents": the profile is the fields and the documents together. */
  seesLine(grant: ProfileGrant): string {
    const docs = (grant.documents ?? []).length;
    return `your tenant profile and ${docs === 0 ? 'any documents you add' : docs === 1 ? '1 document' : docs + ' documents'}`;
  }

  async pasteCode(): Promise<void> {
    try {
      const text = (await navigator.clipboard.readText()).trim().toUpperCase();
      this.codeForm.controls.agencyCode.setValue(text);
      void this.lookUpAgency();
    } catch {
      // Paste refused by the browser: typing still works.
    }
  }

  /** The agency the typed code resolves to, confirmed by name before a code is issued. */
  readonly agency = signal<AgencyPublicIdentity | null>(null);
  readonly lookingUp = signal(false);
  readonly lookupError = signal<string | null>(null);

  private readonly mode = toSignal(this.codeForm.controls.mode.valueChanges, { initialValue: 'OPEN' as ShareCodeMode });

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
      title: `Share your profile with ${grant.agencyName || 'this landlord'}?`,
      message: 'They will see your tenant profile and the documents in it. You can stop sharing '
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
      title: `Stop sharing with ${grant.agencyName || 'this landlord'}?`,
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

  /** Opens the share-code dialog — for a button elsewhere on the page. */
  openShareCode(): void {
    this.startShareCode();
  }

  startShareCode(): void {
    this.creatingCode.set(true);
    this.issuedCode.set(null);
    this.actionError.set(null);
    this.codeForm.reset({ mode: 'OPEN', agencyCode: '', purpose: 'Renting a room', validForHours: 6, accessDays: 7, agreed: false });
    this.codeForm.controls.agencyCode.setValidators([Validators.pattern(/^[A-Za-z0-9]{6,12}$/)]);
    this.codeForm.controls.agencyCode.updateValueAndValidity();
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
      title: 'Create a code any landlord can use?',
      message: 'The first landlord to enter it gets your tenant profile and documents. Anyone who '
        + 'sees the code could be that landlord.',
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
        validForHours: Number(value.validForHours),
        expiresAt: localDateTime(new Date(Date.now() + Number(value.accessDays) * 86_400_000))
      }));
      this.codeExpiry.set(new Date(Date.now() + Number(value.validForHours) * 3_600_000)
        .toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }));

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

/** A LocalDateTime for the server (no zone): 2027-02-08T10:30:00. */
function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}
