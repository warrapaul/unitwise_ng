import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { todayIso } from '../../../shared/utils/date.util';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { MoveOutReason, TenantDetail } from '../models/tenant.models';
import { TenantsService } from '../tenants.service';

type Panel = 'notice' | 'move-out' | 'transfer' | null;

const REASONS: { value: MoveOutReason; label: string }[] = [
  { value: 'TENANT_TERMINATED', label: 'They chose to leave' },
  { value: 'LEASE_EXPIRED', label: 'Lease ended' },
  { value: 'MUTUAL_AGREEMENT', label: 'Agreed by both' },
  { value: 'LANDLORD_TERMINATED', label: 'You ended the tenancy' },
  { value: 'BREACH_OF_CONTRACT', label: 'Breach of the agreement' },
  { value: 'EVICTION', label: 'Eviction' },
  { value: 'RENOVATION_REQUIRED', label: 'Room needs major work' },
  { value: 'PROPERTY_SOLD', label: 'Property sold' },
  { value: 'DECEASED', label: 'Tenant passed away' }
];

/**
 * After move-in, the tenancy's next steps as actions — not status edits. Each one goes through the
 * occupancy records on the server: notice sets the expected leaving date, moving out frees the
 * room and closes the lease, a transfer carries the same tenancy to another room.
 */
