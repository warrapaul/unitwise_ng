import { FormFeedbackDirective } from '../../shared/directives/form-feedback.directive';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { ActiveContextService } from '../../core/services/active-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { API_URL } from '../../core/tokens/api-url.token';
import { ContextGuardComponent } from '../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../shared/directives/card-table.directive';
import { ConfirmService } from '../../shared/services/confirm.service';
import { asText, downloadCsv } from '../../shared/utils/csv-export.util';
import { displayDateTime } from '../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../shared/utils/error-message.util';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { HousingService } from '../housing/housing.service';
import { BuildingPreview } from '../housing/models/housing.models';

interface Announcement {
  id: number;
  title: string;
  content: string;
  scopeLabel?: string | null;
  sentByName?: string | null;
  sentAt: string;
  recipients: number;
  inApp: number;
  read: number;
  smsSent: number;
  failed: number;
}

interface Delivery {
  tenantId: number;
  tenantName?: string | null;
  roomName?: string | null;
  buildingName?: string | null;
  channel: 'APP' | 'SMS';
  status: 'SENT' | 'FAILED';
  detail?: string | null;
  readAt?: string | null;
  sentAt: string;
}

/**
 * One message to every tenant of a building (or all of them): a water outage, a meeting. Tenants
 * with an account get it in their own thread and the log shows when they read it; the rest get an
 * SMS, and a failed one says why.
 */
