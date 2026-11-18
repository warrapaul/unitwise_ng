import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse } from '../../core/models/api-response.model';
import { ActiveContextService } from '../../core/services/active-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { API_URL } from '../../core/tokens/api-url.token';
import { ContextGuardComponent } from '../../shared/components/context-guard/context-guard.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { ConfirmService } from '../../shared/services/confirm.service';
import { extractErrorMessage, toApiError } from '../../shared/utils/error-message.util';

type TemplateKey = 'RENT_REMINDER' | 'RENT_OVERDUE' | 'BILL_READY' | 'PAYMENT_CONFIRMED';

interface MessageTemplate {
  key: TemplateKey;
  label: string;
  description: string;
  customised: boolean;
  title: string;
  body: string;
  defaultTitle: string;
  defaultBody: string;
  variables: string[];
  sample: string;
}

/** The same sample values the server previews with, so what is shown here is what it would send. */
const SAMPLE: Record<string, string> = {
  firstName: 'Wanjiru', tenant: 'Wanjiru Kamau', room: 'A-4', building: 'Acacia Court', month: 'November 2026',
  amount: '12,500', dueDate: '5 Nov 2026', paybill: '522522', account: 'AC4', reference: 'QKA81HJ2'
};

const SMS_LENGTH = 160;

/**
 * The wording of the messages tenants receive, in the agency's own voice. Each keeps the standard
 * wording until the agency writes its own, and can go back to it.
 */
@Component({
  selector: 'app-message-templates-page',
  standalone: true,
  imports: [FormsModule, ContextGuardComponent, ErrorStateComponent, LoadingStateComponent, PermissionGateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="AGENCY_READ">
        @if (loading() && drafts().length === 0) {
          <app-loading-state label="Loading messages…" />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else {
          <p class="muted intro">These go to tenants by SMS, WhatsApp or the app, as they have chosen. Words in braces are filled in for each tenant.</p>
          @for (t of drafts(); track t.key) {
            <app-section-card [title]="t.label" [subtitle]="t.description + (t.customised ? ' · your wording' : ' · standard wording')">
              <div class="editor">
                <div class="stack">
                  <label class="field"><span>Title</span><input [(ngModel)]="t.title" maxlength="120" [name]="t.key + '-title'"></label>
                  <label class="field"><span>Message</span>
                    <textarea #box [(ngModel)]="t.body" rows="4" maxlength="640" [name]="t.key + '-body'"></textarea>
                    <small class="muted">{{ t.body.length }} characters · {{ smsCount(t) }}</small>
                  </label>
                  <div class="chips" aria-label="Placeholders">
                    @for (v of t.variables; track v) {
                      <button type="button" class="filter-chip" (click)="insert(t, box, v)">{{ '{' + v + '}' }}</button>
                    }
                  </div>
                </div>
                <div class="preview" aria-label="Preview">
                  <span class="preview__label">Preview</span>
                  <strong>{{ fill(t.title) }}</strong>
                  <p>{{ fill(t.body) }}</p>
                </div>
              </div>
              <app-permission-gate [permissions]="['AGENCY_UPDATE']">
                <div class="button-row">
                  <button type="button" class="btn btn-primary" [disabled]="busy() === t.key || !changed(t)" (click)="save(t)">
                    {{ busy() === t.key ? 'Saving…' : 'Save' }}</button>
                  @if (t.customised) {
                    <button type="button" class="btn btn-secondary" [disabled]="busy() === t.key" (click)="reset(t)">Use the standard wording</button>
                  }
                </div>
              </app-permission-gate>
            </app-section-card>
          }
        }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .intro { margin: 0; }
    .editor { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr) minmax(0, 18rem); align-items: start; }
    @media (max-width: 800px) { .editor { grid-template-columns: minmax(0, 1fr); } }
    .editor .field input, .editor .field textarea { max-width: none; }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    .preview { background: var(--primary-tint); border-radius: var(--radius-md); padding: var(--space-3); display: grid; gap: var(--space-1); }
    .preview__label { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; }
    .preview p { margin: 0; overflow-wrap: anywhere; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageTemplatesPageComponent {
  readonly context = inject(ActiveContextService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly toasts = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  /** Editable copies; `saved` keeps what the server has, to tell whether there is anything to save. */
  readonly drafts = signal<MessageTemplate[]>([]);
  private saved = new Map<TemplateKey, MessageTemplate>();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<TemplateKey | null>(null);

  constructor() {
    effect(() => {
      this.context.agencyId();
      untracked(() => void this.load());
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
      const list = await firstValueFrom(this.http.get<ApiResponse<MessageTemplate[]>>(`${this.apiUrl}/${ApiUrls.messageTemplates(agencyId)}`)
        .pipe(map((r) => r.data ?? [])));
      this.saved = new Map(list.map((t) => [t.key, t]));
      this.drafts.set(list.map((t) => ({ ...t })));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  changed(t: MessageTemplate): boolean {
    const saved = this.saved.get(t.key);
    return !saved || saved.title !== t.title || saved.body !== t.body;
  }

  async save(t: MessageTemplate): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.busy.set(t.key);
    try {
      const saved = await firstValueFrom(this.http.put<ApiResponse<MessageTemplate>>(
        `${this.apiUrl}/${ApiUrls.messageTemplates(agencyId)}/${t.key}`, { title: t.title.trim(), body: t.body.trim() }).pipe(map((r) => r.data)));
      this.replace(saved);
      this.toasts.push('success', `${t.label} saved.`);
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(null);
    }
  }

  async reset(t: MessageTemplate): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null || !await this.confirm.ask({
      title: `Use the standard ${t.label.toLowerCase()}?`,
      message: `"${t.defaultBody}" — your own wording is removed.`,
      confirmLabel: 'Use the standard wording'
    })) {
      return;
    }
    this.busy.set(t.key);
    try {
      this.replace(await firstValueFrom(this.http.delete<ApiResponse<MessageTemplate>>(
        `${this.apiUrl}/${ApiUrls.messageTemplates(agencyId)}/${t.key}`).pipe(map((r) => r.data))));
      this.toasts.push('success', 'Standard wording restored.');
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(null);
    }
  }

  private replace(t: MessageTemplate): void {
    this.saved.set(t.key, t);
    this.drafts.update((list) => list.map((item) => (item.key === t.key ? { ...t } : item)));
  }

  /** Puts {name} where the cursor is in the message. */
  insert(t: MessageTemplate, box: HTMLTextAreaElement, name: string): void {
    const at = box.selectionStart ?? t.body.length;
    const end = box.selectionEnd ?? at;
    const token = `{${name}}`;
    t.body = t.body.slice(0, at) + token + t.body.slice(end);
    this.drafts.update((list) => [...list]);
    setTimeout(() => {
      box.focus();
      box.setSelectionRange(at + token.length, at + token.length);
    });
  }

  fill(text: string): string {
    const agency = this.context.active().agencyName ?? '';
    return text.replace(/\{([a-zA-Z]+)\}/g, (_, name: string) => (name === 'agency' ? agency : SAMPLE[name] ?? ''))
      .replace(/ {2,}/g, ' ').replace(' .', '.').trim();
  }

  smsCount(t: MessageTemplate): string {
    const parts = Math.max(1, Math.ceil(this.fill(t.body).length / SMS_LENGTH));
    return parts === 1 ? 'one SMS' : `${parts} SMS each`;
  }
}