@Component({
  selector: 'app-tenancy-actions',
  standalone: true,
  imports: [ReactiveFormsModule, NgTemplateOutlet, ErrorCardComponent, FieldErrorComponent, RoomPickerComponent, FormFeedbackDirective],
  template: `
    <!-- Before move-in: one line naming the next step and taking you to it. -->
    @if (tenant().status === 'PENDING' || tenant().status === 'VERIFIED') {
      <section class="panel actions actions--next" aria-label="Next step">
        <div class="actions__head">
          <div>
            <h2 class="heading-sm">{{ tenant().status === 'PENDING' ? 'Next: check their details and verify' : 'Next: move them in, or prepare the lease' }}</h2>
            <p class="muted">{{ tenant().status === 'PENDING'
              ? 'Verifying reserves the room; it can issue the lease and move them in in the same step.'
              : 'Verified, and the room is reserved for them. Billing starts when they move in.' }}</p>
          </div>
          <div class="button-row">
            @if (tenant().status === 'PENDING') {
              <button type="button" class="btn btn-primary btn-sm" (click)="goTo('verify')">Verify</button>
            } @else {
              <button type="button" class="btn btn-primary btn-sm" (click)="goTo('move-in')">Move in</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="goTo('leases')">Lease</button>
            }
          </div>
        </div>
      </section>
    }

    @if (living()) {
      <section class="panel actions" aria-label="Tenancy actions">
        <div class="actions__head">
          <div>
            <h2 class="heading-sm">{{ headline() }}</h2>
            @if (tenant().status === 'NOTICE_GIVEN') {
              <p class="muted">Notice given {{ date(tenant().noticeGivenDate) }}@if (tenant().moveOutDate) { · leaving {{ date(tenant().moveOutDate) }} }.
                Record the move-out when they hand back the keys.</p>
            }
          </div>
          @if (!panel()) {
            <div class="button-row">
              @if (tenant().status === 'NOTICE_GIVEN') {
                <button type="button" class="btn btn-primary btn-sm" (click)="open('move-out')">Record move-out</button>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="withdrawNotice()">Withdraw notice</button>
              } @else {
                <button type="button" class="btn btn-secondary btn-sm" (click)="open('notice')">Give notice</button>
                <button type="button" class="btn btn-secondary btn-sm" (click)="open('transfer')">Move to another room</button>
                <button type="button" class="btn btn-secondary btn-sm" (click)="open('move-out')">Record move-out</button>
              }
            </div>
          }
        </div>

        @switch (panel()) {
          @case ('notice') {
            <form class="stack" [formGroup]="noticeForm" appFormFeedback (ngSubmit)="giveNotice()">
              <div class="grid-auto">
                <label class="field"><span>Notice given on</span><input type="date" formControlName="noticeGivenDate" [max]="today"></label>
                <label class="field"><span>Expected to leave on</span><input type="date" formControlName="expectedMoveOutDate"></label>
              </div>
              <label class="field"><span>Note <span class="muted">(optional)</span></span><input formControlName="note"></label>
              <ng-container [ngTemplateOutlet]="footer" [ngTemplateOutletContext]="{ label: 'Record notice' }" />
            </form>
          }
          @case ('move-out') {
            <form class="stack" [formGroup]="moveOutForm" appFormFeedback (ngSubmit)="moveOut()">
              <div class="grid-auto">
                <label class="field"><span>Moved out on</span><input type="date" formControlName="moveOutDate"></label>
                <label class="field">
                  <span>Why</span>
                  <select formControlName="reason">
                    <option value="" disabled>Choose</option>
                    @for (reason of reasons; track reason.value) { <option [value]="reason.value">{{ reason.label }}</option> }
                  </select>
                  <app-field-error [control]="moveOutForm.controls.reason" label="The reason" />
                </label>
              </div>
              <label class="field"><span>Handover notes <span class="muted">(condition, keys returned)</span></span><textarea formControlName="notes" rows="2"></textarea></label>
              <p class="muted small">The room becomes free and the lease closes. Settle the deposit afterwards in the Deposit section.</p>
              <ng-container [ngTemplateOutlet]="footer" [ngTemplateOutletContext]="{ label: 'Record move-out' }" />
            </form>
          }
          @case ('transfer') {
            <form class="stack" [formGroup]="transferForm" appFormFeedback (ngSubmit)="transfer()">
              <div class="grid-auto">
                <label class="field field--full">
                  <span>New room</span>
                  <app-room-picker formControlName="newRoomId" [agencyId]="agencyId()" [buildingId]="buildingId()" />
                  <app-field-error [control]="transferForm.controls.newRoomId" label="The new room" />
                </label>
                <label class="field"><span>Moving on</span><input type="date" formControlName="transferDate"></label>
                <label class="field"><span>Rent there (KES) <span class="muted">(blank: the room's)</span></span><input type="number" min="0" formControlName="monthlyRent"></label>
              </div>
              <label class="field"><span>Note <span class="muted">(optional)</span></span><input formControlName="notes"></label>
              <p class="muted small">Same tenancy and verification. The current lease closes — prepare a new one for the new room.</p>
              <ng-container [ngTemplateOutlet]="footer" [ngTemplateOutletContext]="{ label: 'Move them' }" />
            </form>
          }
        }

        <ng-template #footer let-label="label">
          @if (error(); as apiError) {
            <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
          }
          <div class="button-row">
            <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy()">{{ busy() ? 'Saving...' : label }}</button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="panel.set(null)">Cancel</button>
          </div>
        </ng-template>
      </section>
    }
  `,
  styles: [`
    .actions { display: grid; gap: 0.75rem; padding: 0.85rem 1rem; }
    .actions__head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0.5rem 1rem; }
    .actions__head h2 { margin: 0; }
    .actions--next { border-left: 4px solid var(--primary); }
    .small { font-size: 0.84rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenancyActionsComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenant = input.required<TenantDetail>();
  /** Something changed: the page reloads the tenant. */
  readonly changed = output<void>();

  private readonly tenants = inject(TenantsService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly reasons = REASONS;
  readonly today = todayIso();
  readonly panel = signal<Panel>(null);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly living = computed(() => ['ACTIVE', 'NOTICE_GIVEN', 'INACTIVE'].includes(this.tenant().status ?? '') && !!this.tenant().roomId);
  readonly headline = computed(() => this.tenant().status === 'NOTICE_GIVEN' ? 'Leaving soon' : 'Living here');

  readonly noticeForm = this.fb.group({ noticeGivenDate: todayIso(), expectedMoveOutDate: '', note: '' });
  readonly moveOutForm = this.fb.group({ moveOutDate: todayIso(), reason: ['' as MoveOutReason | '', Validators.required], notes: '' });
  readonly transferForm = this.fb.group({
    newRoomId: [null as number | null, Validators.required],
    transferDate: todayIso(),
    monthlyRent: [null as number | null],
    notes: ''
  });

  open(panel: Panel): void {
    this.error.set(null);
    if (panel === 'move-out' && this.tenant().moveOutDate) {
      this.moveOutForm.controls.moveOutDate.setValue(this.tenant().moveOutDate!.slice(0, 10));
    }
    this.panel.set(panel);
  }

  async giveNotice(): Promise<void> {
    const value = this.noticeForm.getRawValue();
    await this.run(() => this.tenants.giveNotice(this.agencyId(), this.buildingId(), this.tenant().id, {
      noticeGivenDate: value.noticeGivenDate || null,
      expectedMoveOutDate: value.expectedMoveOutDate || null,
      note: value.note.trim() || null
    }), 'Notice recorded.');
  }

  async withdrawNotice(): Promise<void> {
    if (!await this.confirm.ask({ title: 'Withdraw their notice?', message: 'They stay on as an active tenant.', confirmLabel: 'Withdraw notice' })) {
      return;
    }
    await this.run(() => this.tenants.withdrawNotice(this.agencyId(), this.buildingId(), this.tenant().id), 'Notice withdrawn.');
  }

  async moveOut(): Promise<void> {
    if (this.moveOutForm.invalid) {
      this.moveOutForm.markAllAsTouched();
      return;
    }
    const value = this.moveOutForm.getRawValue();
    if (!await this.confirm.ask({
      title: 'Record that they moved out?',
      message: 'The room is freed for the next tenant, the lease closes, and your access to their identity documents ends. This cannot be undone.',
      confirmLabel: 'Record move-out',
      destructive: true
    })) {
      return;
    }
    await this.run(() => this.tenants.moveOut(this.agencyId(), this.buildingId(), this.tenant().id, {
      moveOutDate: value.moveOutDate || null,
      reason: value.reason as MoveOutReason,
      notes: value.notes.trim() || null
    }), 'Moved out — the room is free. Settle the deposit next.');
  }

  async transfer(): Promise<void> {
    if (this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }
    const value = this.transferForm.getRawValue();
    await this.run(() => this.tenants.transferRoom(this.agencyId(), this.buildingId(), this.tenant().id, {
      newRoomId: value.newRoomId!,
      transferDate: value.transferDate || null,
      monthlyRent: value.monthlyRent,
      notes: value.notes.trim() || null
    }), 'Moved to the new room.');
  }

  /** Scrolls to a section of the tenant page by its id. */
  goTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '';
  }

  private async run(call: () => ReturnType<TenantsService['withdrawNotice']>, done: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(call());
      this.panel.set(null);
      this.notifications.push('success', done);
      this.changed.emit();
    } catch (error) {
      this.error.set(toApiError(error));
      if (!this.panel()) {
        this.notifications.push('error', toApiError(error).message);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
