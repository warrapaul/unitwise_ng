import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { BuildingContact, BuildingContactType } from '../models/housing.models';
import { HousingService } from '../housing.service';

const TYPE_LABELS: Record<BuildingContactType, string> = {
  CARETAKER: 'Caretaker',
  BUILDING_MANAGER: 'Building manager',
  SECURITY: 'Security',
  MAINTENANCE: 'Maintenance',
  FIRE: 'Fire service',
  AMBULANCE: 'Ambulance',
  POLICE: 'Police',
  OTHER: 'Other'
};

/**
 * The contacts this building's tenants see under "Who to call": the owner
 * decides who is listed, on which channels (call, WhatsApp, email) and when
 * they answer. Nothing is added automatically from staff accounts.
 */
@Component({
  selector: 'app-building-contacts',
  standalone: true,
  imports: [ReactiveFormsModule, SectionCardComponent, PermissionGateComponent, DialogComponent, ErrorCardComponent,
    FieldErrorComponent, FormFeedbackDirective],
  template: `
    <app-section-card title="Contacts for tenants" subtitle="Shown to this building's tenants under “Who to call”.">
      <ng-container actions>
        <app-permission-gate [permissions]="['BUILDING_UPDATE']">
          <button type="button" class="btn btn-primary btn-sm" (click)="open(null)">Add contact</button>
        </app-permission-gate>
      </ng-container>

      @if (loadError()) {
        <p class="error-text">{{ loadError() }}</p>
      } @else if (contacts().length === 0) {
        <p class="muted">None yet. Add the caretaker and an emergency number so tenants know who to reach.</p>
      } @else {
        <div class="table-scroll">
          <table class="table table--packed">
            <thead><tr><th>Contact</th><th>Call</th><th>WhatsApp</th><th>Email</th><th>Hours</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              @for (contact of contacts(); track contact.id) {
                <tr>
                  <td>
                    <div class="cell-stack">
                      <strong>{{ contact.name }}</strong>
                      <span class="muted">{{ label(contact.type) }}@if (contact.notes) { · {{ contact.notes }} }</span>
                    </div>
                  </td>
                  <td class="mono">{{ contact.phone || '-' }}</td>
                  <td class="mono">{{ contact.whatsapp || '-' }}</td>
                  <td>{{ contact.email || '-' }}</td>
                  <td>{{ contact.availability || '-' }}</td>
                  <td class="actions">
                    <app-permission-gate [permissions]="['BUILDING_UPDATE']">
                      <button type="button" class="icon-action" (click)="open(contact)" [attr.aria-label]="'Edit ' + contact.name" title="Edit">
                        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                      </button>
                      <button type="button" class="icon-action icon-action--danger" (click)="remove(contact)" [attr.aria-label]="'Remove ' + contact.name" title="Remove">
                        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg>
                      </button>
                    </app-permission-gate>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </app-section-card>

    @if (editing(); as state) {
      <app-dialog [title]="state.contact ? 'Edit contact' : 'Add contact'"
                  subtitle="Tenants of this building see it under “Who to call”." (closed)="editing.set(null)">
        <form id="building-contact" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save(state.contact)">
          <div class="field-pair">
            <label class="field">
              <span>Name</span>
              <input formControlName="name" placeholder="e.g. John Mwangi">
              <app-field-error [control]="form.controls.name" label="Name" />
            </label>
            <label class="field">
              <span>Role</span>
              <select formControlName="type">
                @for (type of types; track type) { <option [value]="type">{{ label(type) }}</option> }
              </select>
            </label>
          </div>

          <!-- The channels are one answer — how to reach them — so they read as one group. -->
          <fieldset class="channels">
            <legend>How to reach them <span class="muted">· at least one</span></legend>
            <div class="field-pair">
              <label class="field">
                <span>Call</span>
                <input formControlName="phone" inputmode="tel" placeholder="0712 345 678">
              </label>
              <label class="field">
                <span>WhatsApp</span>
                <input formControlName="whatsapp" inputmode="tel" placeholder="If different">
              </label>
            </div>
            <label class="field">
              <span>Email <span class="muted">(optional)</span></span>
              <input type="email" formControlName="email">
              <app-field-error [control]="form.controls.email" label="Email" />
            </label>
            @if (noChannel()) {
              <p class="error-text" role="alert">Add a call number, WhatsApp or email.</p>
            }
          </fieldset>

          <div class="field-pair field-pair--wide">
            <label class="field">
              <span>Hours <span class="muted">(optional)</span></span>
              <input formControlName="availability" placeholder="e.g. Mon–Sat 8am–6pm">
            </label>
            <label class="field">
              <span>Order</span>
              <input type="number" min="0" formControlName="displayOrder">
              <small class="hint">Lower shows first.</small>
            </label>
          </div>
          <label class="field">
            <span>Note for tenants <span class="muted">(optional)</span></span>
            <textarea formControlName="notes" rows="2" placeholder="e.g. For water and power issues"></textarea>
          </label>
          @if (saveError(); as apiError) {
            <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
          }
        </form>
        <div dialog-actions>
          <button type="submit" form="building-contact" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save contact' }}</button>
          <button type="button" class="btn btn-secondary" (click)="editing.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    :host { display: contents; }
    .actions { white-space: nowrap; text-align: right; }
    .actions app-permission-gate { display: inline-flex; gap: 0.4rem; }
    p { margin: 0; }
    .channels { display: grid; gap: 0.85rem; margin: 0; padding: 0.85rem; border: 1px solid var(--border); border-radius: 12px; min-width: 0; }
    .channels legend { padding: 0 0.35rem; font-weight: 600; font-size: 0.88rem; }
    /* Hours is a phrase, order a digit or two: give the phrase the room. */
    .field-pair--wide { grid-template-columns: minmax(0, 3fr) minmax(0, 1fr); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingContactsComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();

  private readonly housing = inject(HousingService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly types = Object.keys(TYPE_LABELS) as BuildingContactType[];
  readonly contacts = signal<BuildingContact[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly editing = signal<{ contact: BuildingContact | null } | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly noChannel = signal(false);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    type: 'CARETAKER' as BuildingContactType,
    phone: ['', [Validators.maxLength(30)]],
    whatsapp: ['', [Validators.maxLength(30)]],
    email: ['', [Validators.email, Validators.maxLength(150)]],
    availability: ['', [Validators.maxLength(120)]],
    notes: ['', [Validators.maxLength(500)]],
    displayOrder: [0]
  });

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.agencyId(), this.buildingId()];
      untracked(() => void this.load(agencyId, buildingId));
    });
  }

  private async load(agencyId: number, buildingId: number): Promise<void> {
    this.loadError.set(null);
    try {
      this.contacts.set(await firstValueFrom(this.housing.getBuildingContacts(agencyId, buildingId)));
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    }
  }

  label(type: BuildingContactType): string {
    return TYPE_LABELS[type] ?? type;
  }

  open(contact: BuildingContact | null): void {
    this.saveError.set(null);
    this.noChannel.set(false);
    this.form.reset({
      name: contact?.name ?? '',
      type: contact?.type ?? 'CARETAKER',
      phone: contact?.phone ?? '',
      whatsapp: contact?.whatsapp ?? '',
      email: contact?.email ?? '',
      availability: contact?.availability ?? '',
      notes: contact?.notes ?? '',
      displayOrder: contact?.displayOrder ?? this.contacts().length
    });
    this.editing.set({ contact });
  }

  async save(existing: BuildingContact | null): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      name: value.name.trim(),
      type: value.type,
      // Sent blank rather than omitted on edit, so a removed channel is actually removed.
      phone: value.phone.trim(),
      whatsapp: value.whatsapp.trim(),
      email: value.email.trim(),
      availability: value.availability.trim(),
      notes: value.notes.trim(),
      displayOrder: Number(value.displayOrder) || 0
    };
    if (!request.phone && !request.whatsapp && !request.email) {
      this.noChannel.set(true);
      return;
    }
    this.noChannel.set(false);
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const saved = await firstValueFrom(existing
        ? this.housing.updateBuildingContact(this.agencyId(), this.buildingId(), existing.id, request)
        : this.housing.createBuildingContact(this.agencyId(), this.buildingId(), request));
      this.contacts.update((list) => (list.some((item) => item.id === saved.id)
        ? list.map((item) => item.id === saved.id ? saved : item)
        : [...list, saved]).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
      this.editing.set(null);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(contact: BuildingContact): Promise<void> {
    if (!await this.confirm.ask({
      title: `Remove ${contact.name}?`,
      message: 'Tenants will no longer see this contact.',
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }
    try {
      await firstValueFrom(this.housing.deleteBuildingContact(this.agencyId(), this.buildingId(), contact.id));
      this.contacts.update((list) => list.filter((item) => item.id !== contact.id));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    }
  }
}
