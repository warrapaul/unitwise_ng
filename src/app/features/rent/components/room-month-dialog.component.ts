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
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ADJUST_REASONS, CHARGE_REASONS, REINSTATE_REASONS, ReasonFieldComponent, WAIVE_REASONS } from './reason-field.component';

/** A charge line the operator can act on. */
interface Line {
  chargeId: number | null;
  name: string;
  amount: number | string | null;
  outstanding: number | string | null;
  /** Waiving zeroes the amount, so without this the line reads as a free charge. */
  waived: boolean;
}

type Mode = { kind: 'view' } | { kind: 'charge' } | { kind: 'adjust'; line: Line } | { kind: 'waive'; line: Line } | { kind: 'reinstate'; line: Line };

/**
 * One room's month, and everything that can be done to it, where the room
 * already is: record a payment, add a charge, adjust or waive one. What used to
 * need the separate adjustments page with the tenant and charge picked again.
 */
@Component({
  selector: 'app-room-month-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DialogComponent, ErrorCardComponent, FieldErrorComponent, LoadingStateComponent,
    FormFeedbackDirective, ReasonFieldComponent],
  template: `
    <app-dialog [title]="title()" [subtitle]="subtitle()" width="36rem" (closed)="closed.emit()">
      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading the month..." />
      } @else if (loadError()) {
        <p class="error-text">{{ loadError() }}</p>
      } @else if (detail(); as month) {
        @if (room().tenantId) {
          <a class="text-link tenant-link" [routerLink]="RoutePaths.tenantDetail(agencyId(), buildingId(), room().tenantId!)">Open {{ room().tenantName || 'tenant' }}'s profile</a>
        }
        <dl class="totals">
          <div><dt>Due</dt><dd>{{ kes(month.totalDue) }}</dd></div>
          <div><dt>Paid</dt><dd>{{ kes(month.totalPaid) }}</dd></div>
          <div><dt>Outstanding</dt><dd><strong>{{ kes(room().outstanding) }}</strong></dd></div>
        </dl>

        <!-- Billed is the line on the bill; still owed is what is left of it after payments and credit. -->
        <table class="table lines">
          <thead><tr><th>Item</th><th class="num">Billed</th><th class="num">Still owed</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr>
              <td>Rent</td>
              <td class="num">{{ kes(month.baseRent) }}</td>
              <td class="num">{{ rentBalance(month) }}</td>
              <td></td>
            </tr>
            @for (line of lines(); track $index) {
              <tr [class.line--waived]="line.waived">
                <td>{{ line.name }}</td>
                @if (line.waived) {
                  <td colspan="2"><span class="status-chip status-chip--neutral">Waived</span></td>
                } @else {
                  <td class="num">{{ kes(line.amount) }}</td>
                  <td class="num">{{ kes(line.outstanding) }}</td>
                }
                <td class="line-actions">
                  @if (line.chargeId && line.waived) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="startReinstate(line)">Reinstate</button>
                  } @else if (line.chargeId) {
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
              <app-reason-field [control]="chargeForm.controls.reason" [reasons]="chargeReasons" label="Reason (optional)" />
            </form>
          }
          @case ('adjust') {
            <form id="room-month-form" class="stack sub-form" [formGroup]="adjustForm" appFormFeedback (ngSubmit)="adjust()">
              <p class="sub-form__title">Adjust {{ activeLine()?.name }} <span class="muted">· now {{ kes(activeLine()?.amount) }}</span></p>
              <div class="grid-auto">
                <label class="field">
                  <span>New amount</span>
                  <input type="number" step="0.01" min="0" formControlName="newAmount">
                  <app-field-error [control]="adjustForm.controls.newAmount" label="New amount" />
                </label>
                <app-reason-field [control]="adjustForm.controls.reason" [reasons]="adjustReasons" />
              </div>
              <p class="muted small">The original amount stays in the bill's history.</p>
            </form>
          }
          @case ('reinstate') {
            <form id="room-month-form" class="stack sub-form" [formGroup]="reinstateForm" appFormFeedback (ngSubmit)="reinstate()">
              <p class="sub-form__title">Reinstate {{ activeLine()?.name }}</p>
              <p class="muted">Bills it again at the amount it had before it was waived. The waiver stays in the history.</p>
              <app-reason-field [control]="reinstateForm.controls.reason" [reasons]="reinstateReasons" />
            </form>
          }
          @case ('waive') {
            <form id="room-month-form" class="stack sub-form" [formGroup]="waiveForm" appFormFeedback (ngSubmit)="waive()">
              <p class="sub-form__title">Waive {{ activeLine()?.name }} <span class="muted">· {{ kes(activeLine()?.amount) }}</span></p>
              <p class="muted small">The line stays on the bill, struck through, and can be reinstated.</p>
              <app-reason-field [control]="waiveForm.controls.reason" [reasons]="waiveReasons" />
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
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: 0; }
    .totals div { display: grid; gap: var(--space-0-5); }
    .totals dt { font-size: var(--text-xs); color: var(--text-muted); }
    .totals dd { margin: 0; }
    .lines td, .lines th { padding: var(--space-2) var(--space-2); }
    .line-actions { white-space: nowrap; text-align: right; }
    .line-actions .btn + .btn { margin-left: var(--space-1); }
    .line--waived td:first-child { color: var(--text-muted); text-decoration: line-through; }
    .sub-form { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-2); }
    .sub-form__title { margin: 0; font-weight: var(--weight-bold); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .small { margin: 0; font-size: var(--text-sm); }
    .tenant-link { justify-self: start; font-size: var(--text-md); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomMonthDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  /** `YYYY-MM`. */
  readonly month = input.required<string>();
  readonly room = input.required<RoomPaymentStatus>();
  /** A room number is not unique across buildings, so the building is named beside it. */
  readonly buildingName = input<string | null>(null);

  readonly RoutePaths = RoutePaths;
  readonly waiveReasons = WAIVE_REASONS;
  readonly adjustReasons = ADJUST_REASONS;
  readonly reinstateReasons = REINSTATE_REASONS;
  readonly chargeReasons = CHARGE_REASONS;

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
  readonly reinstateForm = this.fb.group({ reason: ['', Validators.required] });

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
        outstanding: charge.outstanding ?? charge.balance ?? null,
        waived: charge.status === 'WAIVED'
      })),
      ...(month.otherCharges ?? []).map((charge) => ({
        chargeId: charge.chargeId ?? null,
        name: charge.name ?? 'Charge',
        amount: charge.amount ?? null,
        outstanding: charge.outstanding ?? null,
        waived: charge.status === 'WAIVED'
      }))
    ];
  });

  readonly activeLine = computed(() => {
    const mode = this.mode();
    return mode.kind === 'adjust' || mode.kind === 'waive' || mode.kind === 'reinstate' ? mode.line : null;
  });

  ngOnInit(): void {
    void this.load();
  }

  subtitle(): string {
    return [this.buildingName(), this.monthLabel()].filter(Boolean).join(' · ');
  }

  kes(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `KES ${parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-';
  }

  monthLabel(): string {
    const date = new Date(`${toMonthPath(this.month())}T00:00:00`);
    return Number.isNaN(date.getTime()) ? this.month() : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  rentBalance(month: ArrearsReportingDetail): string {
    const due = Number(month.baseRent ?? 0) + Number(month.lateFee ?? 0);
    const paid = Number(month.rentPaid ?? 0) + Number(month.creditApplied ?? 0);
    return Number.isFinite(due - paid) ? this.kes(Math.max(0, due - paid)) : '-';
  }

  submitLabel(): string {
    switch (this.mode().kind) {
      case 'charge': return 'Add charge';
      case 'adjust': return 'Save amount';
      case 'reinstate': return 'Reinstate';
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

  startReinstate(line: Line): void {
    this.actionError.set(null);
    this.reinstateForm.reset({ reason: '' });
    this.mode.set({ kind: 'reinstate', line });
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

  async reinstate(): Promise<void> {
    const line = this.activeLine();
    if (this.reinstateForm.invalid || !line?.chargeId) {
      this.reinstateForm.markAllAsTouched();
      return;
    }
    await this.run(() => firstValueFrom(this.rent.reinstateCharge(this.agencyId(), this.buildingId(), {
      chargeId: line.chargeId!,
      reason: this.reinstateForm.getRawValue().reason.trim()
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
