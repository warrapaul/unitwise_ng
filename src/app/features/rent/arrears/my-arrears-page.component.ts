import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { TenantArrearsDetail } from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-my-arrears-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="My rent statement">
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="loadMonth()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Month</span><input type="month" formControlName="month"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Load month</button>
              <button type="button" class="btn btn-secondary" (click)="loadCurrent()">Current month</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading your statement..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="loadCurrent()" />
      } @else if (!arrears()) {
        <app-empty-state title="Nothing to show" description="No rent statement exists for that month yet." />
      } @else if (arrears(); as detail) {
        <app-section-card [title]="detail.monthDisplay || 'Statement'">
          <dl class="detail-grid">
            <div><dt>Due date</dt><dd>{{ formatDate(detail.dueDate) }}</dd></div>
            <div><dt>Base rent</dt><dd>{{ detail.baseRent ?? '-' }}</dd></div>
            <div><dt>Rent paid</dt><dd>{{ detail.rentPaid ?? '-' }}</dd></div>
            <div><dt>Utilities</dt><dd>{{ detail.totalUtilities ?? '-' }}</dd></div>
            <div><dt>Other charges</dt><dd>{{ detail.totalOtherCharges ?? '-' }}</dd></div>
            <div><dt>Late fee</dt><dd>{{ detail.lateFee ?? '-' }}</dd></div>
            <div><dt>Credit applied</dt><dd>{{ detail.creditApplied ?? '-' }}</dd></div>
            <div><dt>Total due</dt><dd><strong>{{ detail.totalDue ?? '-' }}</strong></dd></div>
            <div><dt>Total paid</dt><dd><strong>{{ detail.totalPaid ?? '-' }}</strong></dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <div class="chip-row">
                  <app-status-chip [status]="detail.paymentStatus" />
                  @if (detail.isOverdue) {
                    <span class="status-chip status-chip--danger">Overdue</span>
                  }
                </div>
              </dd>
            </div>
          </dl>
        </app-section-card>

        <app-section-card title="Utilities">
          @if ((detail.utilities ?? []).length === 0) {
            <p class="muted">No utility charges this month.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Utility</th><th>Consumption</th><th>Rate</th><th>Amount</th><th>Paid</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (utility of detail.utilities ?? []; track utility.name) {
                    <tr>
                      <td>{{ utility.name || '-' }}</td>
                      <td>{{ utility.consumption ?? '-' }}{{ utility.unit ? ' ' + utility.unit : '' }}</td>
                      <td>{{ utility.unitRate ?? '-' }}</td>
                      <td>{{ utility.amount ?? '-' }}</td>
                      <td>{{ utility.amountPaid ?? '-' }}</td>
                      <td>{{ utility.status | humanLabel }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        <app-section-card title="Other charges">
          @if ((detail.otherCharges ?? []).length === 0) {
            <p class="muted">No other charges this month.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Charge</th><th>Amount</th><th>Paid</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  @for (charge of detail.otherCharges ?? []; track charge.name) {
                    <tr>
                      <td>{{ charge.name || '-' }}</td>
                      <td>{{ charge.amount ?? '-' }}</td>
                      <td>{{ charge.amountPaid ?? '-' }}</td>
                      <td>{{ charge.reason || '-' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyArrearsPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly arrears = signal<TenantArrearsDetail | null>(null);

  readonly form = this.formBuilder.group({
    month: this.currentMonth()
  });

  ngOnInit(): void {
    void this.loadCurrent();
  }

  async loadCurrent(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.arrears.set(await firstValueFrom(this.rentService.getMyCurrentArrears()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMonth(): Promise<void> {
    const month = this.form.getRawValue().month;
    if (!month) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.arrears.set(await firstValueFrom(this.rentService.getMyArrearsForMonth(month)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
