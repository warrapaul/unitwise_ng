import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ProfileGrant } from '../models/profile-grant.models';
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
    ReactiveFormsModule,
    DatePipe,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    EmptyStateComponent,
    StatusChipComponent,
    EntityPickerComponent,
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
                    {{ grant.agencyName || 'Agency #' + grant.agencyId }}
                    <app-status-chip [status]="grant.status" />
                    @if (grant.grantType === 'PUSH_CODE') {
                      <span class="status-chip status-chip--info">Share code</span>
                    }
                  </p>

                  @if (grant.purpose) {
                    <p class="muted">{{ grant.purpose }}</p>
                  }

                  <p class="muted">
                    {{ (grant.documents ?? []).length }} document(s)@if (grant.expiresAt) {<span>
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
              <label class="field">
                <span>Which agency</span>
                <app-entity-picker
                  [config]="pickers.agency"
                  formControlName="agencyId"
                  placeholder="Search for the agency"
                />
                <app-field-error [control]="codeForm.controls.agencyId" label="Agency" />
                <small class="hint">The code only works for them. Nobody else can redeem it.</small>
              </label>

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
                    <option [value]="24">24 hours</option>
                    <option [value]="72">3 days</option>
                    <option [value]="168">7 days</option>
                  </select>
                  <small class="hint">How long they have to redeem it, not how long they keep access.</small>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyProfileGrantsPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);

  private readonly grants = inject(ProfileGrantsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly confirmDialog = inject(ConfirmService);

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
    agencyId: [null as number | null, [Validators.required]],
    purpose: '',
    validForHours: 72
  });

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
    this.codeForm.reset({ agencyId: null, purpose: '', validForHours: 72 });
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

    this.busy.set(true);
    this.actionError.set(null);

    try {
      const value = this.codeForm.getRawValue();
      const grant = await firstValueFrom(this.grants.createShareCode({
        agencyId: value.agencyId!,
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
