import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { NotificationService } from '../../../core/services/notification.service';
import { toApiError } from '../../../shared/utils/error-message.util';
import { AddressDefaultsService } from '../../addresses/address-defaults.service';

/**
 * Where every new address starts. A business serving one county — often one ward — sets it here
 * once, and customers and staff no longer pick the same three levels on every address.
 */
@Component({
  selector: 'app-address-defaults-page',
  standalone: true,
  imports: [ReactiveFormsModule, EntityPickerComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-section-card title="Address defaults"
                        subtitle="New addresses open with these already chosen. Anyone filling an address can still change them.">
        <form class="stack" [formGroup]="form" (ngSubmit)="save()">
          <div class="form-grid">
            <label class="field">
              <span>County</span>
              <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="No default" />
            </label>
            @if (form.controls.countyId.value; as county) {
              <label class="field">
                <span>Sub-county</span>
                <app-entity-picker [config]="pickers.subCountiesIn(county)" formControlName="subCountyId" placeholder="No default" />
              </label>
            }
            @if (form.controls.subCountyId.value; as subCounty) {
              <label class="field">
                <span>Ward</span>
                <app-entity-picker [config]="pickers.wardsIn(subCounty, form.controls.countyId.value)" formControlName="wardId" placeholder="No default" />
              </label>
            }
          </div>
          <p class="hint">Leave a level empty to have people choose it themselves. Clearing the county clears the rest.</p>
          @if (error(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save defaults' }}</button>
          </div>
        </form>
      </app-section-card>
    </section>
  `,
  styles: [`p { margin: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressDefaultsPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  private readonly defaults = inject(AddressDefaultsService);
  private readonly toasts = inject(NotificationService);

  readonly form = inject(NonNullableFormBuilder).group({
    countyId: null as number | null,
    subCountyId: null as number | null,
    wardId: null as number | null
  });
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const d = await firstValueFrom(this.defaults.get());
    this.form.reset({ countyId: d.countyId ?? null, subCountyId: d.subCountyId ?? null, wardId: d.wardId ?? null });
    // A different county or sub-county makes the levels below it meaningless.
    this.form.controls.countyId.valueChanges.subscribe(() => this.form.patchValue({ subCountyId: null, wardId: null }, { emitEvent: false }));
    this.form.controls.subCountyId.valueChanges.subscribe(() => this.form.patchValue({ wardId: null }, { emitEvent: false }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.defaults.save(this.form.getRawValue()));
      this.toasts.push('success', 'Address defaults saved.');
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
