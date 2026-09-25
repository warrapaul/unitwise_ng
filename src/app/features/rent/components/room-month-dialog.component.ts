import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ArrearsReportingDetail, RoomPaymentStatus, toMonthPath } from '../models/rent.models';
import { RentService } from '../rent.service';

/** A charge line the operator can act on. */
interface Line {
  chargeId: number | null;
  name: string;
  amount: number | string | null;
  outstanding: number | string | null;
}

type Mode = { kind: 'view' } | { kind: 'charge' } | { kind: 'adjust'; line: Line } | { kind: 'waive'; line: Line };

/**
 * One room's month, and everything that can be done to it, where the room
 * already is: record a payment, add a charge, adjust or waive one. What used to
 * need the separate adjustments page with the tenant and charge picked again.
 */
@Component({
  selector: 'app-room-month-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, LoadingStateComponent, FormFeedbackDirective],
  template: `
    <app-dialog [title]="title()" [subtitle]="monthLabel()" width="36rem" (closed)="closed.emit()">
      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading the month..." />
      } @else if (loadError()) {
        <p class="error-text">{{ loadError() }}</p>
      } @else if (detail(); as month) {
        <dl class="totals">
          <div><dt>Due</dt><dd>{{ month.totalDue ?? '-' }}</dd></div>
          <div><dt>Paid</dt><dd>{{ month.totalPaid ?? '-' }}</dd></div>
          <div><dt>Outstanding</dt><dd><strong>{{ room().outstanding ?? '-' }}</strong></dd></div>
        </dl>

        <table class="table lines">
          <thead><tr><th>Item</th><th>Amount</th><th>Balance</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr>
              <td>Rent</td>
              <td>{{ month.baseRent ?? '-' }}</td>
              <td>{{ rentBalance(month) }}</td>
              <td></td>
            </tr>
            @for (line of lines(); track $index) {
              <tr>
                <td>{{ line.name }}</td>
                <td>{{ line.amount ?? '-' }}</td>
                <td>{{ line.outstanding ?? '-' }}</td>
                <td class="line-actions">
                  @if (line.chargeId) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="startAdjust(line)">Adjust</button>
                    <button type="button" class="btn btn-secondary btn-sm" (click)="startWaive(line)">Waive</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>

        @switch (mode().kind) {
          @case ('charge') {
            <form id="room-month-form" class="stack sub-form" [formGroup]="chargeForm" appFormFeedback (ngSubmit)="addCharge()">
              <div class="grid-auto">
                <label class="field">
                  <span>Charge</span>
                  <input formControlName="name" placeholder="e.g. Repairs">
                  <app-field-error [control]="chargeForm.controls.name" label="Charge" />
                </label>
                <label class="field">
                  <span>Amount</span>
                  <input type="number" step="0.01" min="0" formControlName="amount">
                  <app-field-error [control]="chargeForm.controls.amount" label="Amount" />
                </label>
              </div>
              <label class="field"><span>Reason</span><input formControlName="reason"></label>
            </form>
          }
          @case ('adjust') {
            <form id="room-month-form" class="stack sub-form" [formGroup]="adjustForm" appFormFeedback (ngSubmit)="adjust()">
              <p class="sub-form__title">Adjust {{ activeLine()?.name }}</p>
              <div class="grid-auto">
                <label class="field">
                  <span>New amount</span>
                  <input type="number" step="0.01" min="0" formControlName="newAmount">
                  <app-field-error [control]="adjustForm.controls.newAmount" label="New amount" />
                </label>
                <label class="field">
                  <span>Reason</span>
                  <input formControlName="reason">
                  <app-field-error [control]="adjustForm.controls.reason" label="Reason" />
                </label>
              </div>
            </form>
          }
          @case ('waive') {
            <form id="room-month-form" class="stack sub-form" [formGroup]="waiveForm" appFormFeedback (ngSubmit)="waive()">
              <p class="sub-form__title">Waive {{ activeLine()?.name }}</p>
              <label class="field">
                <span>Reason</span>
                <input formControlName="reason">
                <app-field-error [control]="waiveForm.controls.reason" label="Reason" />
              </label>
            </form>
          }
        }

        @if (actionError(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      }

      <div dialog-actions>
        @if (mode().kind === 'view') {
          <button type="button" class="btn btn-primary" [disabled]="!room().tenantId" (click)="pay.emit()">Record payment</button>
          <button type="button" class="btn btn-secondary" [disabled]="!detail()" (click)="startCharge()">Add charge</button>
        } @else {
          <button type="submit" form="room-month-form" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : submitLabel() }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="mode.set({ kind: 'view' })">Back</button>
        }
      </div>
    </app-dialog>
  `,
  styles: [`
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0; }
    .totals div { display: grid; gap: 0.1rem; }
    .totals dt { font-size: 0.78rem; color: var(--text-muted); }
    .totals dd { margin: 0; }
    .lines td, .lines th { padding: 0.45rem 0.5rem; }
    .line-actions { white-space: nowrap; text-align: right; }
    .line-actions .btn + .btn { margin-left: 0.3rem; }
    .sub-form { padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-2); }
    .sub-form__title { margin: 0; font-weight: 700; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomMonthDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  /** `YYYY-MM`. */
  readonly month = input.required<string>();
  readonly room = input.required<RoomPaymentStatus>();

  /** Something changed — the page reloads its figures. */
  readonly changed = output<void>();
  /** Record payment was chosen; the page opens that dialog. */
  readonly pay = output<void>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly detail = signal<ArrearsReportingDetail | null>(null);
  readonly mode = signal<Mode>({ kind: 'view' });
  readonly saving = signal(false);
  readonly actionError = signal<ApiError | null>(null);

  readonly chargeForm = this.fb.group({
    name: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    reason: ''
  });
  readonly adjustForm = this.fb.group({
    newAmount: [null as number | null, [Validators.required, Validators.min(0)]],
    reason: ['', Validators.required]
  });
  readonly waiveForm = this.fb.group({ reason: ['', Validators.required] });

  readonly title = computed(() => {
    const room = this.room();
    const name = room.roomName || (room.roomNumber ? `Room ${room.roomNumber}` : 'Room');
    return room.tenantName ? `${name} · ${room.tenantName}` : name;
  });

  readonly lines = computed<Line[]>(() => {
    const month = this.detail();
    if (!month) {
      return [];
    }
    return [
      ...(month.utilities ?? []).map((charge) => ({
        chargeId: charge.chargeId ?? charge.id ?? null,
        name: charge.coversMonthDisplay ? `${charge.name} (${charge.coversMonthDisplay})` : charge.name ?? 'Charge',
        amount: charge.amount ?? null,
        outstanding: charge.outstanding ?? charge.balance ?? null
      })),
      ...(month.otherCharges ?? []).map((charge) => ({
        chargeId: charge.chargeId ?? null,
        name: charge.name ?? 'Charge',
        amount: charge.amount ?? null,
        outstanding: charge.outstanding ?? null
      }))
    ];
  });

  readonly activeLine = computed(() => {
    const mode = this.mode();
    return mode.kind === 'adjust' || mode.kind === 'waive' ? mode.line : null;
  });

  ngOnInit(): void {
    void this.load();
  }

  monthLabel(): string {
    const date = new Date(`${toMonthPath(this.month())}T00:00:00`);
    return Number.isNaN(date.getTime()) ? this.month() : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  rentBalance(month: ArrearsReportingDetail): string {
    const due = Number(month.baseRent ?? 0) + Number(month.lateFee ?? 0);
    const paid = Number(month.rentPaid ?? 0) + Number(month.creditApplied ?? 0);
    return Number.isFinite(due - paid) ? String(Math.max(0, due - paid)) : '-';
  }

  submitLabel(): string {
    switch (this.mode().kind) {
      case 'charge': return 'Add charge';
      case 'adjust': return 'Save amount';
      default: return 'Waive';
    }
  }

  startCharge(): void {
    this.actionError.set(null);
    this.chargeForm.reset({ name: '', amount: null, reason: '' });
    this.mode.set({ kind: 'charge' });
  }

  startAdjust(line: Line): void {
    this.actionError.set(null);
    this.adjustForm.reset({ newAmount: Number(line.amount) || null, reason: '' });
    this.mode.set({ kind: 'adjust', line });
  }

  startWaive(line: Line): void {
    this.actionError.set(null);
    this.waiveForm.reset({ reason: '' });
    this.mode.set({ kind: 'waive', line });
  }

  async addCharge(): Promise<void> {
    const tenantId = this.room().tenantId;
    if (this.chargeForm.invalid || !tenantId) {
      this.chargeForm.markAllAsTouched();
      return;
    }
    const value = this.chargeForm.getRawValue();
    await this.run(() => firstValueFrom(this.rent.addOneOffCharge(this.agencyId(), this.buildingId(), {
      tenantId,
      name: value.name.trim(),
      amount: value.amount!,
      reason: value.reason.trim() || null,
      billedMonth: toMonthPath(this.month())
    })));
  }

  async adjust(): Promise<void> {
    const line = this.activeLine();
    if (this.adjustForm.invalid || !line?.chargeId) {
      this.adjustForm.markAllAsTouched();
      return;
    }
    const value = this.adjustForm.getRawValue();
    await this.run(() => firstValueFrom(this.rent.adjustCharge(this.agencyId(), this.buildingId(), {
      chargeId: line.chargeId!,
      newAmount: value.newAmount!,
      reason: value.reason.trim()
    })));
  }

  async waive(): Promise<void> {
    const line = this.activeLine();
    if (this.waiveForm.invalid || !line?.chargeId) {
      this.waiveForm.markAllAsTouched();
      return;
    }
    await this.run(() => firstValueFrom(this.rent.waiveCharge(this.agencyId(), this.buildingId(), {
      chargeId: line.chargeId!,
      reason: this.waiveForm.getRawValue().reason.trim()
    })));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.saving.set(true);
    this.actionError.set(null);
    try {
      await action();
      this.mode.set({ kind: 'view' });
      this.changed.emit();
      await this.load();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    const tenantId = this.room().tenantId;
    if (!tenantId) {
      this.loading.set(false);
      this.loadError.set('No tenant in this room for the month.');
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.detail.set(await firstValueFrom(this.rent.getTenantArrears(this.agencyId(), this.buildingId(), tenantId, this.month())));
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
