import { Location } from '@angular/common';
import { canGoBack } from '../../../shared/directives/back.directive';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { RoutePaths } from '../../../core/routes/route-paths';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { formatPhone } from '../../../shared/utils/format.util';
import { MyTenancyContact } from '../../tenants/models/tenant.models';
import { MyTenanciesStore } from '../../tenants/tenants/my-tenancies.store';
import { TenantsService } from '../../tenants/tenants.service';
import { MAINTENANCE_PHOTO_TYPES } from '../components/maintenance-detail-body.component';
import { ACCESS_LABELS, AccessPreference, MAINTENANCE_CATEGORY_LABELS, MaintenanceCategory, MaintenanceDetail, MaintenancePriority } from '../maintenance.models';
import { MaintenanceService } from '../maintenance.service';

const URGENCY: { value: MaintenancePriority; label: string; hint: string }[] = [
  { value: 'MEDIUM', label: 'Normal', hint: 'Can wait a few days' },
  { value: 'HIGH', label: 'Soon', hint: 'Getting worse' },
  { value: 'URGENT', label: 'Urgent', hint: 'Part of the home can’t be used' },
  { value: 'EMERGENCY', label: 'Emergency', hint: 'Fire, gas, flooding or danger' }
];

const PLACES = ['Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Outside'];
const MAX_PHOTOS = 6;

/**
 * Reporting a repair, on a page of its own: kind of problem and urgency as choices, where in the
 * home, a title (and more if needed), photos before sending, and how to get in. The list of
 * requests is the Repairs page this returns to.
 */
