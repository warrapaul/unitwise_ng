import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { displayDate } from '../../../shared/utils/display-date.util';
import { saveDownload } from '../../../shared/utils/download.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatCurrency, monthKey, monthLabel } from '../../../shared/utils/format.util';
import { StatementViewComponent } from '../components/statement-view.component';
import { MyOwnerAccount, OwnerPayout, OwnerStatement, PAYOUT_METHOD_LABELS } from '../owners.models';
import { OwnersService } from '../owners.service';

/**
 * The landlord's own view of what an agency manages for them: the month so far, the statements the
 * agency has sent, and the money it has paid them. Read-only; nothing here changes anything.
 */
@Component({
  selector: 'app-my-properties-page',
  standalone: true,
  imports: [CardTableDirective, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent, MonthNavComponent,
    SectionCardComponent, StatementViewComponent],
  template: `
    <section class="stack">
      @if (loading() && accounts().length === 0) {
        <app-loading-state label="Loading your buildings…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="loadAccounts()" />
      } @else if (accounts().length === 0) {
        @if (!compact()) {
          <app-empty-state title="No buildings yet"
                           description="When an agency managing your buildings links your Unitwise ID, your rent, expenses and statements appear here." />
        }
      } @else {
        @if (accounts().length > 1) {
          <div class="filter-chips" aria-label="Agency">
            @for (a of accounts(); track a.ownerId) {
              <button type="button" class="filter-chip" [attr.aria-pressed]="a.ownerId === active()?.ownerId" (click)="pick(a)">{{ a.agencyName }}</button>
            }
          </div>
        }

        <app-section-card [title]="compact() ? 'Your buildings this month' : 'This month'" [subtitle]="subtitle()">
          <app-month-nav actions [(month)]="month" />
          @if (month() === thisMonth) {
            <p class="muted hint">So far this month. The agency's statement, once sent, is the final word.</p>
          }
          @if (figures(); as s) {
            <app-statement-view [statement]="s" />
          } @else {
            <app-loading-state [compact]="true" label="Working out the month…" />
          }
        </app-section-card>

        @if (!compact()) {
          <app-section-card title="Statements" subtitle="Sent to you by the agency">
            @if (statements().length === 0) {
              <p class="muted">No statements sent yet.</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Month</th><th class="num">Collected</th><th class="num">Commission</th><th class="num">Balance due to you</th><th><span class="visually-hidden">Download</span></th></tr></thead>
                  <tbody>
                    @for (st of statements(); track st.id) {
                      <tr>
                        <td class="card-title">{{ monthOf(st.month) }}</td>
                        <td class="num" data-label="Collected">{{ money(st.rentCollected) }}</td>
                        <td class="num" data-label="Commission">{{ money(st.commission) }}</td>
                        <td class="num" data-label="Balance due to you"><strong>{{ money(st.closingBalance) }}</strong></td>
                        <td class="row-action"><button type="button" class="btn btn-secondary" (click)="download(st)">PDF</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <app-section-card title="Money paid to you">
            @if (payouts().length === 0) {
              <p class="muted">Nothing recorded yet.</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Date</th><th>Kind</th><th>How</th><th class="num">Amount</th></tr></thead>
                  <tbody>
                    @for (p of payouts(); track p.id) {
                      <tr>
                        <td class="card-title">{{ date(p.paidOn) }}</td>
                        <td data-label="Kind">{{ p.kind === 'ADVANCE' ? 'Advance' : 'Payout' }}</td>
                        <td data-label="How">{{ p.method ? methods[p.method] : '—' }}@if (p.reference) { · <span class="mono">{{ p.reference }}</span> }</td>
                        <td class="num" data-label="Amount"><strong>{{ money(p.amount) }}</strong></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
    .hint { margin: 0 0 var(--space-3); font-size: var(--text-sm); }
    .row-action { width: 1%; text-align: right; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyPropertiesPageComponent {
  /** On the home dashboard: just the month, nothing to empty-state about. */
  readonly compact = input(false);

  private readonly owners = inject(OwnersService);
  private readonly toasts = inject(NotificationService);

  readonly methods = PAYOUT_METHOD_LABELS;
  readonly thisMonth = monthKey();
  readonly month = signal(monthKey());
  readonly accounts = signal<MyOwnerAccount[]>([]);
  readonly active = signal<MyOwnerAccount | null>(null);
  readonly figures = signal<OwnerStatement | null>(null);
  readonly statements = signal<OwnerStatement[]>([]);
  readonly payouts = signal<OwnerPayout[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly subtitle = computed(() => {
    const a = this.active();
    return a ? `${monthLabel(this.month())} · managed by ${a.agencyName}` : monthLabel(this.month());
  });

  constructor() {
    void this.loadAccounts();
    effect(() => {
      const account = this.active();
      const month = this.month();
      if (account) {
        untracked(() => void this.loadMonth(account.ownerId, month));
      }
    });
  }

  async loadAccounts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const accounts = await firstValueFrom(this.owners.myAccounts());
      this.accounts.set(accounts);
      if (accounts.length) {
        this.pick(accounts[0]);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  pick(account: MyOwnerAccount): void {
    this.active.set(account);
    if (!this.compact()) {
      void this.loadHistory(account.ownerId);
    }
  }

  private async loadMonth(ownerId: number, month: string): Promise<void> {
    this.figures.set(null);
    try {
      this.figures.set(await firstValueFrom(this.owners.myMonth(ownerId, `${month}-01`)));
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    }
  }

  private async loadHistory(ownerId: number): Promise<void> {
    try {
      const [statements, payouts] = await Promise.all([
        firstValueFrom(this.owners.myStatements(ownerId, { page: 0, size: 24 })),
        firstValueFrom(this.owners.myPayouts(ownerId, { page: 0, size: 50 }))
      ]);
      this.statements.set(statements.items);
      this.payouts.set(payouts.items);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    }
  }

  async download(statement: OwnerStatement): Promise<void> {
    try {
      const response = await firstValueFrom(this.owners.myStatementPdf(statement.ownerId, statement.id!));
      saveDownload(response, `statement-${statement.month.slice(0, 7)}.pdf`);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    }
  }

  monthOf(date: string): string {
    return monthLabel(date.slice(0, 7));
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
