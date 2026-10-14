import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { DoorDetails, DoorDetailsRequest } from '../models/geo.models';

/** What the caller does with the details; a rejection is shown in the dialog. */
export type DoorDetailsSaveFn = (request: DoorDetailsRequest) => Promise<void>;

/**
 * A rider at the door writes down what the next rider will need: the floor,
 * the room, and anything else ("blue door at the end, call on arrival").
 * Staff only — the customer never sees these. The building is chosen in its
 * own picker; this shows which one is linked and offers to change it.
 */
@Component({
  selector: 'app-door-details-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent],
  template: `
    <app-dialog title="Door details" subtitle="For riders only. The customer does not see these." width="34rem" (closed)="closed.emit()">
      <form id="door-details" class="stack" [formGroup]="form" (ngSubmit)="submit()">
        <div class="building">
          <span class="muted">Building</span>
          <strong>{{ buildingName() || 'Not linked' }}</strong>
          <button type="button" class="btn btn-secondary btn-sm" (click)="chooseBuilding.emit()">
            {{ buildingName() ? 'Change' : 'Choose building' }}
          </button>
        </div>
        <div class="form-grid">
          <label class="field"><span>Floor</span><input formControlName="floorNumber" placeholder="e.g. 3 or Ground"></label>
          <label class="field"><span>Room or door</span><input formControlName="roomNumber" placeholder="e.g. B12"></label>
        </div>
        <label class="field">
          <span>Notes for the next rider</span>
          <textarea formControlName="riderNotes" rows="4"
                    placeholder="e.g. Blue door at the end of the corridor. Call on arrival; the gate is locked after 9pm."></textarea>
        </label>
        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="door-details" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .building { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DoorDetailsDialogComponent implements OnInit {
  readonly door = input<DoorDetails | null | undefined>(null);
  readonly buildingName = input<string | null | undefined>(null);
  readonly save = input.required<DoorDetailsSaveFn>();
  readonly saved = output<void>();
  readonly closed = output<void>();
  /** The caller opens the building picker. */
  readonly chooseBuilding = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    floorNumber: ['', [Validators.maxLength(20)]],
    roomNumber: ['', [Validators.maxLength(30)]],
    riderNotes: ['', [Validators.maxLength(2000)]]
  });

  ngOnInit(): void {
    const d = this.door();
    this.form.reset({ floorNumber: d?.floorNumber ?? '', roomNumber: d?.roomNumber ?? '', riderNotes: d?.riderNotes ?? '' });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      // Empty strings clear what was there.
      await this.save()({ floorNumber: v.floorNumber.trim(), roomNumber: v.roomNumber.trim(), riderNotes: v.riderNotes.trim() });
      this.saved.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
