import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ChangeDetectionStrategy, Component, effect, inject, input, model, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { unitLabel } from '../../../shared/utils/format.util';
import { TenantMeter } from '../models/rent.models';
import { RentService } from '../rent.service';

/** One line per metered charge: which meter it is and where it stood at move-in. */
@Component({
  selector: 'app-meter-fields',
  standalone: true,
  template: `
    <div class="meters">
      @for (meter of meters(); track meter.chargeName; let i = $index) {
        <fieldset class="meter">
          <legend>{{ meter.chargeName }}</legend>
          <label class="field">
            <span>Meter number <span class="muted">(optional)</span></span>
            <input [value]="meter.meterNumber ?? ''" maxlength="100" autocapitalize="characters" (input)="patch(i, { meterNumber: $any($event.target).value })">
          </label>
          <label class="field">
            <span>Reading at move-in{{ meter.unit ? ' (' + unit(meter.unit) + ')' : '' }} <span class="muted">(optional)</span></span>
            <input type="number" inputmode="decimal" min="0" step="0.01" [value]="meter.openingReading ?? ''"
                   (input)="patch(i, { openingReading: reading($any($event.target).value) })">
          </label>
        </fieldset>
      }
    </div>
  `,
  styles: [`
    .meters { display: grid; gap: var(--space-3); }
    .meter { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr)); gap: var(--space-3); margin: 0; padding: 0; border: 0; }
    .meter legend { padding: 0; margin-bottom: var(--space-1); font-weight: var(--weight-semibold); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeterFieldsComponent {
  readonly meters = model.required<TenantMeter[]>();

  patch(index: number, change: Partial<TenantMeter>): void {
    this.meters.update((rows) => rows.map((row, i) => i === index ? { ...row, ...change } : row));
  }

  reading(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  unit(value: string): string {
    return unitLabel(value);
  }
}

/** A tenant's meters on their page. Nothing shows for a room with no metered charge. */
@Component({
  selector: 'app-tenant-meters',
  standalone: true,
  imports: [MeterFieldsComponent, SectionCardComponent, PermissionGateComponent, ErrorCardComponent, DialogComponent],
  template: `
    @if (meters().length > 0) {
      <!-- Read at a glance; edited in a sheet, since it is set once at move-in and rarely after. -->
      <app-section-card title="Meters">
        <ng-container actions>
          <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
            <button type="button" class="btn btn-secondary btn-sm" (click)="openEditor()">Edit meters</button>
          </app-permission-gate>
        </ng-container>
        <ul class="meter-list">
          @for (meter of meters(); track meter.chargeName) {
            <li>
              <strong>{{ meter.chargeName }}</strong>
              <span class="muted">{{ meter.meterNumber ? 'Meter ' + meter.meterNumber : 'No meter number' }}</span>
              @if (meter.openingReading != null) {
                <span>Started at {{ meter.openingReading }}{{ meter.unit ? ' ' + unit(meter.unit) : '' }}</span>
              } @else {
                <span class="meter-warn" role="status">⚠ No reading at move-in: their first {{ meter.chargeName.toLowerCase() }} bill has nothing to start from.</span>
              }
            </li>
          }
        </ul>
      </app-section-card>
    }

    @if (editing()) {
      <app-dialog title="Meters" subtitle="The number stays with the room; the reading is where it stood when they moved in." (closed)="editing.set(false)">
        <app-meter-fields [(meters)]="draft" />
        @if (error(); as apiError) {
          <app-error-card title="Meters not saved" [message]="apiError.message" [details]="apiError.details" />
        }
        <div dialog-actions>
          <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save meters' }}</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .meter-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
    .meter-list li { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); align-items: baseline; }
    .meter-warn { color: var(--warning-text, var(--warning)); font-size: var(--text-sm); flex-basis: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantMetersComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();

  private readonly rent = inject(RentService);
  private readonly toasts = inject(NotificationService);

  readonly meters = signal<TenantMeter[]>([]);
  /** The sheet's copy: Cancel leaves the saved meters as they were. */
  readonly draft = signal<TenantMeter[]>([]);
  readonly editing = signal(false);
  readonly saving = signal(false);

  openEditor(): void {
    this.draft.set(this.meters().map((meter) => ({ ...meter })));
    this.error.set(null);
    this.editing.set(true);
  }

  unit(value: string): string {
    return unitLabel(value);
  }
  readonly error = signal<ApiError | null>(null);

  constructor() {
    effect(() => {
      const [agencyId, buildingId, tenantId] = [this.agencyId(), this.buildingId(), this.tenantId()];
      untracked(() => void this.load(agencyId, buildingId, tenantId));
    });
  }

  private async load(agencyId: number, buildingId: number, tenantId: number): Promise<void> {
    try {
      this.meters.set(await firstValueFrom(this.rent.getTenantMeters(agencyId, buildingId, tenantId)));
    } catch {
      // Not every viewer may read rent records; the card just stays away.
      this.meters.set([]);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      this.meters.set(await firstValueFrom(this.rent.saveTenantMeters(this.agencyId(), this.buildingId(), this.tenantId(), this.draft())));
      this.editing.set(false);
      this.toasts.push('success', 'Meters saved.');
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
