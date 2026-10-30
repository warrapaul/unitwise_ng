import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS } from '../../../shared/components/address-fields/address-fields.component';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { ADDRESS_CHECK_OUTCOME_LABELS, ADDRESS_CHECK_TYPE_LABELS, AddressCheckOutcome, AddressCheckType, DeliveryAddressDetail,
  DeliveryAddressUpsertRequest } from '../models/commerce.models';
import { EcommerceService } from '../ecommerce.service';

/**
 * Staff (an admin, or a rider at the door) adding or correcting one of a
 * customer's delivery addresses — the place, the line, the landmark and, most
 * usefully, the map pin from where they are standing.
 */
@Component({
  selector: 'app-customer-address-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective,
    AddressFieldsComponent, CoordinateFieldComponent],
  template: `
    <app-dialog [title]="address() ? 'Edit address' : 'Add address'"
                [subtitle]="address() ? null : 'Saved to the customer\\'s addresses for them to confirm.'"
                width="48rem" (closed)="closed.emit()">
      <form id="customer-address" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <!--
          Customer address: what the customer gave, visible to them. Editing an existing one opens on
          a compact summary — the rider's usual job is one correction, not re-entering everything.
        -->
        <fieldset class="section section--first">
          <legend>Customer address <span class="muted">(the customer sees these)</span></legend>
          @if (address() && !editingCustomer()) {
            @let a = address()!;
            <dl class="summary">
              @if (a.addressNickname) { <div><dt>Nickname</dt><dd>{{ a.addressNickname }}</dd></div> }
              <div><dt>Place</dt><dd>{{ placeLine(a) || '—' }}</dd></div>
              @if (a.address?.buildingHouse || a.unitNumber) {
                <div><dt>Building / unit</dt><dd>{{ [a.address?.buildingHouse, a.unitNumber].filter(present).join(', ') }}</dd></div>
              }
              @if (a.landmark) { <div><dt>Landmark</dt><dd>{{ a.landmark }}</dd></div> }
              <div><dt>Contact phone</dt><dd class="mono">{{ a.contactPhone || '—' }}</dd></div>
              @if (a.deliveryNote) { <div><dt>Customer's delivery note</dt><dd>{{ a.deliveryNote }}</dd></div> }
              <div><dt>Pin</dt><dd>{{ a.latitude != null ? 'Set' : 'Not set' }}</dd></div>
            </dl>
            <button type="button" class="btn btn-secondary btn-sm" (click)="editingCustomer.set(true)">Correct customer details</button>
          } @else {
            <label class="field">
              <span>Nickname <span class="muted">(optional)</span></span>
              <input formControlName="addressNickname" placeholder="Home">
            </label>
            <app-address-fields [group]="form.controls.place">
              <label class="field" before-building>
                <span>Landmark <span class="muted">(optional)</span></span>
                <input formControlName="landmark" placeholder="e.g. Opposite St. Mary's school">
              </label>
            </app-address-fields>
            @if (placeMissing()) { <p class="error-text" role="alert">Choose at least the county.</p> }
            <div class="form-grid">
              <label class="field">
                <span>Contact phone</span>
                <input formControlName="contactPhone" inputmode="tel" placeholder="0712 345 678">
                <app-field-error [control]="form.controls.contactPhone" label="Contact phone" />
              </label>
              <label class="field">
                <span>House or unit number <span class="muted">(optional)</span></span>
                <input formControlName="unitNumber">
              </label>
            </div>
            <label class="field">
              <span>Customer's delivery note <span class="muted">(optional)</span></span>
              <textarea formControlName="deliveryNote" rows="2"></textarea>
            </label>
            <!-- At the door, the pin is the most useful thing a rider can add. -->
            <app-coordinate-field
              [latitude]="form.controls.latitude.value"
              [longitude]="form.controls.longitude.value"
              legend="Location (optional)"
              (changed)="onCoordinates($event)"
            />
            <label class="checkbox-field">
              <input type="checkbox" formControlName="isDefault">
              <span>Default address</span>
            </label>
          }
        </fieldset>

        @if (address(); as current) {
          <!-- The known building: a separate record. Linking never rewrites what the customer wrote. -->
          <fieldset class="section">
            <legend>Known delivery building</legend>
            @if (current.geo?.building; as building) {
              <p class="building">
                <strong>{{ building.name }}</strong>
                @if (building.code) { <span class="mono muted"> · {{ building.code }}</span> }
                @if (building.description) { <br><span class="muted">{{ building.description }}</span> }
              </p>
              <div class="button-row">
                <button type="button" class="btn btn-secondary btn-sm" (click)="chooseBuilding.emit(current)">Change</button>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="unlink(current)">Unlink</button>
              </div>
            } @else {
              <p class="muted">
                No known building linked.
                @if (current.geo?.nearestBuilding; as near) {
                  Nearest mapped: <strong>{{ near.name }}</strong>@if (near.distanceMeters != null) { , {{ near.distanceMeters }} m from the pin }.
                }
              </p>
              <button type="button" class="btn btn-secondary btn-sm justify-start" (click)="chooseBuilding.emit(current)">Link a building</button>
            }
          </fieldset>

          <fieldset class="section">
            <legend>Rider-only details <span class="muted">(never shown to the customer)</span></legend>
            <div class="form-grid">
              <label class="field"><span>Floor</span><input formControlName="floorNumber" placeholder="e.g. 3 or Ground"></label>
              <label class="field"><span>Room or door</span><input formControlName="roomNumber" placeholder="e.g. B12"></label>
            </div>
            <label class="field">
              <span>Notes for the next rider</span>
              <textarea formControlName="riderNotes" rows="2" placeholder="e.g. Blue door at the end of the corridor. Call on arrival."></textarea>
            </label>
          </fieldset>

          <!-- Verification is its own act, attributed and recorded; saving the form never implies it. -->
          <fieldset class="section">
            <legend>Verification</legend>
            @if (current.isVerified) {
              <p class="verified">✓ Verified{{ current.verifiedByName ? ' by ' + current.verifiedByName : '' }}{{ current.lastVerifiedAt ? ' · ' + when(current.lastVerifiedAt) : '' }}</p>
            } @else {
              <p class="muted">Not verified yet.</p>
            }
            @if (current.customerConfirmed === false) {
              <p class="muted">Waiting for the customer to confirm it.</p>
            }
            @if ((current.verifications ?? []).length > 0) {
              <ol class="checks">
                @for (check of current.verifications ?? []; track check.id) {
                  <li>
                    <strong>{{ outcomeLabels[check.outcome] }}</strong>
                    <span class="muted">{{ typeLabels[check.type] }} · {{ check.verifiedByName || 'Someone' }} · {{ when(check.verifiedAt) }}</span>
                    @if (check.note) { <span class="check__note">{{ check.note }}</span> }
                  </li>
                }
              </ol>
            }
            @if (canVerify()) {
              <div class="record-check compact-controls">
                <label><span>How</span>
                  <select [value]="checkType()" (change)="checkType.set($any($event.target).value)">
                    @for (type of checkTypes; track type) { <option [value]="type">{{ typeLabels[type] }}</option> }
                  </select>
                </label>
                <label><span>What you found</span>
                  <select [value]="checkOutcome()" (change)="checkOutcome.set($any($event.target).value)">
                    @for (outcome of checkOutcomes; track outcome) { <option [value]="outcome">{{ outcomeLabels[outcome] }}</option> }
                  </select>
                </label>
                <label class="record-check__note"><span>Note (optional)</span>
                  <input [value]="checkNote()" (input)="checkNote.set($any($event.target).value)" maxlength="1000" placeholder="e.g. Gate moved to the side road">
                </label>
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="recordCheck(current)">Record check</button>
              </div>
            }
          </fieldset>
        }

        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="customer-address" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Saving...' : 'Save address' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .section { display: grid; gap: var(--space-3); margin: 0; padding: var(--space-3) 0 0; border: 0; border-top: 1px solid var(--border); min-width: 0; }
    .section--first { padding-top: 0; border-top: 0; }
    .summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--space-2) var(--space-4); margin: 0; }
    .summary div { display: grid; gap: var(--space-0-5); min-width: 0; }
    .summary dt { font-size: var(--font-label); color: var(--text-muted); }
    .summary dd { margin: 0; font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
    .building { margin: 0; }
    .justify-start { justify-self: start; }
    .checks { display: grid; gap: var(--space-2); margin: 0; padding-left: var(--space-4); }
    .checks li { display: grid; gap: var(--space-0-5); }
    .check__note { font-size: var(--font-description); }
    .record-check { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-3); }
    .record-check label { display: grid; gap: var(--space-1); font-size: var(--font-label); color: var(--text-muted); }
    .record-check__note { flex: 1 1 14rem; }
    .record-check__note input { width: 100%; }
    .section legend { padding: 0; font-weight: var(--weight-bold); }
    .section p { margin: 0; }
    .verified { color: var(--success); font-weight: var(--weight-semibold); }
    .checkbox-field { display: flex; align-items: center; gap: var(--space-2); }
    .checkbox-field input { width: auto; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerAddressDialogComponent implements OnInit {
  readonly customerId = input.required<number>();
  /** Given: edit it. Absent: add a new one. */
  readonly addressInput = input<DeliveryAddressDetail | null>(null, { alias: 'address' });
  /** The address as it now stands: the parent's copy, or the one changed here since. */
  readonly address = computed(() => this.current() ?? this.addressInput());
  /** A change saved from inside the dialog (unlink, a check), for the parent's list. */
  readonly updated = output<DeliveryAddressDetail>();
  /** The customer's number — a new address's contact phone to start from. */
  readonly customerPhone = input<string | null>(null);

  private readonly context = inject(ActiveContextService);
  readonly canVerify = computed(() => this.context.can('DELIVERY_ADDRESS_VERIFY'));

  when(value: string): string {
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }

  readonly saved = output<DeliveryAddressDetail>();
  /** Link or change the known building: the parent opens its building chooser for this address. */
  readonly chooseBuilding = output<DeliveryAddressDetail>();

  readonly typeLabels = ADDRESS_CHECK_TYPE_LABELS;
  readonly outcomeLabels = ADDRESS_CHECK_OUTCOME_LABELS;
  readonly checkTypes = Object.keys(ADDRESS_CHECK_TYPE_LABELS) as AddressCheckType[];
  readonly checkOutcomes = Object.keys(ADDRESS_CHECK_OUTCOME_LABELS) as AddressCheckOutcome[];
  readonly checkType = signal<AddressCheckType>('FIELD_VISIT');
  readonly checkOutcome = signal<AddressCheckOutcome>('CONFIRMED');
  readonly checkNote = signal('');
  /** The customer's fields, opened from the summary when something needs correcting. */
  readonly editingCustomer = signal(false);
  readonly busy = signal(false);
  /** Changes made here (unlink, a check) shown at once, ahead of the parent's copy. */
  private readonly current = signal<DeliveryAddressDetail | null>(null);
  readonly present = (value: string | null | undefined) => !!value && value.trim() !== '';
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    addressNickname: '',
    // Kept for addresses saved with one; no longer asked for.
    addressLine1: ['', [Validators.maxLength(255)]],
    landmark: '',
    contactPhone: ['', [Validators.required]],
    deliveryNote: '',
    unitNumber: '',
    isDefault: false,
    floorNumber: ['', [Validators.maxLength(20)]],
    roomNumber: ['', [Validators.maxLength(30)]],
    riderNotes: ['', [Validators.maxLength(2000)]],
    latitude: [null as number | null],
    longitude: [null as number | null],
    place: this.fb.group({ ...ADDRESS_FIELD_CONTROLS })
  });

  ngOnInit(): void {
    const address = this.address();
    if (!address) {
      this.form.controls.contactPhone.setValue(this.customerPhone() ?? '');
      return;
    }
    this.form.patchValue({
      addressNickname: address.addressNickname ?? '',
      addressLine1: address.addressLine1 ?? '',
      landmark: address.landmark ?? '',
      contactPhone: address.contactPhone ?? '',
      deliveryNote: address.deliveryNote ?? '',
      unitNumber: address.unitNumber ?? '',
      isDefault: address.isDefault ?? false,
      floorNumber: address.door?.floorNumber ?? '',
      roomNumber: address.door?.roomNumber ?? '',
      riderNotes: address.door?.riderNotes ?? '',
      latitude: address.latitude === null || address.latitude === undefined ? null : Number(address.latitude),
      longitude: address.longitude === null || address.longitude === undefined ? null : Number(address.longitude),
      // Coarse to fine, with events on: the place picker follows each level.
      place: {
        countyId: address.address?.countyId ?? null,
        subCountyId: address.address?.subCountyId ?? null,
        wardId: address.address?.wardId ?? null,
        townId: address.address?.townId ?? null,
        estateAreaId: address.address?.estateAreaId ?? null,
        streetRoadId: address.address?.streetRoadId ?? null,
        buildingHouse: address.address?.buildingHouse ?? ''
      }
    });
  }

  placeLine(address: DeliveryAddressDetail): string {
    const a = address.address;
    return a ? [a.county, a.subCounty, a.ward, a.town, a.estateArea, a.streetRoad].filter(this.present).join(' → ') : (address.addressLine1 ?? '');
  }

  async unlink(address: DeliveryAddressDetail): Promise<void> {
    await this.run(() => this.ecommerce.unlinkEcomCustomerAddressBuilding(this.customerId(), address.id));
  }

  /** A check is recorded on its own, attributed to whoever is signed in; the form is not saved with it. */
  async recordCheck(address: DeliveryAddressDetail): Promise<void> {
    await this.run(() => this.ecommerce.verifyEcomCustomerAddress(this.customerId(), address.id, {
      type: this.checkType(), outcome: this.checkOutcome(), note: this.checkNote().trim() || null
    }));
    this.checkNote.set('');
  }

  private async run(call: () => ReturnType<EcommerceService['unlinkEcomCustomerAddressBuilding']>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(call());
      this.current.set(updated);
      this.updated.emit(updated);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  onCoordinates(point: Coordinates | null): void {
    this.form.patchValue({ latitude: point?.latitude ?? null, longitude: point?.longitude ?? null });
  }

  readonly placeMissing = signal(false);

  async save(): Promise<void> {
    this.placeMissing.set(!this.form.controls.place.getRawValue().countyId && !this.form.controls.addressLine1.value.trim());
    if (this.form.invalid || this.placeMissing()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const place = value.place;
    const request: DeliveryAddressUpsertRequest = {
      addressNickname: value.addressNickname.trim() || null,
      addressLine1: value.addressLine1.trim() || null,
      landmark: value.landmark.trim() || null,
      contactPhone: value.contactPhone.trim(),
      deliveryNote: value.deliveryNote.trim() || null,
      // On an edit, '' clears it; null would leave it as it was.
      unitNumber: value.unitNumber.trim() || (this.address() ? '' : null),
      isDefault: value.isDefault,
      latitude: value.latitude,
      longitude: value.longitude,
      address: place.countyId ? {
        countyId: place.countyId,
        subCountyId: place.subCountyId,
        wardId: place.wardId,
        townId: place.townId,
        estateAreaId: place.estateAreaId,
        streetRoadId: place.streetRoadId,
        buildingHouse: place.buildingHouse.trim() || null
      } : null
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.address();
      let saved = await firstValueFrom(existing
        ? this.ecommerce.updateEcomCustomerAddress(this.customerId(), existing.id, request)
        : this.ecommerce.addEcomCustomerAddress(this.customerId(), request));
      if (existing) {
        // Door details and verification have their own endpoints; sent only when something changed.
        const door = existing.door;
        if ((door?.floorNumber ?? '') !== value.floorNumber.trim() || (door?.roomNumber ?? '') !== value.roomNumber.trim()
            || (door?.riderNotes ?? '') !== value.riderNotes.trim()) {
          saved = await firstValueFrom(this.ecommerce.saveEcomCustomerAddressDoor(this.customerId(), existing.id, {
            floorNumber: value.floorNumber.trim(), roomNumber: value.roomNumber.trim(), riderNotes: value.riderNotes.trim()
          }));
        }
      }
      this.saved.emit(saved);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
