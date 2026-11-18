import { todayIso } from '../../../shared/utils/date.util';
import { MyTenancyOverviewComponent } from './my-tenancy-overview.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { LeasePreview, TenantDetail, TenantPreview } from '../models/tenant.models';
import { TenancySwitcherComponent } from './tenancy-switcher.component';
import { RentService } from '../../rent/rent.service';
import { TenantDeposit } from '../../rent/models/rent.models';
import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-tenant-profile-page',
  standalone: true,
  imports: [MyTenancyOverviewComponent, PhoneMenuComponent, MoneyPipe, 
    HumanLabelPipe,
    TenancySwitcherComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    StatusChipComponent,
    DialogComponent,
    FieldErrorComponent,
    FormFeedbackDirective,
    DateDisplayDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading your tenancy…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (!tenant()) {
        <!--
          A tenant cannot create a tenancy. It is a landlord's record of
          somebody in their room, so it is created by a landlord who found
          this person by their user ID — never by the person themselves. What
          this page used to offer was a self-register form that posted a
          tenancy to an endpoint which now builds a tenant profile instead.
        -->
        <app-empty-state
          title="No tenancy yet"
          description="A landlord creates this once they have added you to a room. Fill in your tenant profile and give them your user ID, and it appears here."
          actionLabel="Fill in my tenant profile"
          [actionLink]="RoutePaths.renterProfile"
        />

      } @else if (tenant(); as detail) {
        <!--
          The chooser sits above, full width, as on the dashboard. Below it a grid:
          the tenancy across the top, then the deposit beside the details — and
          without a deposit, the details take the whole row.
        -->
        @if (tenancies().length > 1) {
          <app-tenancy-switcher [tenancies]="tenancies()" [selectedId]="selectedId()" (selected)="select($event)" />
        }

        <div class="grid">

        <!-- Not approved: say why, and what puts it right. -->
        @if (detail.status === 'REJECTED') {
          <div class="alert alert-error wide" role="alert">
            <p><strong>Your landlord did not approve this tenancy.</strong>@if (detail.rejectionReason) { Reason: {{ detail.rejectionReason }} }</p>
            <p>Update your tenant profile or documents, then let them know.</p>
            <div class="button-row">
              <button type="button" class="btn btn-primary btn-sm" [disabled]="chatLauncher.opening()" (click)="messageLandlord(detail)">Message landlord</button>
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.renterProfileEdit">Update my profile</a>
            </div>
          </div>
        }
        <!-- Where, with whom and since when leads; the tenant's own name is not news to them. -->
        <app-section-card [title]="placeTitle(detail)" [subtitle]="placeSubtitle(detail)" class="wide">
          <ng-container actions>
            <button type="button" class="btn btn-primary" [disabled]="chatLauncher.opening()" (click)="messageLandlord(detail)">Message landlord</button>
            @if (detail.status === 'ACTIVE') {
              <button type="button" class="btn btn-secondary" (click)="openNotice(detail)">Give notice</button>
            }
          </ng-container>
          <dl class="detail-grid">
            <div><dt>Status</dt><dd><app-status-chip [status]="detail.status" /></dd></div>
            @if (detail.noticeGivenDate) { <div><dt>Notice given</dt><dd>{{ formatDate(detail.noticeGivenDate) }}</dd></div> }
            @if (detail.moveOutDate) { <div><dt>Moving out</dt><dd>{{ formatDate(detail.moveOutDate) }}</dd></div> }
          </dl>
        </app-section-card>

        @if (depositsHere().length > 0) {
          <app-section-card title="Deposit">
            @for (deposit of depositsHere(); track deposit.id) {
              @if (depositSettled(deposit)) {
                <p>{{ deposit.heldAmount | money }} held@if (detail.moveInDate) { since {{ formatDate(detail.moveInDate) }} }</p>
              } @else {
                <dl class="detail-grid">
                  <div><dt>Agreed</dt><dd>{{ deposit.expectedAmount | money }}</dd></div>
                  <div><dt>Paid</dt><dd>{{ deposit.amountReceived | money }}</dd></div>
                  <div><dt>Held</dt><dd>{{ deposit.heldAmount | money }}</dd></div>
                  @if (+(deposit.amountRefunded ?? 0) > 0 || +(deposit.amountDeducted ?? 0) > 0) {
                    <div><dt>Refunded · kept</dt><dd>{{ deposit.amountRefunded | money }} · {{ deposit.amountDeducted | money }}</dd></div>
                  }
                  <div><dt>Status</dt><dd>{{ deposit.status | humanLabel }}</dd></div>
                </dl>
              }
            }
          </app-section-card>
        }

        <!--
          Read-only: the landlord's record of who lives in their room. Identity belongs to the
          account; the landlord corrects the tenancy.
        -->
        <app-section-card title="Your details on this tenancy" subtitle="Kept by your landlord." [class.wide]="depositsHere().length === 0">
          <ng-container actions>
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="chatLauncher.opening()" (click)="messageLandlord(detail)">Request a correction</button>
          </ng-container>
          <dl class="detail-grid">
            <div><dt>Name</dt><dd>{{ fullName(detail) }}</dd></div>
            <div><dt>Phone</dt><dd>@if (detail.phoneNumber) { <app-phone-menu [phone]="detail.phoneNumber" /> } @else { — }</dd></div>
            @if (detail.email) { <div><dt>Email</dt><dd class="wrap">{{ detail.email }}</dd></div> }
            @if (detail.nationalIdNumber) { <div><dt>National ID</dt><dd class="mono">{{ detail.nationalIdNumber }}</dd></div> }
            @if (detail.contactPerson) { <div><dt>Contact person</dt><dd>{{ detail.contactPerson }}</dd></div> }
            @if (detail.emergencyContactName || detail.emergencyContactPhone) {
              <div><dt>Emergency contact</dt><dd>
                {{ detail.emergencyContactName || '—' }}@if (detail.emergencyContactRelationship) { <span class="muted"> · {{ detail.emergencyContactRelationship }}</span> }
                @if (detail.emergencyContactPhone) { <br><app-phone-menu [phone]="detail.emergencyContactPhone" /> }
              </dd></div>
            }
          </dl>
        </app-section-card>

        <!-- This tenancy's leases, newest first: each opens its own page to read, sign or download. -->
        <app-section-card title="Lease" class="wide">
          @if (leasesHere().length === 0) {
            <p class="muted">No lease on this tenancy yet. Your landlord prepares it — ask them for one.</p>
          } @else {
            <ul class="leases">
              @for (lease of leasesHere(); track lease.id) {
                <li>
                  <a class="record-link__primary mono" [routerLink]="RoutePaths.myLeaseDetail(lease.id)">{{ lease.leaseNumber || 'Lease ' + lease.id }}</a>
                  <span class="muted">{{ formatDate(lease.startDate) }} – {{ lease.endDate ? formatDate(lease.endDate) : 'open-ended' }}</span>
                  @if (lease.monthlyRent) { <span class="muted">{{ lease.monthlyRent | money }}/month</span> }
                  <app-status-chip [status]="lease.status" />
                  <a class="btn btn-secondary btn-sm leases__open" [routerLink]="RoutePaths.myLeaseDetail(lease.id)">Open</a>
                </li>
              }
            </ul>
          }
        </app-section-card>

        <!-- The place itself and what is billed on top of rent: moved here from Home, which keeps to paying. -->
        <app-my-tenancy-overview [tenantId]="detail.id" [cards]="['pay', 'home', 'charges']" />
        </div>
      }
    </section>

    @if (notice(); as n) {
      <app-dialog title="Give notice" (closed)="notice.set(null)">
        <form id="notice-form" class="stack" [formGroup]="noticeForm" appFormFeedback (ngSubmit)="sendNotice(n.tenantId)">
          @if (n.days) { <p>Your agreement asks for {{ n.days }} days’ notice, so the earliest is {{ formatDate(n.earliest) }}.</p> }
          <label class="field">
            <span>Move-out day</span>
            <input type="date" appDateDisplay formControlName="moveOut" [min]="n.earliest">
            <app-field-error [control]="noticeForm.controls.moveOut" label="Move-out day" />
          </label>
          <label class="field"><span>Note to your landlord</span><textarea formControlName="note" rows="3" maxlength="1000"></textarea></label>
          @if (noticeError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
        </form>
        <div dialog-actions>
          <button type="button" class="btn btn-secondary" (click)="notice.set(null)">Cancel</button>
          <button type="submit" form="notice-form" class="btn btn-primary" [disabled]="sendingNotice()">{{ sendingNotice() ? 'Sending…' : 'Give notice' }}</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .alert p { margin: 0 0 var(--space-1-5); }
    .alert .button-row { justify-content: flex-start; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; }
    .wide { grid-column: 1 / -1; }
    .wrap { overflow-wrap: anywhere; }
    .leases { margin: 0; padding: 0; list-style: none; display: grid; }
    .leases li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1-5) var(--space-4); padding: var(--space-2-5) 0; border-bottom: 1px solid var(--border); }
    .leases li:last-child { border-bottom: 0; }
    .leases__open { margin-left: auto; }
    @media (max-width: 1000px) { .grid { grid-template-columns: minmax(0, 1fr); } }

    form {
      display: grid;
      gap: var(--space-5);
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantProfilePageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly notice = signal<{ tenantId: number; days: number; earliest: string } | null>(null);
  readonly sendingNotice = signal(false);
  readonly noticeError = signal<string | null>(null);
  readonly noticeForm = inject(NonNullableFormBuilder).group({ moveOut: ['', [Validators.required]], note: '' });
  private readonly toasts = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  /** Notice runs from today; the earliest move-out is today plus the agreed notice period. */
  async openNotice(detail: TenantDetail): Promise<void> {
    let days = 0;
    try {
      days = (await firstValueFrom(this.tenantsService.getMyTenancyOverview(detail.id))).noticePeriodDays ?? 0;
    } catch {
      // Unknown period: any future day, and the landlord sees the date.
    }
    const earliest = todayIso(days);
    this.noticeForm.reset({ moveOut: earliest, note: '' });
    this.noticeError.set(null);
    this.notice.set({ tenantId: detail.id, days, earliest });
  }

  async sendNotice(tenantId: number): Promise<void> {
    if (this.noticeForm.invalid) {
      this.noticeForm.markAllAsTouched();
      return;
    }
    const value = this.noticeForm.getRawValue();
    const earliest = this.notice()?.earliest ?? '';
    if (value.moveOut < earliest) {
      this.noticeError.set(`The earliest move-out day is ${this.formatDate(earliest)}.`);
      return;
    }
    if (!await this.confirm.ask({ title: 'Give notice?', message: `Your landlord is told you are moving out on ${this.formatDate(value.moveOut)}.`, confirmLabel: 'Give notice' })) {
      return;
    }
    this.sendingNotice.set(true);
    this.noticeError.set(null);
    try {
      await firstValueFrom(this.tenantsService.giveMyNotice(tenantId, value.moveOut, value.note.trim() || null));
      this.notice.set(null);
      this.toasts.push('success', 'Notice given. Your landlord has been told.');
      await this.reload();
    } catch (error) {
      this.noticeError.set(extractErrorMessage(error));
    } finally {
      this.sendingNotice.set(false);
    }
  }

  /** "Room 1-2 · Acacia Court" */
  placeTitle(detail: TenantDetail): string {
    const room = detail.roomName || detail.roomNumber || detail.intendedRoomName || detail.intendedRoomNumber;
    return [room ? `Room ${room}` : 'Your room', detail.buildingName].filter(Boolean).join(' · ');
  }

  /** "Highridge Homes · moved in 1 Sep 2026" */
  placeSubtitle(detail: TenantDetail): string | null {
    const parts = [detail.agencyName, detail.moveInDate ? `moved in ${this.formatDate(detail.moveInDate)}` : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }

  depositSettled(d: { expectedAmount?: unknown; amountReceived?: unknown; heldAmount?: unknown }): boolean {
    const held = Number(d.heldAmount ?? 0);
    return held > 0 && Number(d.amountReceived ?? 0) === held && Number(d.expectedAmount ?? 0) === held;
  }

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
  /** Every tenancy this person holds that they have accepted; an open invitation is answered elsewhere. */
  readonly tenancies = signal<TenantPreview[]>([]);
  /** Moves the moment a card is picked, before its details arrive, so the choice shows at once. */
  readonly selectedId = signal<number | null>(null);
  /** Only the deposit of the tenancy on screen. */
  private readonly myLeases = signal<LeasePreview[]>([]);
  /** The leases of the tenancy on screen, newest first. */
  readonly leasesHere = computed(() => this.myLeases()
    .filter((lease) => lease.tenantId === this.tenant()?.id)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '')));
  readonly depositsHere = computed(() => this.myDeposits().filter((deposit) => deposit.tenantId === this.tenant()?.id));
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
    void this.loadLeases();
  }

  /** Every lease the person holds, once; each tenancy shows its own. */
  private async loadLeases(): Promise<void> {
    try {
      this.myLeases.set((await firstValueFrom(this.tenantsService.getMyLeases({ size: 100 }))).items ?? []);
    } catch {
      this.myLeases.set([]);
    }
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
      const tenancies = (await firstValueFrom(this.tenantsService.getMyTenantProfiles()))
        .filter((tenancy) => tenancy.status !== 'AWAITING_TENANT_ACCEPTANCE');
      this.tenancies.set(tenancies);
      // Keep the one on screen if it is still there; otherwise the one they live in, else the first.
      const preview = tenancies.find((tenancy) => tenancy.id === this.tenant()?.id)
        ?? tenancies.find((tenancy) => tenancy.status === 'ACTIVE') ?? tenancies[0] ?? null;

      if (!preview) {
        this.tenant.set(null);
        return;
      }
      this.selectedId.set(preview.id);
      await this.show(preview);
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

  async select(preview: TenantPreview): Promise<void> {
    if (preview.id !== this.selectedId()) {
      this.selectedId.set(preview.id);
      await this.show(preview);
    }
  }

  /** The full record behind a preview: fetched once a landlord is attached, the preview itself until then. */
  private async show(preview: TenantPreview): Promise<void> {
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
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }
}
