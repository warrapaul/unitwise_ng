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
            <input [value]="meter.meterNumber ?? ''" maxlength="100" (input)="patch(i, { meterNumber: $any($event.target).value })">
          </label>
          <label class="field">
            <span>Opening reading{{ meter.unit ? ' in ' + unit(meter.unit) : '' }} <span class="muted">(optional)</span></span>
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
  imports: [MeterFieldsComponent, SectionCardComponent, PermissionGateComponent, ErrorCardComponent],
  template: `
    @if (meters().length > 0) {
      <app-section-card title="Meters" subtitle="Their first bill starts from the opening reading.">
        <div class="stack">
          <app-meter-fields [(meters)]="meters" />
          @if (error(); as apiError) {
            <app-error-card title="Meters not saved" [message]="apiError.message" [details]="apiError.details" />
          }
          <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
            <div class="button-row">
              <button type="button" class="btn btn-primary btn-sm" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save meters' }}</button>
            </div>
          </app-permission-gate>
        </div>
      </app-section-card>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantMetersComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();

  private readonly rent = inject(RentService);
  private readonly toasts = inject(NotificationService);

  readonly meters = signal<TenantMeter[]>([]);
  readonly saving = signal(false);
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
      this.meters.set(await firstValueFrom(this.rent.saveTenantMeters(this.agencyId(), this.buildingId(), this.tenantId(), this.meters())));
      this.toasts.push('success', 'Meters saved.');
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
