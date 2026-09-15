import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { StatsService } from '../stats.service';
import { StatTileComponent } from './stat-tile.component';
import { StatActionsComponent } from './stat-actions.component';
import { lowerIsBetter } from '../models/stat-direction.util';
import {
  StatBlock,
  StatMetric,
  TenantOverview,
  TenantProfileSummary,
  TenantRentStatement
} from '../models/stats.models';

/**
 * The tenant's own screen.
 *
 * Answers one question before any other: **do I owe anything, and by when**.
 * Everything else — the lease, the room, maintenance, the shop — is what they
 * come back for afterwards.
 *
 * Two states, not one. Before a tenancy is active the occupancy sections are
 * null server-side and onboarding carries the screen: what is still missing and
 * what an agency said about the documents already sent. Showing an empty rent
 * card to someone who has not moved in yet would be answering a question they
 * have not asked.
 */
@Component({
  selector: 'app-tenant-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    StatusChipComponent,
    HumanLabelPipe,
    StatTileComponent,
    StatActionsComponent
  ],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading your tenancy..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else if (overview(); as data) {
      <!--
        Only when there is a choice to make. One tenancy is not a switcher, it
        is the context, and the rest of the page already says which.
      -->
      @if ((data.profiles ?? []).length > 1) {
        <!--
          A switcher, not a statistic. Wrapped in a titled card it claimed the
          weight of a section and pushed the dashboard proper below the fold —
          while what it actually does is pick which of these figures you are
          looking at. So it sits above them as a strip, the way the shell's own
          context control does.
        -->
        <nav class="profiles" aria-label="Your tenancies">
          @for (profile of data.profiles ?? []; track profile.tenantId) {
            <button
              type="button"
              class="profile"
              [class.profile--on]="profile.tenantId === selectedTenantId()"
              [attr.aria-current]="profile.tenantId === selectedTenantId() ? 'true' : null"
              (click)="select(profile)"
            >
              <span class="profile__where">{{ profile.buildingName }} · {{ profile.roomName }}</span>
              <span class="profile__agency muted">{{ profile.agencyName }}</span>
              @if (profile.pendingActionCount) {
                <span class="profile__badge">{{ profile.pendingActionCount }}</span>
              }
            </button>
          }
        </nav>
      }

      <div class="dash">
      @if (data.needsAttention?.length) {
        <app-section-card title="Needs your attention" class="dash__wide">
          <app-stat-actions [items]="data.needsAttention ?? []" />
        </app-section-card>
      }

      <!-- ─── Not yet a resident: onboarding is the screen ─── -->
      @if (data.onboarding; as onboarding) {
        @if (!isResident()) {
          <app-section-card
            [title]="onboarding.currentStepLabel || 'Getting you moved in'"
            [subtitle]="stepCaption(onboarding.stepsCompleted, onboarding.stepsTotal)"
          >
            @if (onboarding.percentComplete !== null && onboarding.percentComplete !== undefined) {
              <div class="progress" role="img" [attr.aria-label]="'Setup ' + percent(onboarding.percentComplete) + ' complete'">
                <span class="progress__bar" [style.width.%]="number(onboarding.percentComplete)"></span>
              </div>
            }

            <div class="tiles">
              @for (metric of onboardingTiles(); track metric.key || metric.label; let first = $first) {
                <app-stat-tile [metric]="metric" [lead]="first" [lowerIsBetter]="direction(metric)" />
              }
            </div>

            <!--
              What the agency said, kept close to the documents it is about —
              a rejection an operator wrote is the one thing on this screen the
              tenant can act on immediately.
            -->
            @if ((onboarding.feedback ?? []).length > 0) {
              <h3 class="panel-title">From the agency</h3>
              <ul class="feedback">
                @for (note of onboarding.feedback ?? []; track note.documentId) {
                  <li [class.feedback--actionable]="note.actionable">
                    <strong>{{ note.documentType | humanLabel }}</strong>
                    <span>{{ note.note }}</span>
                    <span class="muted">{{ formatDate(note.recordedOn) }}</span>
                  </li>
                }
              </ul>
            }

            @if (onboarding.documentsEditable) {
              <div class="button-row">
                <a class="btn btn-primary" [routerLink]="RoutePaths.myTenantDocuments">Upload documents</a>
              </div>
            }
          </app-section-card>
        }

        @if ((onboarding.pendingInvitations ?? []).length > 0) {
          <app-section-card title="Invitations">
            @for (invite of onboarding.pendingInvitations ?? []; track invite.tenantId) {
              <article class="invite">
                <header>
                  <strong>{{ invite.buildingName }} · {{ invite.roomName }}</strong>
                  <span class="muted">{{ invite.agencyName }}</span>
                </header>
                <p class="muted">{{ invite.buildingAddress }}</p>
                <dl class="invite__terms">
                  <div><dt>Rent</dt><dd>{{ currency() }} {{ amount(invite.monthlyRent) }}</dd></div>
                  <div><dt>Deposit</dt><dd>{{ currency() }} {{ amount(invite.securityDeposit) }}</dd></div>
                  @if (invite.daysUntilExpiry !== null && invite.daysUntilExpiry !== undefined) {
                    <div><dt>Expires</dt><dd>{{ expiryLabel(invite.daysUntilExpiry) }}</dd></div>
                  }
                </dl>
                @if ((invite.requiredDocuments ?? []).length > 0) {
                  <p class="muted">Bring: {{ (invite.requiredDocuments ?? []).join(', ') }}</p>
                }
              </article>
            }
          </app-section-card>
        }
      }

      <!-- ─── A resident: rent leads ─── -->
      @if (isResident() && data.rent) {
        <app-section-card [title]="rentTitle()" [subtitle]="dueCaption()">
          <ng-container actions>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myRentPayments">Payment history</a>
          </ng-container>

          <div class="tiles">
            @for (metric of rentTiles(); track metric.key || metric.label; let first = $first) {
              <app-stat-tile [metric]="metric" [currency]="currency()" [lead]="first" [lowerIsBetter]="direction(metric)" />
            }
          </div>

          <!--
            A bill that can still change has to say so before the tenant plans
            around it — finding out later that the figure moved is worse than
            being told now that it might.
          -->
          @if (data.rent.isProvisional) {
            <p class="hint">
              This month is not final yet@if (data.rent.chargesPendingInput?.value) {
                <span> — {{ data.rent.chargesPendingInput!.value }} charge(s) still to be entered</span>
              }. The amount may change.
            </p>
          }

          @if ((data.rent.arrearsAging ?? []).length > 0) {
            <h3 class="panel-title">What is owed, by age</h3>
            <ul class="aging">
              @for (row of data.rent.arrearsAging ?? []; track row.key || row.label) {
                <li>
                  <span>{{ row.label }}</span>
                  <strong>{{ currency() }} {{ amount(row.amount) }}</strong>
                  @if (row.monthCount) {
                    <span class="muted">{{ row.monthCount }} month(s)</span>
                  }
                </li>
              }
            </ul>
          }

          @if (statementMonths().length > 0) {
            <h3 class="panel-title">Recent months</h3>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Month</th><th>Rent</th><th>Utilities</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (month of statementMonths(); track month.month) {
                    <tr>
                      <td>
                        {{ month.monthDisplay }}
                        @if (month.confirmed === false) {
                          <span class="muted">provisional</span>
                        }
                      </td>
                      <td>{{ amount(month.baseRent) }}</td>
                      <td>{{ amount(month.utilities) }}</td>
                      <td>{{ amount(month.totalDue) }}</td>
                      <td>{{ amount(month.totalPaid) }}</td>
                      <td>{{ amount(month.balance) }}</td>
                      <td><app-status-chip [status]="month.paymentStatus" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
      }

      @if (data.lease; as lease) {
        <app-section-card title="Your lease">
          <ng-container actions>
            @if (leaseId()) {
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myLeaseDetail(leaseId()!)">Open lease</a>
            }
          </ng-container>

          <div class="detail-groups">
            <dl class="facts">
              <div><dt>Status</dt><dd><app-status-chip [status]="lease.status" /></dd></div>
              <div><dt>Type</dt><dd>{{ lease.leaseType | humanLabel }}</dd></div>
              <div><dt>From</dt><dd>{{ formatDate(lease.startDate) }}</dd></div>
              <div><dt>To</dt><dd>{{ lease.endDate ? formatDate(lease.endDate) : 'Open-ended' }}</dd></div>
              @if (lease.noticePeriodDays) {
                <div><dt>Notice</dt><dd>{{ lease.noticePeriodDays }} days</dd></div>
              }
            </dl>
          </div>

          @if (lease.awaitingTenantSignature) {
            <p class="hint hint--warn">This lease is waiting for your signature.</p>
          } @else if (lease.daysUntilExpiry !== null && lease.daysUntilExpiry !== undefined && lease.daysUntilExpiry <= 90) {
            <p class="hint">
              Ends in {{ lease.daysUntilExpiry }} days@if (lease.inRenewalWindow) {
                <span> — renewal is open</span>
              }@if (lease.autoRenews) {
                <span> and it renews automatically</span>
              }.
            </p>
          }
        </app-section-card>
      }

      @if (data.residence; as home) {
        <app-section-card title="Your room">
          <div class="detail-groups">
            <dl class="facts">
              <div><dt>Room</dt><dd>{{ home.roomName }}</dd></div>
              <div><dt>Building</dt><dd>{{ home.buildingName }}</dd></div>
              @if (home.floorName) {
                <div><dt>Floor</dt><dd>{{ home.floorName }}</dd></div>
              }
              <div><dt>Since</dt><dd>{{ formatDate(home.movedInOn) }}</dd></div>
            </dl>
          </div>

          @if (home.buildingAddress) {
            <p class="muted">{{ home.buildingAddress }}</p>
          }

          <!-- The number to ring, on the screen where the reason to ring appears. -->
          @if (home.caretakerPhone || home.agencyPhone) {
            <div class="button-row">
              @if (home.caretakerPhone) {
                <a class="btn btn-secondary btn-sm" [href]="'tel:' + home.caretakerPhone">
                  Call {{ home.caretakerName || 'caretaker' }}
                </a>
              }
              @if (home.agencyPhone) {
                <a class="btn btn-secondary btn-sm" [href]="'tel:' + home.agencyPhone">Call the agency</a>
              }
            </div>
          }

          @if ((home.utilities ?? []).length > 0) {
            <h3 class="panel-title">Utilities on this room</h3>
            <div class="table-scroll">
              <table class="table">
                <thead><tr><th>Utility</th><th>Billing</th><th>Rate</th><th>Latest reading</th><th>Latest charge</th></tr></thead>
                <tbody>
                  @for (utility of home.utilities ?? []; track utility.name) {
                    <tr>
                      <td>{{ utility.name }}</td>
                      <td>{{ utility.billingType | humanLabel }}</td>
                      <td>{{ utility.unitRate ? amount(utility.unitRate) + ' / ' + (utility.unit || 'unit') : '—' }}</td>
                      <td>{{ utility.latestReading ?? '—' }}</td>
                      <td>{{ utility.latestAmount ? currency() + ' ' + amount(utility.latestAmount) : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
      }

      @for (group of groups(); track group.title) {
        <app-section-card [title]="group.title">
          <div class="tiles">
            @for (metric of group.metrics; track metric.key || metric.label; let first = $first) {
              <app-stat-tile [metric]="metric" [currency]="currencyFor(metric)" [lead]="first" [lowerIsBetter]="direction(metric)" />
            }
          </div>
        </app-section-card>
      }

      @if (timeline().length > 0) {
        <app-section-card title="Recently">
          <ul class="timeline">
            @for (entry of timeline(); track entry.key || entry.label) {
              <li>
                <span class="timeline__when">{{ formatDate(entry.occurredOn) }}</span>
                <span class="timeline__what">
                  @if (entry.targetPath) {
                    <a [routerLink]="entry.targetPath">{{ entry.label }}</a>
                  } @else {
                    {{ entry.label }}
                  }
                </span>
                @if (entry.amount) {
                  <span class="timeline__amount">{{ currency() }} {{ amount(entry.amount) }}</span>
                }
              </li>
            }
          </ul>
        </app-section-card>
      }
      </div>
    }
  `,
  styles: [`
    .dash {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr));
      gap: 1rem;
      align-items: start;
    }

    .dash__wide { grid-column: 1 / -1; }

    .dash > app-section-card { display: block; min-width: 0; }

    /*
     * Pack left rather than stretch. Stretching each column under a 16rem
     * cap left a ragged band of dead space after the last tile on a wide
     * card, which is what made short sections look unfinished.
     */
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9.5rem, 16rem));
      justify-content: start;
      gap: 0.5rem;
    }

    .tiles app-stat-tile { max-width: 16rem; }

    .panel-title {
      margin: 0.4rem 0 0;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    /* Sits above the dashboard, so it needs a little air beneath it. */
    .profiles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .profile {
      position: relative;
      display: grid;
      gap: 0.1rem;
      padding: 0.5rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .profile--on { border-color: var(--primary); background: var(--primary-tint); }
    .profile__where { font-weight: 700; font-size: 0.9rem; }
    .profile__agency { font-size: 0.75rem; }

    .profile__badge {
      position: absolute;
      top: -0.4rem;
      right: -0.4rem;
      min-width: 1.2rem;
      padding: 0 0.3rem;
      border-radius: 999px;
      background: var(--warning);
      color: #fff;
      font-size: 0.68rem;
      font-weight: 700;
      text-align: center;
    }

    .progress {
      height: 0.5rem;
      border-radius: 999px;
      background: var(--surface-2);
      overflow: hidden;
    }

    .progress__bar { display: block; height: 100%; background: var(--primary); }

    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.6rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; }
    .facts dt { font-size: 0.74rem; color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: 600; }

    .feedback, .aging, .timeline { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; font-size: 0.87rem; }
    .feedback li, .aging li { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }

    .feedback li {
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--border);
      border-left-width: 3px;
      border-radius: 10px;
    }

    .feedback--actionable { border-left-color: var(--warning); }

    .timeline li { display: flex; gap: 0.75rem; align-items: baseline; }
    .timeline__when { min-width: 6rem; font-variant-numeric: tabular-nums; color: var(--text-muted); font-size: 0.8rem; }
    .timeline__what { flex: 1; min-width: 0; }
    .timeline__amount { font-weight: 600; font-variant-numeric: tabular-nums; }

    .invite {
      display: grid;
      gap: 0.4rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    .invite header { display: grid; gap: 0.1rem; }
    .invite__terms { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0; }
    .invite__terms div { display: grid; gap: 0.1rem; }
    .invite__terms dt { font-size: 0.74rem; color: var(--text-muted); }
    .invite__terms dd { margin: 0; font-weight: 600; }

    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly overview = signal<TenantOverview | null>(null);
  private readonly statement = signal<TenantRentStatement | null>(null);
  readonly selectedTenantId = signal<number | null>(null);

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');

  /** Occupancy sections are null until the tenancy is active; the server decides. */
  readonly isResident = computed(() => !!this.overview()?.residence || !!this.overview()?.rent);

  readonly leaseId = computed(() => {
    // The lease summary carries no id of its own, so a link is only offered
    // where an action item pointed at one.
    const action = (this.overview()?.needsAttention ?? [])
      .find((item) => item.targetPath?.includes('/leases/'));
    const id = action?.targetPath?.split('/leases/')[1];
    return id && Number.isFinite(Number(id)) ? Number(id) : null;
  });

  readonly rentTitle = computed(() => {
    const rent = this.overview()?.rent;
    return rent?.isOverdue ? 'Rent — overdue' : 'Rent';
  });

  /** The sentence a tenant actually wants: how long have I got. */
  readonly dueCaption = computed(() => {
    const rent = this.overview()?.rent;
    if (!rent?.dueDate) {
      return null;
    }

    const due = this.formatDate(rent.dueDate);
    const days = rent.daysUntilDue;

    if (rent.isOverdue) {
      return days !== null && days !== undefined ? `Was due ${due}, ${Math.abs(days)} days ago` : `Was due ${due}`;
    }

    if (days === 0) {
      return `Due today, ${due}`;
    }

    return days ? `Due ${due}, in ${days} days` : `Due ${due}`;
  });

  readonly rentTiles = computed(() => pick(this.overview()?.rent as StatBlock | null,
    ['totalOutstanding', 'currentMonthDue', 'arrearsBroughtForward', 'lateFeesOutstanding', 'creditBalance', 'monthlyRent']));

  readonly onboardingTiles = computed(() => pick(this.overview()?.onboarding as StatBlock | null,
    ['documentsOutstanding', 'documentsRejected', 'documentsAwaitingReview', 'awaitingDecisionFor']));

  readonly statementMonths = computed(() =>
    this.statement()?.months ?? this.overview()?.rent?.statementHistory ?? []);

  readonly timeline = computed(() =>
    ((this.overview()?.activity as StatBlock | undefined)?.['timeline'] as { key?: string; label?: string; occurredOn?: string; amount?: number | string; targetPath?: string }[] | undefined) ?? []);

  readonly groups = computed(() => {
    const data = this.overview();
    if (!data) {
      return [];
    }

    return [
      { title: 'Messages and requests', metrics: pick(data.activity, ['unreadMessages', 'unreadNotifications', 'openChatConversations', 'pendingRoomApplications']) },
      { title: 'Maintenance', metrics: pick(data.maintenance, ['open', 'awaitingAcknowledgement', 'inProgress', 'completedThisPeriod']) },
      { title: 'Shopping', metrics: pick(data.shopping, ['activeOrders', 'outForDelivery', 'awaitingPayment', 'cartItems', 'availableVouchers', 'partialPaymentBalance']) }
    ].filter((group) => group.metrics.length > 0);
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const tenantId = this.selectedTenantId();
      const overview = await firstValueFrom(this.stats.getMyOverview(tenantId));
      this.overview.set(overview);
      this.selectedTenantId.set(overview.selectedProfile?.tenantId ?? tenantId ?? null);

      // The statement is the fuller history; the overview already carries enough
      // to render without it, so a failure here costs the table and nothing else.
      this.statement.set(await settle(this.stats.getMyRent(this.selectedTenantId())));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async select(profile: TenantProfileSummary): Promise<void> {
    if (profile.tenantId === this.selectedTenantId()) {
      return;
    }

    this.selectedTenantId.set(profile.tenantId ?? null);
    await this.reload();
  }

  direction(metric: StatMetric): boolean | null {
    return lowerIsBetter(metric);
  }

  currencyFor(metric: StatMetric): string | null {
    const isAmount = metric.unit == null
      && metric.denominator == null
      && (metric.changePoints === null || metric.changePoints === undefined)
      && typeof metric.value === 'string';

    return isAmount ? this.currency() : null;
  }

  stepCaption(completed?: StatMetric | null, total?: StatMetric | null): string | null {
    if (!completed?.value || !total?.value) {
      return null;
    }

    return `Step ${completed.value} of ${total.value}`;
  }

  expiryLabel(days: number): string {
    if (days <= 0) {
      return 'today';
    }

    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }

  number(value?: number | string | null): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  percent(value?: number | string | null): string {
    return `${this.number(value).toFixed(0)}%`;
  }

  amount(value?: number | string | null): string {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '—';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }
}

function pick(block: StatBlock | null | undefined, keys: string[]): StatMetric[] {
  if (!block) {
    return [];
  }

  return keys
    .map((key) => block[key] as StatMetric | undefined)
    .filter((metric): metric is StatMetric => !!metric && metric.value !== null && metric.value !== undefined);
}

async function settle<T>(source: Parameters<typeof firstValueFrom<T>>[0]): Promise<T | null> {
  try {
    return await firstValueFrom(source);
  } catch {
    return null;
  }
}
