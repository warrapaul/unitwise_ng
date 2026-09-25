import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoomLinkComponent } from '../../../shared/components/room-link/room-link.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { TenantDetail } from '../models/tenant.models';
import { RentService } from '../../rent/rent.service';
import { TenantDeposit } from '../../rent/models/rent.models';
import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-tenant-profile-page',
  standalone: true,
  imports: [
    HumanLabelPipe,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    RoomLinkComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading your tenancy..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (!tenant()) {
        <!--
          A tenant cannot create a tenancy. It is a landlord's record of
          somebody in their room, so it is created by a landlord who found
          this person by their user ID — never by the person themselves. What
          this page used to offer was a self-register form that posted a
          tenancy to an endpoint which now builds a renter profile instead.
        -->
        <app-empty-state
          title="No tenancy yet"
          description="A landlord creates this once they have added you to a room. Fill in your renter profile and give them your user ID, and it appears here."
          actionLabel="Fill in my renter profile"
          [actionLink]="RoutePaths.renterProfile"
        />

      } @else if (tenant(); as detail) {
        <app-section-card [title]="fullName(detail)" [subtitle]="detail.buildingName || null">
          <ng-container actions>
            <div class="action-bar">
              <button type="button" class="btn btn-primary" [disabled]="chatLauncher.opening()" (click)="messageLandlord(detail)">
                Message landlord
              </button>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.myLeases">My leases</a>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.myTenantDocuments">My documents</a>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.myRoomApplications">My applications</a>
            </div>
          </ng-container>

          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div>
              <dt>Room</dt>
              <dd>
                <app-room-link
                  [agencyId]="detail.agencyId"
                  [buildingId]="detail.buildingId"
                  [roomId]="detail.roomId ?? detail.intendedRoomId ?? null"
                  [roomNumber]="detail.roomId ? detail.roomNumber : detail.intendedRoomNumber"
                  [roomName]="detail.roomId ? detail.roomName : detail.intendedRoomName"
                  [intended]="!detail.roomId && !!detail.intendedRoomId"
                />
              </dd>
            </div>
            <div><dt>Agency</dt><dd>{{ detail.agencyName || '-' }}</dd></div>
            <div><dt>Move in</dt><dd>{{ formatDate(detail.moveInDate) }}</dd></div>
            <div><dt>Move out</dt><dd>{{ formatDate(detail.moveOutDate) }}</dd></div>
            <div><dt>Verified</dt><dd>{{ detail.verified ? 'Yes' : 'No' }}</dd></div>
          </dl>
        </app-section-card>

        @if (myDeposits().length > 0) {
          <app-section-card title="Deposit">
            @for (deposit of myDeposits(); track deposit.id) {
              <dl class="detail-grid">
                <div><dt>Room</dt><dd>{{ deposit.roomName || '-' }}</dd></div>
                <div><dt>Agreed</dt><dd>{{ deposit.expectedAmount ?? '-' }}</dd></div>
                <div><dt>Paid</dt><dd>{{ deposit.amountReceived ?? 0 }}</dd></div>
                <div><dt>Held</dt><dd>{{ deposit.heldAmount ?? 0 }}</dd></div>
                @if (+(deposit.amountRefunded ?? 0) > 0 || +(deposit.amountDeducted ?? 0) > 0) {
                  <div><dt>Refunded · kept</dt><dd>{{ deposit.amountRefunded ?? 0 }} · {{ deposit.amountDeducted ?? 0 }}</dd></div>
                }
                <div><dt>Status</dt><dd>{{ deposit.status | humanLabel }}</dd></div>
              </dl>
            }
          </app-section-card>
        }

        <!--
          Read-only. A tenancy is the landlord's record of who lives in their
          room, and the endpoint that let a tenant rewrite their own name and
          national ID on it has been removed — it had no status check, so an
          identity could be changed after a lease was signed against a
          snapshot of it. Identity belongs to the account; the landlord
          corrects the tenancy.
        -->
        <app-section-card title="The details on this tenancy">
          <p class="muted">
            Your landlord maintains this record. If something here is wrong,
            ask them to correct it — and update
            <a [routerLink]="RoutePaths.profileEdit">your own profile</a> so
            future tenancies start from the right details.
          </p>

          <dl class="detail-grid">
            <div><dt>Name</dt><dd>{{ fullName(detail) }}</dd></div>
            <div><dt>Phone</dt><dd class="mono">{{ detail.phoneNumber || '—' }}</dd></div>
            <div><dt>Email</dt><dd>{{ detail.email || '—' }}</dd></div>
            <div><dt>National ID</dt><dd class="mono">{{ detail.nationalIdNumber || '—' }}</dd></div>
            <div><dt>Tenancy type</dt><dd>{{ detail.tenantType | humanLabel }}</dd></div>
            <div><dt>Contact person</dt><dd>{{ detail.contactPerson || '—' }}</dd></div>
            <div><dt>Emergency contact</dt><dd>{{ detail.emergencyContactName || '—' }}</dd></div>
            <div><dt>Emergency phone</dt><dd class="mono">{{ detail.emergencyContactPhone || '—' }}</dd></div>
            <div><dt>Relationship</dt><dd>{{ detail.emergencyContactRelationship || '—' }}</dd></div>
          </dl>
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantProfilePageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly router = inject(Router);
  readonly chatLauncher = inject(ChatLauncherService);
  private readonly chat = inject(ChatService);

  messageLandlord(detail: TenantDetail): void {
    void this.chatLauncher.open(this.chat.openTenancyAsTenant(detail.id));
  }

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tenant = signal<TenantDetail | null>(null);
  readonly myDeposits = signal<TenantDeposit[]>([]);
  private readonly rent = inject(RentService);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);



  readonly form = this.formBuilder.group({
    firstName: ['', [Validators.required]],
    middleName: '',
    lastName: ['', [Validators.required]],
    email: ['', [Validators.email]],
    phoneNumber: '',
    nationalIdNumber: '',
    contactPerson: '',
    tenantType: 'INDIVIDUAL',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    notes: ''
  });

  ngOnInit(): void {
    void this.reload();
    void this.loadDeposits();
  }

  /** Their deposits, read-only; the card only shows once there is one. */
  private async loadDeposits(): Promise<void> {
    try {
      this.myDeposits.set(await firstValueFrom(this.rent.getMyDeposits()));
    } catch {
      this.myDeposits.set([]);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      /*
       * The endpoint returns every tenancy this person holds, as previews.
       * This page edits one, so it takes the first; none means the register
       * form is what they see.
       *
       * A preview carries no national ID or emergency contacts, and the
       * detail route is keyed by agency and building — which a tenancy the
       * person registered themselves does not have yet. So the detail is
       * fetched only once a landlord is attached, and until then the form
       * shows what the preview knows and leaves the rest blank rather than
       * inventing it.
       */
      const tenancies = await firstValueFrom(this.tenantsService.getMyTenantProfiles());
      const preview = tenancies[0] ?? null;

      if (!preview) {
        this.tenant.set(null);
        return;
      }

      const tenant = preview.agencyId && preview.buildingId
        ? await firstValueFrom(
            this.tenantsService.getTenant(preview.agencyId, preview.buildingId, preview.id)
          ).catch(() => preview as TenantDetail)
        : preview as TenantDetail;

      this.tenant.set(tenant);

      this.form.patchValue({
        firstName: tenant.firstName ?? '',
        middleName: tenant.middleName ?? '',
        lastName: tenant.lastName ?? '',
        email: tenant.email ?? '',
        phoneNumber: tenant.phoneNumber ?? '',
        nationalIdNumber: tenant.nationalIdNumber ?? '',
        contactPerson: tenant.contactPerson ?? '',
        tenantType: tenant.tenantType ?? 'INDIVIDUAL',
        emergencyContactName: tenant.emergencyContactName ?? '',
        emergencyContactPhone: tenant.emergencyContactPhone ?? '',
        emergencyContactRelationship: tenant.emergencyContactRelationship ?? '',
        notes: tenant.notes ?? ''
      });
    } catch (error) {
      const apiError = toApiError(error);
      // A 404 here just means the signed-in user has no tenancy yet.
      if (apiError.status === 404) {
        this.tenant.set(null);
      } else {
        this.error.set(apiError.message);
      }
    } finally {
      this.loading.set(false);
    }
  }



  goToAvailableRooms(): void {
    void this.router.navigateByUrl(RoutePaths.availableRooms);
  }

  fullName(tenant: TenantDetail): string {
    return [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean).join(' ') || `Tenant #${tenant.id}`;
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }
}
