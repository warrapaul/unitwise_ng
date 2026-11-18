import { HttpClient, HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { ApiUrls } from '../../../core/constants/api-urls';
import { ApiResponse } from '../../../core/models/api-response.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { API_URL } from '../../../core/tokens/api-url.token';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FileUploadComponent } from '../../../shared/components/files/file-upload/file-upload.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { displayDate } from '../../../shared/utils/display-date.util';
import { saveDownload } from '../../../shared/utils/download.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency, formatPhone } from '../../../shared/utils/format.util';

interface ImportRow {
  line: number;
  roomId?: number | null;
  roomName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  nationalIdNumber?: string | null;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  moveInDate?: string | null;
  balanceBroughtForward?: number | string | null;
  depositPaid?: number | string | null;
  status: 'READY' | 'ERROR';
  errors: string[];
  warnings: string[];
}

interface ImportPreview {
  rows: ImportRow[];
  ready: number;
  withErrors: number;
  roomsLeftEmpty: number;
}

interface ImportResult {
  line: number;
  roomName?: string | null;
  tenantName?: string | null;
  tenantId?: number | null;
  created: boolean;
  message?: string | null;
}

interface ImportCommit {
  created: number;
  failed: number;
  results: ImportResult[];
}

const SHEET_TYPES = ['text/csv', 'application/vnd.ms-excel'] as const;

/**
 * Moving a building's existing tenants into Unitwise: download its rooms, fill in who lives where,
 * upload, check every row, then save. Rows are saved one by one, so a refused row never stops
 * the others; nothing is saved until the landlord presses Import.
 */
@Component({
  selector: 'app-tenant-import-page',
  standalone: true,
  imports: [RouterLink, CardTableDirective, ContextGuardComponent, ErrorCardComponent, FileUploadComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard requirePermission="TENANT_CREATE" action="to import its tenants">
        @if (!result()) {
          <app-section-card title="1. Download the rooms sheet" [subtitle]="context.active().buildingName">
            <ol class="steps">
              <li>Download the sheet: one row per room, with the rent and deposit already filled in.</li>
              <li>Open it in Excel or Google Sheets and fill in the tenant of each occupied room: name and phone at least.</li>
              <li>Add any rent they owed before Unitwise, and the deposit you already hold. Leave rooms with no tenant blank.</li>
              <li>Save it as CSV and upload it below.</li>
            </ol>
            <button type="button" class="btn btn-secondary" [disabled]="downloading()" (click)="download()">
              {{ downloading() ? 'Preparing…' : 'Download rooms sheet' }}
            </button>
          </app-section-card>

          <app-section-card title="2. Upload it">
            <app-file-upload label="Filled-in sheet (CSV)" [types]="sheetTypes" [maxSizeMb]="2"
                             hint="Save as CSV from Excel; up to 500 tenants." (fileChange)="pick($event)" />
            @if (checking()) { <p class="muted">Checking the sheet…</p> }
            @if (error(); as apiError) {
              <app-error-card title="Could not read the sheet" [message]="apiError.message" [details]="apiError.details" />
            }
          </app-section-card>

          @if (preview(); as p) {
            <app-section-card title="3. Check and import" [subtitle]="summary(p)">
              @if (p.rows.length === 0) {
                <p class="muted">No tenants were filled in. Add at least a name and phone on a room's row.</p>
              } @else {
                <div class="table-scroll">
                  <table appCardTable class="table">
                    <thead>
                      <tr><th>Line</th><th>Room</th><th>Tenant</th><th class="num">Rent</th><th>Moved in</th>
                        <th class="num">Owed before</th><th class="num">Deposit held</th><th>Check</th></tr>
                    </thead>
                    <tbody>
                      @for (row of p.rows; track row.line) {
                        <tr [class.row-bad]="row.status === 'ERROR'">
                          <td data-label="Line">{{ row.line }}</td>
                          <td data-label="Room">{{ row.roomName || '—' }}</td>
                          <td class="card-title">
                            <div class="cell-stack">
                              <strong>{{ name(row) }}</strong>
                              @if (row.phoneNumber) { <span class="muted">{{ phone(row.phoneNumber) }}</span> }
                            </div>
                          </td>
                          <td class="num" data-label="Rent">{{ money(row.monthlyRent) }}</td>
                          <td data-label="Moved in">{{ row.moveInDate ? date(row.moveInDate) : '—' }}</td>
                          <td class="num" data-label="Owed before">{{ +(row.balanceBroughtForward ?? 0) > 0 ? money(row.balanceBroughtForward) : '—' }}</td>
                          <td class="num" data-label="Deposit held">{{ +(row.depositPaid ?? 0) > 0 ? money(row.depositPaid) : '—' }}</td>
                          <td data-label="Check">
                            @if (row.status === 'READY') {
                              <span class="status-chip status-chip--success">Ready</span>
                            } @else {
                              <ul class="problems">@for (e of row.errors; track e) { <li>{{ e }}</li> }</ul>
                            }
                            @for (w of row.warnings; track w) { <span class="muted small warn">{{ w }}</span> }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                <fieldset class="mode">
                  <legend>Their accounts</legend>
                  <label><input type="radio" name="mode" [checked]="!fullyManaged()" (change)="fullyManaged.set(false)">
                    Tenants can sign in later with their phone number</label>
                  <label><input type="radio" name="mode" [checked]="fullyManaged()" (change)="fullyManaged.set(true)">
                    I manage everything for them; they will not sign in</label>
                </fieldset>

                @if (p.withErrors > 0) {
                  <p class="muted">Rows with problems are left out. Fix them in the sheet and upload it again, or import the ready ones now.</p>
                }
                <div class="button-row">
                  <button type="button" class="btn btn-primary" [disabled]="saving() || p.ready === 0" (click)="commit(p)">
                    {{ saving() ? 'Importing…' : 'Import ' + p.ready + ' tenant' + (p.ready === 1 ? '' : 's') }}
                  </button>
                </div>
              }
            </app-section-card>
          }
        } @else {
          <app-section-card title="Import finished" [subtitle]="result()!.created + ' added' + (result()!.failed ? ', ' + result()!.failed + ' not added' : '')">
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead><tr><th>Line</th><th>Room</th><th>Tenant</th><th>Result</th></tr></thead>
                <tbody>
                  @for (r of result()!.results; track r.line) {
                    <tr [class.row-bad]="!r.created">
                      <td data-label="Line">{{ r.line }}</td>
                      <td data-label="Room">{{ r.roomName || '—' }}</td>
                      <td class="card-title">
                        @if (r.created && r.tenantId) {
                          <a class="text-link" [routerLink]="tenantLink(r.tenantId)">{{ r.tenantName }}</a>
                        } @else { {{ r.tenantName }} }
                      </td>
                      <td data-label="Result">
                        <span class="status-chip" [class]="'status-chip status-chip--' + (r.created ? 'success' : 'danger')">{{ r.created ? 'Added' : 'Not added' }}</span>
                        <span class="muted small result-note">{{ r.message }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="button-row">
              <a class="btn btn-primary" [routerLink]="RoutePaths.tenants">See tenants</a>
              <button type="button" class="btn btn-secondary" (click)="reset()">Import another sheet</button>
            </div>
          </app-section-card>
        }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .steps { margin: 0 0 var(--space-3); padding-left: 1.25rem; display: grid; gap: var(--space-1); }
    .problems { margin: 0; padding-left: 1rem; color: var(--danger); font-size: var(--text-sm); }
    .warn, .result-note { display: block; }
    .small { font-size: var(--text-xs); }
    .row-bad td:first-child { box-shadow: inset 3px 0 0 var(--danger); }
    .mode { border: 0; padding: 0; margin: var(--space-4) 0; display: grid; gap: var(--space-2); }
    .mode legend { font-weight: var(--weight-semibold); margin-bottom: var(--space-1); }
    .mode label { display: flex; gap: var(--space-2); align-items: center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantImportPageComponent implements HasUnsavedChanges {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly toasts = inject(NotificationService);

  readonly sheetTypes = SHEET_TYPES;
  readonly downloading = signal(false);
  readonly checking = signal(false);
  readonly saving = signal(false);
  readonly fullyManaged = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly preview = signal<ImportPreview | null>(null);
  readonly result = signal<ImportCommit | null>(null);

  private readonly scope = computed(() => {
    const active = this.context.active();
    return active.agencyId !== null && active.buildingId !== null ? { agencyId: active.agencyId, buildingId: active.buildingId } : null;
  });

  hasUnsavedChanges(): boolean {
    return !!this.preview()?.ready && !this.result();
  }

  async download(): Promise<void> {
    const scope = this.scope();
    if (!scope) {
      return;
    }
    this.downloading.set(true);
    try {
      const response = await firstValueFrom(this.http.get(`${this.apiUrl}/${ApiUrls.tenantImportTemplate(scope.agencyId, scope.buildingId)}`,
        { responseType: 'blob', observe: 'response' })) as HttpResponse<Blob>;
      saveDownload(response, 'rooms-for-tenants.csv');
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }

  async pick(file: File | null): Promise<void> {
    const scope = this.scope();
    this.preview.set(null);
    this.error.set(null);
    if (!file || !scope) {
      return;
    }
    const body = new FormData();
    body.append('file', file);
    this.checking.set(true);
    try {
      this.preview.set(await firstValueFrom(this.http
        .post<ApiResponse<ImportPreview>>(`${this.apiUrl}/${ApiUrls.tenantImportPreview(scope.agencyId, scope.buildingId)}`, body)
        .pipe(map((r) => r.data))));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.checking.set(false);
    }
  }

  async commit(p: ImportPreview): Promise<void> {
    const scope = this.scope();
    if (!scope) {
      return;
    }
    this.saving.set(true);
    try {
      const result = await firstValueFrom(this.http
        .post<ApiResponse<ImportCommit>>(`${this.apiUrl}/${ApiUrls.tenantImportCommit(scope.agencyId, scope.buildingId)}`, {
          rows: p.rows.filter((row) => row.status === 'READY'),
          creationMode: this.fullyManaged() ? 'FULLY_MANAGED' : 'LANDLORD_ASSISTED'
        })
        .pipe(map((r) => r.data)));
      this.result.set(result);
      this.toasts.push(result.failed ? 'warning' : 'success',
        `${result.created} tenant${result.created === 1 ? '' : 's'} added${result.failed ? `, ${result.failed} not added` : ''}.`);
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

  summary(p: ImportPreview): string {
    const parts = [`${p.ready} ready`];
    if (p.withErrors) {
      parts.push(`${p.withErrors} with problems`);
    }
    if (p.roomsLeftEmpty) {
      parts.push(`${p.roomsLeftEmpty} rooms left blank`);
    }
    return parts.join(' · ');
  }

  tenantLink(tenantId: number): string | null {
    const scope = this.scope();
    return scope ? RoutePaths.tenantDetail(scope.agencyId, scope.buildingId, tenantId) : null;
  }

  name(row: ImportRow): string {
    return [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ') || '—';
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  phone(value: string): string {
    return formatPhone(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