@Component({
  selector: 'app-my-maintenance-report-page',
  standalone: true,
  imports: [ReactiveFormsModule, SectionCardComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <app-section-card [title]="followUpOf() ? 'Report it again' : 'Report an issue'"
                      [subtitle]="followUpOf() ? 'Following up ' + followUpOf()!.requestNumber + ' — ' + followUpOf()!.title : null">
      @if (store.tenancies().length === 0 && !store.loading()) {
        <p class="muted">Repairs can be reported once you have a tenancy.</p>
      } @else {
        <form class="report" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          @if (store.tenancies().length > 1) {
            <label class="field">
              <span>Home</span>
              <select formControlName="tenantId">
                @for (tenancy of store.tenancies(); track tenancy.id) {
                  <option [ngValue]="tenancy.id">{{ tenancy.roomName ? 'Room ' + tenancy.roomName : 'Room' }} · {{ tenancy.buildingName }}</option>
                }
              </select>
            </label>
          }

          <fieldset class="choices">
            <legend>What kind of problem</legend>
            <div class="chips">
              @for (option of categories; track option.value) {
                <label class="chip"><input type="radio" formControlName="category" [value]="option.value"><span>{{ option.label }}</span></label>
              }
            </div>
          </fieldset>

          <fieldset class="choices">
            <legend>How urgent</legend>
            <div class="levels">
              @for (level of urgency; track level.value) {
                <label class="level" [class.level--bad]="level.value === 'EMERGENCY'">
                  <input type="radio" formControlName="priority" [value]="level.value">
                  <span><strong>{{ level.label }}</strong><span class="muted">{{ level.hint }}</span></span>
                </label>
              }
            </div>
          </fieldset>

          @if (form.controls.priority.value === 'EMERGENCY') {
            <div class="alert alert-warning" role="alert">
              <p><strong>Call first.</strong> A request here is not an emergency response.</p>
              @for (contact of emergencyContacts(); track $index) {
                <a class="btn btn-primary btn-sm" [href]="'tel:' + contact.phone">Call {{ contact.name || contact.role }} · {{ phone(contact.phone) }}</a>
              }
            </div>
          }

          <div class="field">
            <label for="where">Where in your home</label>
            <div class="chips">
              @for (place of places; track place) {
                <button type="button" class="chip" [class.chip--on]="form.controls.locationInProperty.value === place" (click)="pickPlace(place)">{{ place }}</button>
              }
            </div>
            <input id="where" formControlName="locationInProperty" maxlength="150" aria-label="Where in your home, in your own words">
          </div>

          <label class="field">
            <span>Title</span>
            <input formControlName="title" maxlength="255">
            <app-field-error [control]="form.controls.title" label="Title" />
          </label>
          <label class="field">
            <span>Description</span>
            <textarea formControlName="description" rows="3"></textarea>
          </label>

          <div class="field">
            <span class="field__label">Photos</span>
            <div class="photo-actions">
              <label class="btn btn-secondary btn-sm">Take photo
                <input class="visually-hidden" type="file" accept="image/*" capture="environment" (change)="addPhotos($event)"></label>
              <label class="btn btn-secondary btn-sm">Choose photos
                <input class="visually-hidden" type="file" [accept]="photoTypes" multiple (change)="addPhotos($event)"></label>
            </div>
            @if (photos().length > 0) {
              <ul class="photos">
                @for (photo of photos(); track photo.url) {
                  <li>
                    <img [src]="photo.url" [alt]="photo.file.name">
                    <button type="button" class="icon-action icon-action--danger" (click)="removePhoto(photo)" [attr.aria-label]="'Remove ' + photo.file.name">
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-close" /></svg>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>

          <fieldset class="choices">
            <legend>Access</legend>
            <div class="chips">
              @for (option of accessOptions; track option.value) {
                <label class="chip"><input type="radio" formControlName="accessPreference" [value]="option.value"><span>{{ option.label }}</span></label>
              }
            </div>
          </fieldset>
          @if (contactPhone(); as number) {
            <p class="hint">Your landlord will call you on {{ number }}.</p>
          }

          @if (submitError(); as apiError) {
            <app-error-card title="Not sent" [message]="apiError.message" [details]="apiError.details" />
          }
          <div class="button-row">
            <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="leave()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Sending...' : 'Submit request' }}</button>
          </div>
        </form>
      }
    </app-section-card>
  `,
  styles: [`
    .report { display: grid; gap: var(--space-5); }
    .choices { margin: 0; padding: 0; border: 0; display: grid; gap: var(--space-2); min-width: 0; }
    .choices legend, .field__label { padding: 0; margin-bottom: var(--space-2); font-weight: var(--weight-semibold); font-size: var(--font-label); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .chip { position: relative; display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 var(--space-3);
            border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); color: var(--text);
            font: inherit; cursor: pointer; }
    .chip input { position: absolute; opacity: 0; pointer-events: none; }
    .chip:has(input:checked), .chip--on { border-color: var(--primary); background: var(--primary-tint, var(--surface-2)); color: var(--primary-strong); font-weight: var(--weight-semibold); }
    .chip:has(input:focus-visible) { box-shadow: 0 0 0 3px var(--primary-ring); }
    /* Two per row on a phone, four when wide, one when the text is large. */
    .levels { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: var(--space-2); }
    @media (min-width: 900px) { .levels { grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); } }
    .level { display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-2-5) var(--space-3);
             border: 1px solid var(--border-strong); border-radius: var(--radius-md); cursor: pointer; }
    .level > span { display: grid; gap: var(--space-0-5); }
    .level input { margin-top: 0.2rem; }
    .level:has(input:checked) { border-color: var(--primary); background: var(--primary-tint, var(--surface-2)); }
    .level--bad:has(input:checked) { border-color: var(--danger); background: var(--danger-tint); }
    .alert { display: grid; gap: var(--space-2); justify-items: start; }
    .alert p { margin: 0; }
    .field #where { margin-top: var(--space-2); }
    .photo-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .photo-actions label { cursor: pointer; }
    .photos { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0 0; padding: 0; list-style: none; }
    .photos li { position: relative; }
    .photos img { width: 5.5rem; height: 5.5rem; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); }
    .photos .icon-action { position: absolute; top: var(--space-1); right: var(--space-1); background: var(--surface); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyMaintenanceReportPageComponent implements OnInit, HasUnsavedChanges {
  readonly store = inject(MyTenanciesStore);
  private readonly maintenance = inject(MaintenanceService);
  private readonly tenants = inject(TenantsService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly categories = (Object.keys(MAINTENANCE_CATEGORY_LABELS) as MaintenanceCategory[])
    .map((value) => ({ value, label: MAINTENANCE_CATEGORY_LABELS[value] }));
  readonly urgency = URGENCY;
  readonly places = PLACES;
  readonly accessOptions = (Object.keys(ACCESS_LABELS) as AccessPreference[]).map((value) => ({ value, label: ACCESS_LABELS[value] }));
  readonly photoTypes = MAINTENANCE_PHOTO_TYPES.join(',');

  readonly saving = signal(false);
  readonly submitError = signal<ApiError | null>(null);
  readonly followUpOf = signal<MaintenanceDetail | null>(null);
  readonly photos = signal<{ file: File; url: string }[]>([]);
  private readonly contacts = signal<MyTenancyContact[]>([]);

  readonly form = this.fb.group({
    tenantId: [0, [Validators.required, Validators.min(1)]],
    category: 'PLUMBING' as MaintenanceCategory,
    priority: 'MEDIUM' as MaintenancePriority,
    title: ['', [Validators.required, Validators.maxLength(255)]],
    locationInProperty: ['', [Validators.maxLength(150)]],
    accessPreference: 'CONTACT_FIRST' as AccessPreference,
    description: ''
  });

  private readonly chosenId = signal(0);

  /** The numbers to ring in an emergency: the emergency line first, then the building's own. */
  readonly emergencyContacts = computed(() => {
    const withPhone = this.contacts().filter((contact) => !!contact.phone);
    const emergency = withPhone.filter((contact) => contact.kind === 'EMERGENCY');
    return (emergency.length ? emergency : withPhone).slice(0, 2);
  });

  readonly contactPhone = computed(() => {
    const tenancy = this.store.tenancies().find((item) => item.id === this.chosenId());
    return tenancy?.phoneNumber ? formatPhone(tenancy.phoneNumber) : null;
  });

  constructor() {
    this.form.controls.tenantId.valueChanges.subscribe((id) => this.chosenId.set(id));
    // The home the report is for: the one asked for (?tenantId=), else the one picked elsewhere.
    effect(() => {
      const fallback = this.store.selectedId();
      untracked(() => {
        if (!this.form.controls.tenantId.value && fallback) {
          const wanted = Number(this.route.snapshot.queryParamMap.get('tenantId'));
          const id = this.store.tenancies().some((item) => item.id === wanted) ? wanted : fallback;
          this.form.controls.tenantId.setValue(id);
        }
      });
    });
    effect(() => {
      const id = this.chosenId();
      if (id) {
        untracked(() => void this.loadContacts(id));
      }
    });
  }

  ngOnInit(): void {
    void this.store.load();
    const followUp = Number(this.route.snapshot.queryParamMap.get('followUp'));
    if (followUp) {
      void this.loadFollowUp(followUp);
    }
  }

  hasUnsavedChanges(): boolean {
    return (this.form.dirty || this.photos().length > 0) && !this.saving();
  }

  pickPlace(place: string): void {
    this.form.controls.locationInProperty.setValue(this.form.controls.locationInProperty.value === place ? '' : place);
    this.form.controls.locationInProperty.markAsDirty();
  }

  addPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    const allowed = picked.filter((file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024);
    if (allowed.length < picked.length) {
      this.notifications.push('error', 'Photos only, up to 10 MB each.');
    }
    const room = MAX_PHOTOS - this.photos().length;
    if (allowed.length > room) {
      this.notifications.push('error', `Up to ${MAX_PHOTOS} photos.`);
    }
    this.photos.update((list) => [...list, ...allowed.slice(0, Math.max(0, room)).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  removePhoto(photo: { file: File; url: string }): void {
    URL.revokeObjectURL(photo.url);
    this.photos.update((list) => list.filter((item) => item !== photo));
  }

  leave(): void {
    if (canGoBack(this.location)) {
      this.location.back();
    } else {
      void this.router.navigateByUrl(RoutePaths.myMaintenance);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.submitError.set(null);
    try {
      const created = await firstValueFrom(this.maintenance.report({
        tenantId: value.tenantId,
        category: value.category,
        priority: value.priority,
        title: value.title.trim(),
        description: value.description.trim(),
        locationInProperty: value.locationInProperty.trim() || null,
        accessPreference: value.accessPreference,
        followUpOfId: this.followUpOf()?.id ?? null
      }));
      // Photos go up once the request exists; one that fails does not undo the request.
      let failed = 0;
      for (const photo of this.photos()) {
        try {
          await firstValueFrom(this.maintenance.addMyPhoto(created.id, photo.file));
        } catch {
          failed++;
        }
      }
      this.photos().forEach((photo) => URL.revokeObjectURL(photo.url));
      this.photos.set([]);
      this.form.markAsPristine();
      this.notifications.push(failed ? 'error' : 'success', failed
        ? `Request ${created.requestNumber ?? ''} sent, but ${failed} photo${failed === 1 ? '' : 's'} did not upload. Add ${failed === 1 ? 'it' : 'them'} from the request.`
        : `Request ${created.requestNumber ?? ''} sent.`);
      // Back to where they came from (the list shows the new request first); opened directly, the list.
      if (canGoBack(this.location)) {
        this.location.back();
      } else {
        await this.router.navigate([RoutePaths.myMaintenance], { queryParams: { opened: created.id } });
      }
    } catch (error) {
      this.submitError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  phone(value: string | null | undefined): string {
    return formatPhone(value);
  }

  private async loadContacts(tenantId: number): Promise<void> {
    try {
      this.contacts.set((await firstValueFrom(this.tenants.getMyTenancyOverview(tenantId))).contacts ?? []);
    } catch {
      this.contacts.set([]);
    }
  }

  /** The same problem again: prefilled from the old request, pointing back at it. */
  private async loadFollowUp(id: number): Promise<void> {
    try {
      const earlier = await firstValueFrom(this.maintenance.getMineById(id));
      this.followUpOf.set(earlier);
      this.form.patchValue({
        tenantId: earlier.tenantId ?? this.form.controls.tenantId.value,
        category: earlier.category,
        title: earlier.title,
        locationInProperty: earlier.locationInProperty ?? ''
      });
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    }
  }
}
