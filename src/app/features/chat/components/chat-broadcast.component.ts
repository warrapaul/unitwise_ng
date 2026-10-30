import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, debounceTime, firstValueFrom, merge, of, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TenantsService } from '../../tenants/tenants.service';
import { BroadcastAudience } from '../models/chat.models';
import { MultiSelectComponent } from '../../../shared/components/multi-select/multi-select.component';
import { SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../../housing/housing.service';
import { ChatService } from '../chat.service';

type Audience = 'agency' | 'buildings' | 'rooms' | 'tenants';

/**
 * One message to many tenants. Each copy lands in the tenant's own thread, so
 * replies stay private — this is not a group chat (that is the building channel).
 */
@Component({
  selector: 'app-chat-broadcast',
  standalone: true,
  imports: [ReactiveFormsModule, MultiSelectComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <form class="stack broadcast" [formGroup]="form" appFormFeedback (ngSubmit)="send()">
      <div class="grid-auto">
        <label class="field">
          <span>Send to</span>
          <select formControlName="audience">
            <option value="agency">Every tenant in the agency</option>
            <option value="buildings">Tenants in chosen buildings</option>
            @if (buildingId()) {
              <option value="rooms">Tenants in chosen rooms</option>
              <option value="tenants">Chosen tenants</option>
            }
          </select>
        </label>

        @if (form.controls.audience.value === 'buildings') {
          <label class="field">
            <span>Buildings</span>
            <app-multi-select formControlName="buildingIds" [options]="buildingOptions()" emptyMessage="No buildings." />
          </label>
        } @else if (form.controls.audience.value === 'rooms') {
          <label class="field">
            <span>Rooms</span>
            <app-multi-select formControlName="roomIds" [options]="roomOptions()" emptyMessage="No rooms." />
          </label>
        } @else if (form.controls.audience.value === 'tenants') {
          <label class="field">
            <span>Tenants</span>
            <app-multi-select formControlName="tenantIds" [options]="tenantOptions()" emptyMessage="No tenants living here." />
          </label>
        }
      </div>

      <label class="field">
        <span>Message</span>
        <textarea formControlName="content" rows="3" maxlength="4000"></textarea>
        <app-field-error [control]="form.controls.content" label="Message" />
      </label>

      <!-- Who it reaches, counted by the server before anything is sent; names are never listed. -->
      @if (reach() !== null) {
        <p class="reach" role="status">Reaches <strong>{{ reach() }}</strong> tenant{{ reach() === 1 ? '' : 's' }} living there now, each in their own conversation.</p>
      }

      @if (error(); as apiError) {
        <app-error-card title="Unable to send" [message]="apiError.message" [details]="apiError.details" />
      }

      <div class="button-row">
        <button type="submit" class="btn btn-primary" [disabled]="sending() || reach() === 0">
          {{ sending() ? 'Sending...' : reach() ? 'Send to ' + reach() : 'Send' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </form>
  `,
  styles: [`
    .broadcast {
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
    }
    .reach { margin: 0; font-size: var(--text-md); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatBroadcastComponent {
  readonly agencyId = input.required<number>();
  /** The active building, whose rooms can be chosen. */
  readonly buildingId = input<number | null>(null);

  /** How many tenants it reached. */
  readonly sent = output<number>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly chat = inject(ChatService);
  private readonly housing = inject(HousingService);
  private readonly tenants = inject(TenantsService);

  readonly sending = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly buildingOptions = signal<SelectOption<number>[]>([]);
  readonly roomOptions = signal<SelectOption<number>[]>([]);
  readonly tenantOptions = signal<SelectOption<number>[]>([]);
  /** The server's count for the current choice; null while it is being worked out. */
  readonly reach = signal<number | null>(null);

  readonly form = this.fb.group({
    audience: 'agency' as Audience,
    buildingIds: [[] as number[]],
    roomIds: [[] as number[]],
    tenantIds: [[] as number[]],
    content: ['', [Validators.required, Validators.maxLength(4000)]]
  });

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      untracked(() => void this.loadBuildings(agencyId));
    });

    effect(() => {
      const buildingId = this.buildingId();
      untracked(() => {
        void this.loadRooms(this.agencyId(), buildingId);
        void this.loadTenants(this.agencyId(), buildingId);
      });
    });

    // Recount whenever who it goes to changes; the message itself does not matter.
    merge(this.form.controls.audience.valueChanges, this.form.controls.buildingIds.valueChanges,
      this.form.controls.roomIds.valueChanges, this.form.controls.tenantIds.valueChanges)
      .pipe(startWith(null), debounceTime(300), switchMap(() => {
        this.reach.set(null);
        const audience = this.audienceRequest();
        return audience ? this.chat.broadcastAudience(this.agencyId(), audience).pipe(catchError(() => of(null))) : of(null);
      }), takeUntilDestroyed())
      .subscribe((result) => this.reach.set(result ? result.recipients : null));
  }

  /** The request for the current choice; null when a choice is still empty. */
  private audienceRequest(): BroadcastAudience | null {
    const { audience, buildingIds, roomIds, tenantIds } = this.form.getRawValue();
    if ((audience === 'buildings' && buildingIds.length === 0) || (audience === 'rooms' && roomIds.length === 0)
        || (audience === 'tenants' && tenantIds.length === 0)) {
      return null;
    }
    return {
      buildingIds: audience === 'buildings' ? buildingIds : audience === 'tenants' && this.buildingId() ? [this.buildingId()!] : null,
      roomIds: audience === 'rooms' ? roomIds : null,
      tenantIds: audience === 'tenants' ? tenantIds : null
    };
  }

  async send(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { audience, content } = this.form.getRawValue();
    const target = this.audienceRequest();
    if (!target) {
      this.error.set({ status: 0, errorCode: 'VALIDATION_ERROR', details: [],
        message: audience === 'buildings' ? 'Choose at least one building.' : audience === 'rooms' ? 'Choose at least one room.' : 'Choose at least one tenant.' });
      return;
    }

    this.sending.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.chat.broadcast(this.agencyId(), { ...target, content: content.trim() }));
      this.form.reset({ audience: 'agency', buildingIds: [], roomIds: [], tenantIds: [], content: '' });
      this.sent.emit(result.recipients);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.sending.set(false);
    }
  }

  private async loadBuildings(agencyId: number): Promise<void> {
    try {
      const page = await firstValueFrom(this.housing.getBuildingsForAgency(agencyId, { size: 200 }));
      this.buildingOptions.set(page.items.map((building) => ({ value: building.id, label: building.name ?? `Building #${building.id}` })));
    } catch {
      this.buildingOptions.set([]);
    }
  }

  /** The tenants living in the active building, to pick from. */
  private async loadTenants(agencyId: number, buildingId: number | null): Promise<void> {
    if (!buildingId) {
      this.tenantOptions.set([]);
      return;
    }
    try {
      const page = await firstValueFrom(this.tenants.getTenantsForBuilding(agencyId, buildingId, { status: 'ACTIVE', size: 200 }));
      this.tenantOptions.set(page.items.map((tenant) => ({
        value: tenant.id,
        label: [[tenant.firstName, tenant.lastName].filter(Boolean).join(' ') || `Tenant #${tenant.id}`, tenant.roomName].filter(Boolean).join(' · ')
      })));
    } catch {
      this.tenantOptions.set([]);
    }
  }

  private async loadRooms(agencyId: number, buildingId: number | null): Promise<void> {
    if (!buildingId) {
      this.roomOptions.set([]);
      return;
    }
    try {
      const building = await firstValueFrom(this.housing.getBuilding(agencyId, buildingId));
      this.roomOptions.set((building.floors ?? []).flatMap((floor) => (floor.rooms ?? []).map((room) => ({
        value: room.id,
        label: room.name || (room.roomNumber !== null && room.roomNumber !== undefined ? `Room ${room.roomNumber}` : `Room #${room.id}`)
      }))));
    } catch {
      this.roomOptions.set([]);
    }
  }
}
