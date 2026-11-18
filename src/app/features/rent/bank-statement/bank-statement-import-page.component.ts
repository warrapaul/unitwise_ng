import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { ApiUrls } from '../../../core/constants/api-urls';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { ApiResponse } from '../../../core/models/api-response.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { API_URL } from '../../../core/tokens/api-url.token';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FileUploadComponent } from '../../../shared/components/files/file-upload/file-upload.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency } from '../../../shared/utils/format.util';

type LineStatus = 'NEW' | 'ALREADY_RECORDED' | 'ALREADY_ENTERED' | 'REPEATED_IN_FILE' | 'UNREADABLE';

interface StatementLine {
  line: number;
  date?: string | null;
  description?: string | null;
  reference?: string | null;
  referenceMade: boolean;
  amount?: number | string | null;
  accountReference?: string | null;
  roomLabel?: string | null;
  status: LineStatus;
  notes: string[];
}

interface StatementPreview {
  lines: StatementLine[];
  newLines: number;
  duplicates: number;
  unreadable: number;
  skipped: number;
  newTotal: number | string;
  columns: Record<string, string>;
}

interface StatementResult {
  line: number;
  reference?: string | null;
  amount?: number | string | null;
  added: boolean;
  queueStatus?: string | null;
  message?: string | null;
}

interface StatementCommit {
  added: number;
  matched: number;
  notAdded: number;
  results: StatementResult[];
}

const STATUS: Record<LineStatus, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'success' },
  ALREADY_RECORDED: { label: 'Already recorded', tone: 'neutral' },
  ALREADY_ENTERED: { label: 'Already waiting', tone: 'neutral' },
  REPEATED_IN_FILE: { label: 'Repeated', tone: 'neutral' },
  UNREADABLE: { label: 'Could not read', tone: 'danger' }
};

/**
 * A bank statement into payments to confirm. Only money in is kept; anything Unitwise already has
 * (same reference recorded, already waiting, or twice in the file) is left out, and the same
 * amount on the same day under another reference is flagged. Adding moves no balance: each line
 * waits in the queue to be matched with a tenant's report or assigned.
 */
