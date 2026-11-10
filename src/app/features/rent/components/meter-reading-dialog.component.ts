import { ConfirmService } from '../../../shared/services/confirm.service';
import { MONEY_LOCALE, formatCurrency, formatRate, roomTitle, unitLabel, monthLabel } from '../../../shared/utils/format.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { PendingReadingTask } from '../models/rent.models';
import { RentService } from '../rent.service';

/** One pending meter reading: the new figure in, the charge worked out as it is typed. */
@Component({
  selector: 'app-meter-reading-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <app-dialog [title]="task().chargeName || 'Meter reading'" [subtitle]="roomTitle(task().roomName) + (task().tenantName ? ' · ' + task().tenantName : '')"
                (closed)="close()">
      <form id="meter-reading" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="grid-auto">
          <label class="field">
            <span>Previous reading</span>
            <!-- Carried from the last reading, so only a first reading can set it. -->
            <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="previousReading" [readOnly]="carried()">
            @if (carried()) { <small class="hint">{{ task().previousReadMonth ? 'Last read for ' + lastRead() : 'Opening reading.' }}</small> }
            @else { <small class="hint">First reading: where the meter started.</small> }
          </label>
          <label class="field">
            <span>Current reading</span>
            <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="currentReading">
            <app-field-error [control]="form.controls.currentReading" label="Current reading" />
          </label>
        </div>
        <label class="field">
          <span>Note</span>
          <textarea formControlName="notes" rows="2" maxlength="500"></textarea>
        </label>
        <!-- How the charge comes out, step by step, so the figure can be checked before it is saved. -->
        @if (breakdown(); as b) {
          @if (b.below) {
            <p class="error-text" role="alert">The current reading is below the previous one ({{ b.previous }}). Check the meter, or record a meter reset as a rent adjustment.</p>
          } @else {
            <dl class="workings">
              <div><dt>Used</dt><dd>{{ b.used }}{{ unitSuffix() }}</dd></div>
              @if (b.rate !== null) {
                <div><dt>Rate</dt><dd>{{ b.rate }}</dd></div>
                <div><dt>Charge</dt><dd><strong>{{ b.charge }}</strong></dd></div>
              }
            </dl>
          }
        }
        @if (error(); as apiError) {
          <app-error-card title="Reading not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>

      <div dialog-actions>
        <button type="submit" form="meter-reading" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Recording...' : 'Record reading' }}</button>
        <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .workings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-1-5) var(--space-4); margin: 0; padding: var(--space-2-5) var(--space-3);
                border-radius: var(--radius-sm); background: var(--surface-2); }
    .workings div { display: grid; gap: var(--space-0-5); }
    .workings dt { font-size: var(--text-xs); color: var(--text-muted); }
    .workings dd { margin: 0; font-variant-numeric: tabular-nums; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeterReadingDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly task = input.required<PendingReadingTask>();

  readonly saved = output<void>();
  readonly roomTitle = roomTitle;
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);
  private readonly confirmDialog = inject(ConfirmService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    previousReading: [null as number | null, [Validators.min(0)]],
    currentReading: [null as number | null, [Validators.required, Validators.min(0)]],
    notes: ''
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly unitSuffix = computed(() => this.task().unit ? ` ${unitLabel(this.task().unit)}` : '');
  readonly lastRead = computed(() => monthLabel(this.task().previousReadMonth));
  readonly carried = computed(() => {
    const previous = this.task().previousReading;
    return previous !== null && previous !== undefined;
  });

  /** Used × rate = charge once both readings are in; `below` when the meter went backwards. */
  readonly breakdown = computed(() => {
    const { previousReading, currentReading } = this.values();
    if (currentReading === null || currentReading === undefined || previousReading === null || previousReading === undefined) {
      return null;
    }
    const used = Math.round((Number(currentReading) - Number(previousReading)) * 100) / 100;
    const rate = Number(this.task().unitRate);
    const hasRate = Number.isFinite(rate) && rate > 0;
    return {
      below: used < 0,
      previous: previousReading,
      used,
      rate: hasRate ? formatRate(rate, this.task().unit) : null,
      charge: hasRate ? formatCurrency(Math.round(used * rate * 100) / 100) : null
    };
  });

  ngOnInit(): void {
    // None on a first reading: leave it empty rather than showing 0.
    const raw = this.task().previousReading;
    const previous = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(previous)) {
      this.form.controls.previousReading.setValue(previous);
    }
  }

  /** A sheet closes on one stray tap outside it, so edits are not thrown away unasked. */
  async close(): Promise<void> {
    if (!this.form.dirty || await this.confirmDialog.ask({
      title: 'Discard this reading?',
      message: 'What you entered here will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing'
    })) {
      this.closed.emit();
    }
  }

  async save(): Promise<void> {
    const task = this.task();
    const value = this.form.getRawValue();
    if (this.form.invalid || !task.tenantId) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.breakdown()?.below) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.rent.submitMeterReadings(this.agencyId(), this.buildingId(), {
        perTenantReadings: [{
          tenantId: task.tenantId,
          coversMonth: task.coversMonth ?? null,
          chargeName: task.chargeName ?? null,
          billingTiming: task.billingTiming ?? null,
          previousReading: value.previousReading,
          currentReading: value.currentReading,
          unitRate: task.unitRate !== null && task.unitRate !== undefined ? Number(task.unitRate) : null,
          unit: task.unit ?? null,
          notes: value.notes.trim() || null
        }]
      }));
      this.saved.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
