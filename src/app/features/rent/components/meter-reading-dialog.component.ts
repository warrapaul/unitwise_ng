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
    <app-dialog [title]="task().chargeName || 'Meter reading'" [subtitle]="(task().roomName || '') + (task().tenantName ? ' · ' + task().tenantName : '')"
                (closed)="closed.emit()">
      <form id="meter-reading" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="grid-auto">
          <label class="field">
            <span>Previous reading</span>
            <input type="number" step="0.01" min="0" formControlName="previousReading">
          </label>
          <label class="field">
            <span>Current reading</span>
            <input type="number" step="0.01" min="0" formControlName="currentReading">
            <app-field-error [control]="form.controls.currentReading" label="Current reading" />
          </label>
        </div>
        @if (charge(); as figure) {
          <p class="muted">{{ figure }}</p>
        }
        @if (error(); as apiError) {
          <app-error-card title="Reading not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>

      <div dialog-actions>
        <button type="submit" form="meter-reading" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save reading' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeterReadingDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly task = input.required<PendingReadingTask>();

  readonly saved = output<void>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    previousReading: [null as number | null, [Validators.min(0)]],
    currentReading: [null as number | null, [Validators.required, Validators.min(0)]]
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** "3 m³ × 200 = 600" once both readings are in. */
  readonly charge = computed(() => {
    const { previousReading, currentReading } = this.values();
    const rate = Number(this.task().unitRate);
    if (currentReading === null || currentReading === undefined || previousReading === null || previousReading === undefined) {
      return null;
    }
    const used = Number(currentReading) - Number(previousReading);
    if (used < 0) {
      return 'The current reading is below the previous one.';
    }
    const unit = this.task().unit ? ` ${this.task().unit}` : '';
    return Number.isFinite(rate) && rate > 0 ? `${used}${unit} × ${rate} = ${Math.round(used * rate * 100) / 100}` : `${used}${unit} used`;
  });

  ngOnInit(): void {
    const previous = Number(this.task().previousReading);
    if (Number.isFinite(previous)) {
      this.form.controls.previousReading.setValue(previous);
    }
  }

  async save(): Promise<void> {
    const task = this.task();
    const value = this.form.getRawValue();
    if (this.form.invalid || !task.tenantId) {
      this.form.markAllAsTouched();
      return;
    }
    if (value.previousReading !== null && value.currentReading! < value.previousReading) {
      this.error.set({ message: 'The current reading is below the previous one.' } as ApiError);
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
          unit: task.unit ?? null
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