@Component({
  selector: 'app-bank-statement-import-page',
  standalone: true,
  imports: [RoomTitlePipe, RouterLink, CardTableDirective, ContextGuardComponent, ErrorCardComponent, FileUploadComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="RENT_PAYMENT_CREATE">
        @if (!result()) {
          <app-section-card title="Import a bank statement" [subtitle]="context.active().buildingName ?? 'All buildings'">
            <p class="lead">Download the statement from your bank's online banking as CSV (or open it in Excel and save as CSV),
              then upload it. Only money that came in is read. Nothing counts towards a balance until you confirm it in
              <a class="text-link" [routerLink]="RoutePaths.paymentReports">Payments to confirm</a>.</p>
            <app-file-upload label="Bank statement (CSV)" [types]="sheetTypes" [maxSizeMb]="5"
                             hint="One month at a time works best." (fileChange)="pick($event)" />
            @if (checking()) { <p class="muted">Reading the statement…</p> }
            @if (error(); as apiError) {
              <app-error-card title="Could not read the statement" [message]="apiError.message" [details]="apiError.details" />
            }
          </app-section-card>

          @if (preview(); as p) {
            <div class="kpi-grid">
              <div class="kpi kpi--good"><span class="kpi__label">New</span><span class="kpi__value">{{ p.newLines }}</span>
                <span class="kpi__note">{{ money(p.newTotal) }} to add</span></div>
              <div class="kpi"><span class="kpi__label">Already in Unitwise</span><span class="kpi__value">{{ p.duplicates }}</span>
                <span class="kpi__note">Left out</span></div>
              <div class="kpi" [class.kpi--bad]="p.unreadable > 0"><span class="kpi__label">Could not read</span><span class="kpi__value">{{ p.unreadable }}</span>
                <span class="kpi__note">Check these lines</span></div>
              <div class="kpi"><span class="kpi__label">Money out</span><span class="kpi__value">{{ p.skipped }}</span>
                <span class="kpi__note">Not rent; ignored</span></div>
            </div>

            <app-section-card title="Check the lines" [subtitle]="columnsUsed(p)">
              @if (p.lines.length === 0) {
                <p class="muted">No money in was found on this statement.</p>
              } @else {
                <div class="table-scroll">
                  <table appCardTable class="table">
                    <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th class="num">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      @for (l of p.lines; track l.line) {
                        <tr [class.row-muted]="l.status !== 'NEW'">
                          <td data-label="Date">{{ l.date ? date(l.date) : '—' }}</td>
                          <td class="card-title"><div class="cell-stack">
                            <span>{{ l.description || '—' }}</span>
                            @if (l.roomLabel) { <span class="muted small">For {{ l.roomLabel | roomTitle }} ({{ l.accountReference }})</span> }
                          </div></td>
                          <td data-label="Reference"><span class="mono">{{ l.reference || '—' }}</span>
                            @if (l.referenceMade) { <span class="muted small block">None on the statement</span> }</td>
                          <td class="num" data-label="Amount"><strong>{{ money(l.amount) }}</strong></td>
                          <td data-label="Status">
                            <span class="status-chip" [class]="'status-chip status-chip--' + status(l).tone">{{ status(l).label }}</span>
                            @for (n of l.notes; track n) { <span class="muted small block">{{ n }}</span> }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="button-row">
                  <button type="button" class="btn btn-primary" [disabled]="saving() || p.newLines === 0" (click)="commit(p)">
                    {{ saving() ? 'Adding…' : 'Add ' + p.newLines + ' to payments to confirm' }}
                  </button>
                </div>
              }
            </app-section-card>
          }
        } @else {
          <app-section-card title="Statement added" [subtitle]="resultSummary()">
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead><tr><th>Line</th><th>Reference</th><th class="num">Amount</th><th>Result</th></tr></thead>
                <tbody>
                  @for (r of result()!.results; track r.line) {
                    <tr [class.row-muted]="!r.added">
                      <td data-label="Line">{{ r.line }}</td>
                      <td class="card-title"><span class="mono">{{ r.reference }}</span></td>
                      <td class="num" data-label="Amount">{{ money(r.amount) }}</td>
                      <td data-label="Result">{{ r.message }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="button-row">
              <a class="btn btn-primary" [routerLink]="RoutePaths.paymentReports">Go to payments to confirm</a>
              <button type="button" class="btn btn-secondary" (click)="reset()">Import another statement</button>
            </div>
          </app-section-card>
        }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .lead { margin: 0 0 var(--space-3); }
    .small { font-size: var(--text-xs); }
    .block { display: block; }
    .row-muted td { opacity: 0.7; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BankStatementImportPageComponent implements HasUnsavedChanges {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly toasts = inject(NotificationService);

  readonly sheetTypes = ['text/csv', 'application/vnd.ms-excel'] as const;
  readonly checking = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly preview = signal<StatementPreview | null>(null);
  readonly result = signal<StatementCommit | null>(null);
  private fileName: string | null = null;

  readonly resultSummary = computed(() => {
    const r = this.result();
    if (!r) {
      return '';
    }
    const parts = [`${r.added} added`];
    if (r.matched) {
      parts.push(`${r.matched} matched a tenant's report`);
    }
    if (r.notAdded) {
      parts.push(`${r.notAdded} not added`);
    }
    return parts.join(' · ');
  });

  hasUnsavedChanges(): boolean {
    return !!this.preview()?.newLines && !this.result();
  }

  async pick(file: File | null): Promise<void> {
    const agencyId = this.context.agencyId();
    this.preview.set(null);
    this.error.set(null);
    this.fileName = file?.name ?? null;
    if (!file || agencyId === null) {
      return;
    }
    const body = new FormData();
    body.append('file', file);
    this.checking.set(true);
    try {
      this.preview.set(await firstValueFrom(this.http
        .post<ApiResponse<StatementPreview>>(`${this.apiUrl}/${ApiUrls.bankStatementPreview(agencyId)}`, body)
        .pipe(map((r) => r.data))));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.checking.set(false);
    }
  }

  async commit(p: StatementPreview): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.saving.set(true);
    try {
      const result = await firstValueFrom(this.http
        .post<ApiResponse<StatementCommit>>(`${this.apiUrl}/${ApiUrls.bankStatementCommit(agencyId)}`, {
          lines: p.lines.filter((l) => l.status === 'NEW'),
          buildingId: this.context.buildingId(),
          statementName: this.fileName
        })
        .pipe(map((r) => r.data)));
      this.result.set(result);
      this.toasts.push(result.notAdded ? 'warning' : 'success', `${result.added} payment${result.added === 1 ? '' : 's'} added to payments to confirm.`);
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  reset(): void {
    this.preview.set(null);
    this.result.set(null);
    this.error.set(null);
  }

  columnsUsed(p: StatementPreview): string {
    const c = p.columns;
    return `Read from: ${[c['date'], c['description'], c['reference'], c['credit'] ?? c['amount']].filter(Boolean).join(', ')}`;
  }

  status(l: StatementLine): { label: string; tone: string } {
    return STATUS[l.status];
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
