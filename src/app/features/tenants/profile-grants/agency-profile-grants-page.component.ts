import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ProfileGrant } from '../models/profile-grant.models';
import { ProfileGrantsService } from './profile-grants.service';

/**
 * What this agency has been allowed to read, and until when.
 *
 * Staff need this to know which documents they may actually open — a tenancy
 * on the books is not itself permission to read somebody's national ID. Every
 * row here was created by the person it concerns, either by approving a
 * request or by handing over a code.
 *
 * The only two things an agency can do are on this page: ask (from the tenant's
 * own record, where the tenancy is in hand) and redeem a code it was given.
 * There is deliberately nothing here that grants access.
 */
@Component({
  selector: 'app-agency-profile-grants-page',
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
    ContextGuardComponent,
    FieldErrorComponent,
    FormFeedbackDirective,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-context-guard [requirePermission]="Permissions.TENANT_DOCUMENT_READ">
        <app-section-card
          title="Redeem a share code"
          subtitle="When a tenant hands you a code rather than answering in the app."
        >
          <form class="redeem" [formGroup]="redeemForm" appFormFeedback (ngSubmit)="redeem()">
            <label class="field">
              <span>Share code</span>
              <input formControlName="shareCode" class="mono" placeholder="Paste the code" autocomplete="off">
              <app-field-error [control]="redeemForm.controls.shareCode" label="Share code" />
            </label>

            <label class="field">
              <span>Tenancy</span>
              <input type="number" formControlName="tenantId" placeholder="Tenant id, if the code named none">
              <small class="hint">Only needed when the code was issued before the tenancy existed.</small>
            </label>

            <button type="submit" class="btn btn-primary" [disabled]="redeeming()">
              {{ redeeming() ? 'Redeeming...' : 'Redeem' }}
            </button>
          </form>

          @if (redeemError(); as apiError) {
            <app-error-card title="Unable to redeem that code" [message]="apiError.message" [details]="apiError.details" />
          }

          @if (redeemed(); as grant) {
            <p class="muted">
              Redeemed. {{ grant.userName || 'The tenant' }} is sharing
              {{ (grant.documents ?? []).length | plural: 'document' }} with you.
            </p>
          }
        </app-section-card>

        <app-section-card
          title="Documents shared with us"
          subtitle="What staff may open, and for how long. Anything not listed here is not yours to read."
        >
          @if (loading()) {
            <app-loading-state label="Loading..." />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (grants().length === 0) {
            <app-empty-state
              title="Nothing shared with you yet"
              description="Ask from a tenant's own record, or redeem a code they hand you."
            />
          } @else {
            <ul class="grants">
              @for (grant of grants(); track grant.id) {
                <li class="grant" [class.grant--stale]="!grant.currentlyValid">
                  <div class="grant__body">
                    <p class="grant__who">
                      {{ grant.userName || 'Tenant #' + grant.tenantId }}
                      <app-status-chip [status]="grant.status" />
                      @if (grant.currentlyValid) {
                        <span class="status-chip status-chip--success">Readable now</span>
                      }
                    </p>

                    @if (grant.purpose) {
                      <p class="muted">{{ grant.purpose }}</p>
                    }

                    @if ((grant.documents ?? []).length > 0) {
                      <p class="muted">
                        @for (document of grant.documents; track document.id) {
                          <span class="doc">{{ document.documentType | humanLabel }}</span>
                        }
                      </p>
                    }

                    <p class="muted">
                      @if (grant.expiresAt) {
                        {{ grant.currentlyValid ? 'Access ends' : 'Access ended' }}
                        {{ grant.expiresAt | date: 'd MMM y' }}
                      } @else {
                        Awaiting their answer.
                      }
                    </p>
                  </div>
                </li>
              }
            </ul>
          }
        </app-section-card>
      </app-context-guard>
    </section>
  `,
  styles: [`
    .redeem {
      display: flex;
      align-items: end;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .redeem .field { flex: 1 1 12rem; }

    .grants { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }

    .grant {
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    /* Expired or withdrawn: still worth seeing, but not something to act on. */
    .grant--stale { opacity: 0.72; }

    .grant__body { display: grid; gap: 0.25rem; min-width: 0; }

    .grant__who {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin: 0;
      font-weight: 700;
    }

    .doc {
      display: inline-block;
      margin-right: 0.4rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--surface-2);
      font-size: 0.76rem;
    }

    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyProfileGrantsPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;
  readonly context = inject(ActiveContextService);

  private readonly service = inject(ProfileGrantsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly grants = signal<ProfileGrant[]>([]);

  readonly redeeming = signal(false);
  readonly redeemError = signal<ApiError | null>(null);
  readonly redeemed = signal<ProfileGrant | null>(null);

  readonly agencyId = computed(() => this.context.agencyId());

  readonly redeemForm = this.formBuilder.group({
    shareCode: ['', [Validators.required]],
    tenantId: [null as number | null]
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.agencyId();
    if (!agencyId) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const page = await firstValueFrom(this.service.getAgencyGrants(Number(agencyId), { size: 100 }));
      this.grants.set(page.items ?? []);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * A wrong code, a code for another agency and an expired code all come back
   * the same way from the backend. That is deliberate — telling them apart
   * would turn this box into a guessing oracle — so the message is shown as
   * given rather than being interpreted here.
   */
  async redeem(): Promise<void> {
    const agencyId = this.agencyId();
    if (this.redeemForm.invalid || !agencyId) {
      this.redeemForm.markAllAsTouched();
      return;
    }

    this.redeeming.set(true);
    this.redeemError.set(null);
    this.redeemed.set(null);

    try {
      const value = this.redeemForm.getRawValue();
      const grant = await firstValueFrom(this.service.redeemShareCode(Number(agencyId), {
        shareCode: value.shareCode.trim(),
        tenantId: value.tenantId
      }));

      this.redeemed.set(grant);
      this.redeemForm.reset({ shareCode: '', tenantId: null });
      await this.reload();
    } catch (error) {
      this.redeemError.set(toApiError(error));
    } finally {
      this.redeeming.set(false);
    }
  }
}
