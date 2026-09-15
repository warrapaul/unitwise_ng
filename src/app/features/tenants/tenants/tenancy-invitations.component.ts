import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { TenantPreview } from '../models/tenant.models';

/**
 * Tenancies a landlord has created that this person has not yet acknowledged.
 *
 * Renders nothing at all when there are none, so it can sit at the top of a
 * page unconditionally. An invitation is time-sensitive and belongs above the
 * fold rather than behind a tab: until it is answered the tenancy is in nobody
 * useful's queue — not the landlord's, because there is nothing yet to verify.
 *
 * Accepting moves it into the landlord's queue. Declining ends it; the landlord
 * sees the same outcome as a rejection, and either side can start again.
 */
@Component({
  selector: 'app-tenancy-invitations',
  standalone: true,
  imports: [ErrorCardComponent],
  template: `
    @for (tenancy of invitations(); track tenancy.id) {
      <section class="panel invite">
        <div class="invite__copy">
          <h2 class="heading-sm">{{ agencyLabel(tenancy) }} has added you as a tenant</h2>
          <p class="muted">{{ placeLabel(tenancy) }}</p>
          <p class="muted">
            Accepting puts this in their queue to verify. It does not share your documents —
            they have to ask for those separately, and you choose what to send.
          </p>
        </div>

        <div class="button-row">
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="decline(tenancy)">
            Not me
          </button>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="accept(tenancy)">
            {{ busy() ? 'Saving...' : 'Yes, that is me' }}
          </button>
        </div>
      </section>
    }

    @if (error(); as apiError) {
      <app-error-card title="Unable to answer" [message]="apiError.message" [details]="apiError.details" />
    }
  `,
  styles: [`
    :host { display: contents; }

    .invite {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 1rem 1.15rem;
      border-color: var(--primary-ring);
      background: var(--primary-tint);
    }

    .invite__copy { display: grid; gap: 0.25rem; min-width: 0; flex: 1 1 20rem; }
    .invite__copy h2, .invite__copy p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenancyInvitationsComponent implements OnInit {
  /** Fires after an answer, so a host page can refresh what it shows. */
  readonly answered = output<void>();

  private readonly tenants = inject(TenantsService);
  private readonly session = inject(AuthSessionService);
  private readonly confirmDialog = inject(ConfirmService);

  readonly tenancies = signal<TenantPreview[]>([]);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly invitations = computed(() =>
    this.tenancies().filter((tenancy) => tenancy.status === 'AWAITING_TENANT_ACCEPTANCE')
  );

  ngOnInit(): void {
    void this.reload();
  }

  /** A failure here stays silent: this is an addition to a page, not the page. */
  async reload(): Promise<void> {
    const userId = this.session.currentUserId();
    if (!userId) {
      return;
    }

    try {
      this.tenancies.set(await firstValueFrom(this.tenants.getTenantsForUser(userId)));
    } catch {
      this.tenancies.set([]);
    }
  }

  agencyLabel(tenancy: TenantPreview): string {
    return tenancy.agencyName || 'A landlord';
  }

  placeLabel(tenancy: TenantPreview): string {
    const room = tenancy.roomNumber === null || tenancy.roomNumber === undefined
      ? null
      : `Room ${tenancy.roomNumber}`;

    return [tenancy.buildingName, room].filter(Boolean).join(' · ')
      || 'They have not said which room yet.';
  }

  async accept(tenancy: TenantPreview): Promise<void> {
    await this.answer(() => firstValueFrom(this.tenants.acceptTenancy(tenancy.id)));
  }

  async decline(tenancy: TenantPreview): Promise<void> {
    if (!await this.confirmDialog.ask({
      title: 'Say this is not you?',
      message: `${this.agencyLabel(tenancy)} will be told you declined. If it was a mistake they `
        + 'can add you again.',
      confirmLabel: 'Decline',
      destructive: true
    })) {
      return;
    }

    await this.answer(() => firstValueFrom(this.tenants.declineTenancy(tenancy.id)));
  }

  private async answer(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);

    try {
      await action();
      await this.reload();
      this.answered.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