@Component({
  selector: 'app-announcements-page',
  standalone: true,
  imports: [FormFeedbackDirective, ReactiveFormsModule, CardTableDirective, ContextGuardComponent, EmptyStateComponent, ErrorStateComponent,
    LoadingStateComponent, PermissionGateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="TENANT_MESSAGE_READ">
        <app-permission-gate [permissions]="['TENANT_MESSAGE_CREATE']">
          <app-section-card title="New announcement" subtitle="Every tenant living in the buildings you choose">
            <form appFormFeedback class="stack" [formGroup]="form" (ngSubmit)="send()">
              <label class="field"><span>Title</span><input formControlName="title" maxlength="120" placeholder="Water off on Saturday"></label>
              <label class="field"><span>Message</span><textarea formControlName="content" rows="4" maxlength="1600"></textarea></label>
              @if (buildings().length > 1) {
                <fieldset class="picks">
                  <legend>Buildings</legend>
                  <label><input type="checkbox" [checked]="chosen().size === 0" (change)="clearChosen()"> All buildings</label>
                  @for (b of buildings(); track b.id) {
                    <label><input type="checkbox" [checked]="chosen().has(b.id)" (change)="toggle(b.id)"> {{ b.name }}</label>
                  }
                </fieldset>
              }
              <label class="sms"><input type="checkbox" formControlName="sms"> Text tenants who have no account (SMS charges apply)</label>
              @if (audience(); as a) {
                <p class="muted">{{ reachText(a) }}</p>
              }
              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="sending() || form.invalid">{{ sending() ? 'Sending…' : 'Send announcement' }}</button>
              </div>
            </form>
          </app-section-card>
        </app-permission-gate>

        <app-section-card title="Sent">
          @if (loading() && items().length === 0) {
            <app-loading-state [compact]="true" label="Loading announcements…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="load()" />
          } @else if (items().length === 0) {
            <app-empty-state title="No announcements yet" description="Tell every tenant at once about a water outage, a meeting or building works." />
          } @else {
            <ul class="sent">
              @for (a of items(); track a.id) {
                <li class="sent__item">
                  <div class="sent__head">
                    <div class="cell-stack">
                      <strong>{{ a.title }}</strong>
                      <span class="muted small">{{ when(a.sentAt) }} · {{ a.scopeLabel }}@if (a.sentByName) { · {{ a.sentByName }} }</span>
                    </div>
                    <button type="button" class="btn btn-text btn-sm" (click)="open(a)">{{ openId() === a.id ? 'Hide log' : 'Delivery log' }}</button>
                  </div>
                  <p class="sent__body">{{ a.content }}</p>
                  <div class="chip-row">
                    <span class="status-chip status-chip--info">Read {{ a.read }} of {{ a.inApp }} in the app</span>
                    @if (a.smsSent) { <span class="status-chip status-chip--neutral">{{ a.smsSent }} by SMS</span> }
                    @if (a.failed) { <span class="status-chip status-chip--danger">{{ a.failed }} failed</span> }
                  </div>
                  @if (openId() === a.id) {
                    @if (log(); as rows) {
                      <div class="table-scroll">
                        <table appCardTable class="table">
                          <thead><tr><th>Tenant</th><th>Room</th><th>How</th><th>Status</th></tr></thead>
                          <tbody>
                            @for (d of rows; track d.tenantId + d.channel) {
                              <tr>
                                <td class="card-title">{{ d.tenantName }}</td>
                                <td data-label="Room">{{ place(d) }}</td>
                                <td data-label="How">{{ d.channel === 'APP' ? 'App' : 'SMS' }}</td>
                                <td data-label="Status">
                                  @if (d.status === 'FAILED') {
                                    <span class="status-chip status-chip--danger">Failed</span> <span class="muted small">{{ d.detail }}</span>
                                  } @else if (d.channel === 'APP') {
                                    @if (d.readAt) { <span class="status-chip status-chip--success">Read {{ when(d.readAt) }}</span> }
                                    @else { <span class="status-chip status-chip--neutral">Not read yet</span> }
                                  } @else {
                                    <span class="status-chip status-chip--neutral">SMS sent</span>
                                  }
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      <button type="button" class="btn btn-secondary btn-sm" (click)="exportLog(a, rows)">Export CSV</button>
                    } @else {
                      <app-loading-state [compact]="true" label="Loading the log…" />
                    }
                  }
                </li>
              }
            </ul>
          }
        </app-section-card>
      </app-context-guard>
    </section>
  `,
  styles: [`
    .field input, .field textarea { max-width: none; }
    .picks { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
    .picks legend { font-weight: var(--weight-semibold); margin-bottom: var(--space-1); width: 100%; }
    .picks label, .sms { display: flex; gap: var(--space-2); align-items: center; min-height: 2.5rem; }
    .sent { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
    .sent__item { border-bottom: 1px solid var(--border); padding-bottom: var(--space-3); display: grid; gap: var(--space-2); }
    .sent__item:last-child { border-bottom: 0; }
    .sent__head { display: flex; justify-content: space-between; gap: var(--space-3); align-items: start; }
    .sent__body { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
    .chip-row { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    .small { font-size: var(--text-xs); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnnouncementsPageComponent {
  readonly context = inject(ActiveContextService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly housing = inject(HousingService);
  private readonly toasts = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    content: ['', [Validators.required, Validators.maxLength(1600)]],
    sms: true
  });

  readonly buildings = signal<BuildingPreview[]>([]);
  readonly chosen = signal<ReadonlySet<number>>(new Set());
  readonly audience = signal<{ inApp: number; bySms: number } | null>(null);
  readonly items = signal<Announcement[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);
  readonly openId = signal<number | null>(null);
  readonly log = signal<Delivery[] | null>(null);

  private readonly buildingIds = computed(() => {
    const context = this.context.buildingId();
    return this.chosen().size > 0 ? [...this.chosen()] : context !== null ? [context] : [];
  });

  constructor() {
    effect(() => {
      const agencyId = this.context.agencyId();
      this.context.buildingId();
      untracked(() => {
        if (agencyId !== null) {
          void this.load();
          void firstValueFrom(this.housing.getBuildingsForAgency(agencyId, { page: 0, size: 100 }))
            .then((page) => this.buildings.set(page.items)).catch(() => this.buildings.set([]));
        }
      });
    });
    effect(() => {
      const ids = this.buildingIds();
      const agencyId = this.context.agencyId();
      untracked(() => {
        if (agencyId !== null) {
          void firstValueFrom(this.http.get<ApiResponse<{ inApp: number; bySms: number }>>(`${this.apiUrl}/${ApiUrls.announcements(agencyId)}/audience`,
            { params: buildHttpParams({ buildingIds: ids.join(',') || null }) }).pipe(map((r) => r.data)))
            .then((a) => this.audience.set(a)).catch(() => this.audience.set(null));
        }
      });
    });
  }

  reachText(a: { inApp: number; bySms: number }): string {
    const app = `Reaches ${a.inApp} tenant${a.inApp === 1 ? '' : 's'} in the app`;
    return this.form.controls.sms.value ? `${app} and ${a.bySms} by SMS.` : `${app}.`;
  }

  clearChosen(): void {
    this.chosen.set(new Set());
  }

  place(d: Delivery): string {
    return [d.buildingName, d.roomName].filter(Boolean).join(' · ') || '—';
  }

  toggle(id: number): void {
    this.chosen.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  async load(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.http.get<PaginatedApiResponse<Announcement>>(`${this.apiUrl}/${ApiUrls.announcements(agencyId)}`,
        { params: buildHttpParams({ page: 0, size: 30 }) }).pipe(map((r) => r.data ?? []))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async send(): Promise<void> {
    const agencyId = this.context.agencyId();
    const v = this.form.getRawValue();
    const a = this.audience();
    const reach = a ? `${a.inApp} in the app${v.sms ? ` and ${a.bySms} by SMS` : ''}` : 'the tenants';
    if (agencyId === null || this.form.invalid || !await this.confirm.ask({
      title: `Send "${v.title.trim()}"?`,
      message: `It goes to ${reach}. It cannot be taken back.`,
      confirmLabel: 'Send'
    })) {
      return;
    }
    this.sending.set(true);
    try {
      const sent = await firstValueFrom(this.http.post<ApiResponse<Announcement>>(`${this.apiUrl}/${ApiUrls.announcements(agencyId)}`, {
        title: v.title.trim(), content: v.content.trim(), buildingIds: this.buildingIds(), smsTenantsWithoutAccount: v.sms
      }).pipe(map((r) => r.data)));
      this.items.update((list) => [sent, ...list]);
      this.form.reset({ title: '', content: '', sms: v.sms });
      this.toasts.push(sent.failed ? 'warning' : 'success', `Sent to ${sent.recipients} tenant${sent.recipients === 1 ? '' : 's'}${sent.failed ? `; ${sent.failed} SMS failed` : ''}.`);
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.sending.set(false);
    }
  }

  async open(a: Announcement): Promise<void> {
    const agencyId = this.context.agencyId();
    if (this.openId() === a.id || agencyId === null) {
      this.openId.set(null);
      return;
    }
    this.openId.set(a.id);
    this.log.set(null);
    try {
      this.log.set(await firstValueFrom(this.http.get<ApiResponse<Delivery[]>>(`${this.apiUrl}/${ApiUrls.announcements(agencyId)}/${a.id}/deliveries`)
        .pipe(map((r) => r.data ?? []))));
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
      this.openId.set(null);
    }
  }

  exportLog(a: Announcement, rows: Delivery[]): void {
    downloadCsv(`announcement-${a.sentAt.slice(0, 10)}`, rows, [
      { header: 'Tenant', value: (d) => d.tenantName },
      { header: 'Building', value: (d) => d.buildingName },
      { header: 'Room', value: (d) => asText(d.roomName) },
      { header: 'How', value: (d) => d.channel === 'APP' ? 'App' : 'SMS' },
      { header: 'Status', value: (d) => d.status === 'FAILED' ? `Failed: ${d.detail ?? ''}` : d.readAt ? 'Read' : d.channel === 'APP' ? 'Not read yet' : 'SMS sent' },
      { header: 'Read at', value: (d) => d.readAt ? d.readAt.replace('T', ' ').slice(0, 16) : '' }
    ]);
  }

  when(value: string): string {
    return displayDateTime(value);
  }
}
