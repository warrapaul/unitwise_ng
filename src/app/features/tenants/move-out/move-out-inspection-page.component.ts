import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { todayIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { RoutePaths } from '../../../core/routes/route-paths';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FileUploadComponent } from '../../../shared/components/files/file-upload/file-upload.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency } from '../../../shared/utils/format.util';
import { CONDITIONS, InspectionItem, InspectionPhoto, ItemCondition, MoveOutInspection, MoveOutService } from './move-out.service';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/**
 * Walking the room when a tenant leaves: the checklist (keys, meters, cleaning), each part of the
 * room with its condition, photos and what fixing it costs. Completed, the charges are offered as
 * deductions when the deposit is settled, and the figures show what goes back to the tenant.
 */
@Component({
  selector: 'app-move-out-inspection-page',
  standalone: true,
  imports: [FormFeedbackDirective, ReactiveFormsModule, RouterLink, DateDisplayDirective, MoneyInputDirective, ErrorStateComponent, FileUploadComponent,
    LoadingStateComponent, PermissionGateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <a class="text-link" [routerLink]="tenantLink()">← Back to the tenant</a>
      @if (loading() && !inspection()) {
        <app-loading-state label="Loading the inspection…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (inspection(); as i) {
        <div class="kpi-grid">
          <div class="kpi"><span class="kpi__label">Deposit held</span><span class="kpi__value">{{ money(i.depositHeld) }}</span>
            <span class="kpi__note">{{ i.depositId ? 'For this room' : 'No deposit recorded' }}</span></div>
          <div class="kpi" [class.kpi--bad]="charges() > 0"><span class="kpi__label">Charges</span><span class="kpi__value">{{ money(charges()) }}</span>
            <span class="kpi__note">From the items below</span></div>
          <div class="kpi" [class.kpi--bad]="+i.rentOwed > 0"><span class="kpi__label">Still owed</span><span class="kpi__value">{{ money(i.rentOwed) }}</span>
            <span class="kpi__note">All unpaid months</span></div>
          <div class="kpi" [class.kpi--good]="toReturn() > 0" [class.kpi--bad]="toReturn() < 0">
            <span class="kpi__label">{{ toReturn() < 0 ? 'They still owe' : 'To return' }}</span>
            <span class="kpi__value">{{ money(abs(toReturn())) }}</span><span class="kpi__note">Held, less charges and rent</span></div>
        </div>

        <form appFormFeedback [formGroup]="form" (ngSubmit)="save()" class="stack">
          <app-section-card title="Move-out inspection" [subtitle]="subtitle(i)">
            @if (locked()) {
              <app-permission-gate actions [permissions]="['TENANT_WRITE']">
                <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="reopen()">Reopen</button>
              </app-permission-gate>
            }
            <div class="pairs">
              <label class="field"><span>Inspected on</span>
                <input type="date" appDateDisplay formControlName="inspectedOn" [max]="today"></label>
            </div>
            <fieldset class="checks">
              <legend>Checklist</legend>
              <label><input type="checkbox" formControlName="keysReturned"> Keys and access cards returned</label>
              <label><input type="checkbox" formControlName="metersRead"> Final meter readings taken</label>
              <label><input type="checkbox" formControlName="roomCleaned"> Room left clean</label>
              <label><input type="checkbox" formControlName="tenantPresent"> Tenant was present</label>
            </fieldset>
          </app-section-card>

          <app-section-card title="The room" subtitle="Each part as you found it. A charge comes off the deposit.">
            <div class="items" formArrayName="items">
              @for (row of items.controls; track row; let n = $index) {
                <div class="item" [formGroupName]="n">
                  <div class="item__fields">
                    <label class="field"><span>Part of the room</span><input formControlName="area" maxlength="120"></label>
                    <label class="field"><span>Condition</span>
                      <select formControlName="condition">
                        @for (c of conditions; track c.value) { <option [value]="c.value">{{ c.label }}</option> }
                      </select></label>
                    <label class="field"><span>Charge <span class="muted">(optional)</span></span>
                      <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span>
                        <input appMoneyInput formControlName="charge" aria-label="Charge in KES"></span></label>
                    <label class="field field--note"><span>Note <span class="muted">(optional)</span></span><input formControlName="note" maxlength="500"></label>
                  </div>
                  <div class="item__photos">
                    @for (p of photosOf(n); track p.id) {
                      <span class="photo">
                        <a [href]="p.url" target="_blank" rel="noopener"><img [src]="p.url" [alt]="'Photo of ' + row.controls.area.value"></a>
                        @if (!locked()) {
                          <button type="button" class="photo__remove" [attr.aria-label]="'Remove photo'" (click)="removePhoto(n, p)">×</button>
                        }
                      </span>
                    }
                    @if (!locked()) {
                      @if (row.controls.id.value) {
                        @if (photosOf(n).length < 5) {
                          <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="picker.open()">Add photo</button>
                        }
                        <app-file-upload #picker variant="trigger" label="Photo" [types]="photoTypes" [maxSizeMb]="10" (fileChange)="addPhoto(n, $event, picker)" />
                      } @else {
                        <span class="muted small">Save to add photos</span>
                      }
                      <button type="button" class="btn btn-text btn-sm" (click)="removeItem(n)">Remove</button>
                    }
                  </div>
                </div>
              }
            </div>
            @if (!locked()) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="addItem()">Add a part of the room</button>
            }
            <label class="field notes"><span>Notes <span class="muted">(optional)</span></span>
              <textarea formControlName="notes" rows="2" maxlength="1000"></textarea></label>
          </app-section-card>

          <app-permission-gate [permissions]="['TENANT_WRITE']">
            <div class="button-row">
              @if (!locked()) {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="complete()">Complete inspection</button>
                <button type="submit" class="btn btn-secondary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save draft' }}</button>
              } @else {
                <a class="btn btn-primary" [routerLink]="tenantLink()" fragment="deposit">Settle the deposit</a>
              }
            </div>
          </app-permission-gate>
        </form>
      }
    </section>
  `,
  styles: [`
    .checks { border: 0; padding: 0; margin: var(--space-3) 0 0; display: grid; gap: var(--space-2); }
    .checks legend { font-weight: var(--weight-semibold); margin-bottom: var(--space-1); }
    .checks label { display: flex; gap: var(--space-2); align-items: center; min-height: 2.5rem; }
    .items { display: grid; gap: var(--space-3); margin-bottom: var(--space-3); }
    .item { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3); display: grid; gap: var(--space-2); }
    .item__fields { display: grid; gap: var(--space-2) var(--space-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); }
    .item__fields .field input, .item__fields .field select { max-width: none; }
    .item__photos { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .photo { position: relative; display: inline-block; }
    .photo img { width: 64px; height: 64px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); display: block; }
    .photo__remove { position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border);
      background: var(--card-bg); cursor: pointer; line-height: 1; }
    .notes textarea { max-width: none; }
    .small { font-size: var(--text-xs); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoveOutInspectionPageComponent implements HasUnsavedChanges {
  /** Route parameters. */
  readonly agencyId = input.required<string>();
  readonly buildingId = input.required<string>();
  readonly tenantId = input.required<string>();

  private readonly moveOut = inject(MoveOutService);
  private readonly toasts = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly conditions = CONDITIONS;
  readonly photoTypes = PHOTO_TYPES;
  readonly today = todayIso();
  readonly inspection = signal<MoveOutInspection | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly form = this.fb.group({
    inspectedOn: ['', Validators.required],
    keysReturned: false,
    metersRead: false,
    roomCleaned: false,
    tenantPresent: false,
    notes: '',
    items: this.fb.array<ReturnType<MoveOutInspectionPageComponent['itemGroup']>>([])
  });

  get items(): FormArray<ReturnType<MoveOutInspectionPageComponent['itemGroup']>> {
    return this.form.controls.items;
  }

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly charges = computed(() => (this.values().items ?? []).reduce((sum, item) => sum + (Number(item?.charge) || 0), 0));
  readonly toReturn = computed(() => {
    const i = this.inspection();
    return i ? Math.round((Number(i.depositHeld) - this.charges() - Number(i.rentOwed)) * 100) / 100 : 0;
  });
  readonly locked = computed(() => this.inspection()?.status === 'COMPLETED');
  readonly tenantLink = computed(() => RoutePaths.tenantDetail(this.agencyId(), this.buildingId(), this.tenantId()));
  private ids(): [number, number, number] {
    return [Number(this.agencyId()), Number(this.buildingId()), Number(this.tenantId())];
  }

  constructor() {
    effect(() => {
      this.tenantId();
      untracked(() => void this.load());
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.locked();
  }

  itemGroup(item?: InspectionItem) {
    return this.fb.group({
      id: [item?.id ?? null as number | null],
      area: [item?.area ?? '', [Validators.required, Validators.maxLength(120)]],
      condition: [(item?.condition ?? 'GOOD') as ItemCondition],
      charge: [item?.charge === null || item?.charge === undefined ? null : Number(item.charge) as number | null, [Validators.min(0)]],
      note: [item?.note ?? '']
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.apply(await firstValueFrom(this.moveOut.get(...this.ids())));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private apply(i: MoveOutInspection): void {
    this.inspection.set(i);
    this.items.clear({ emitEvent: false });
    for (const item of i.items) {
      this.items.push(this.itemGroup(item), { emitEvent: false });
    }
    this.form.patchValue({
      inspectedOn: i.inspectedOn, keysReturned: i.keysReturned, metersRead: i.metersRead, roomCleaned: i.roomCleaned,
      tenantPresent: i.tenantPresent, notes: i.notes ?? ''
    });
    if (i.status === 'COMPLETED') {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
    this.form.markAsPristine();
  }

  addItem(): void {
    this.items.push(this.itemGroup());
    this.form.markAsDirty();
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  photosOf(index: number): InspectionPhoto[] {
    const id = this.items.at(index)?.controls.id.value;
    return this.inspection()?.items.find((item) => item.id === id)?.photos ?? [];
  }

  async save(quiet = false): Promise<boolean> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toasts.push('error', 'Give each item the part of the room it is about.');
      return false;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      this.apply(await firstValueFrom(this.moveOut.save(...this.ids(), {
        inspectedOn: v.inspectedOn, keysReturned: v.keysReturned, metersRead: v.metersRead, roomCleaned: v.roomCleaned,
        tenantPresent: v.tenantPresent, notes: v.notes.trim() || null,
        items: v.items.map((item) => ({ id: item.id, area: item.area.trim(), condition: item.condition,
          note: item.note.trim() || null, charge: item.charge ? Number(item.charge) : null }))
      })));
      if (!quiet) {
        this.toasts.push('success', 'Inspection saved.');
      }
      return true;
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async complete(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Complete the inspection?',
      message: `Charges of ${this.money(this.charges())} will be offered as deductions when you settle the deposit. You can reopen it to make changes.`,
      confirmLabel: 'Complete'
    }) || !await this.save(true)) {
      return;
    }
    await this.run(async () => {
      this.apply(await firstValueFrom(this.moveOut.move(...this.ids(), 'complete')));
      this.toasts.push('success', 'Inspection completed. Settle the deposit from the tenant\'s page.');
    });
  }

  async reopen(): Promise<void> {
    await this.run(async () => this.apply(await firstValueFrom(this.moveOut.move(...this.ids(), 'reopen'))));
  }

  async addPhoto(index: number, file: File | null, picker: FileUploadComponent): Promise<void> {
    const itemId = this.items.at(index)?.controls.id.value;
    if (!file || !itemId) {
      return;
    }
    if (this.form.dirty && !await this.save(true)) {
      return;
    }
    await this.run(async () => {
      this.apply(await firstValueFrom(this.moveOut.addPhoto(...this.ids(), itemId, file)));
      picker.clear();
    });
  }

  async removePhoto(index: number, photo: InspectionPhoto): Promise<void> {
    const itemId = this.items.at(index)?.controls.id.value;
    if (!itemId || !await this.confirm.ask({ title: 'Remove this photo?', message: 'It is no longer kept as evidence.', confirmLabel: 'Remove', destructive: true })) {
      return;
    }
    await this.run(async () => this.apply(await firstValueFrom(this.moveOut.deletePhoto(...this.ids(), itemId, photo.id))));
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await work();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  subtitle(i: MoveOutInspection): string {
    const who = [i.tenantName, i.roomName ? `Room ${i.roomName}` : null].filter(Boolean).join(' · ');
    if (i.status === 'COMPLETED') {
      return `${who} · completed ${displayDateTime(i.completedAt)}${i.inspectedByName ? ' by ' + i.inspectedByName : ''}`;
    }
    return i.id ? `${who} · draft` : `${who} · not saved yet`;
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
