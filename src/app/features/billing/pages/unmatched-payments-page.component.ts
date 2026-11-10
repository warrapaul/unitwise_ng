import { PhonePipe } from '../../../shared/pipes/phone.pipe';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { BillingInvoice, BillingPayment, PAYMENT_METHOD_LABELS } from '../billing.models';
import { BillingService } from '../billing.service';
import { kes } from '../billing.models';

/**
 * Money that reached the platform paybill naming no invoice or agency code we know. Each one is
 * placed by hand: on an agency's invoice, or on its account as credit. Nothing here is guessed.
 */
@Component({
  selector: 'app-unmatched-payments-page',
  standalone: true,
  imports: [PhonePipe, CardTableDirective, ReactiveFormsModule, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, DialogComponent, EntityPickerComponent, ErrorCardComponent],
  template: `
    <section class="stack">
      <app-section-card title="Unmatched payments" subtitle="Paid to the platform paybill with an account we did not recognise. Place each on the agency it came from.">
        @if (loading()) {
          <app-loading-state label="Loading payments..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else if (payments().length === 0) {
          <p class="muted">Nothing waiting. Every payment found its invoice or agency.</p>
        } @else {
          <div class="table-scroll">
            <table appCardTable class="table">
              <thead><tr><th>Received</th><th>Payer</th><th>Account typed</th><th>Reference</th><th class="num">Amount</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                @for (p of payments(); track p.id) {
                  <tr>
                    <td>{{ when(p.paidAt || p.createdAt) }}</td>
                    <td><div class="cell-stack"><span>{{ p.payerName || '—' }}</span><span class="muted">{{ (p.payerPhone | phone) || '' }}</span></div></td>
                    <td class="mono">{{ p.accountReference || '—' }}</td>
                    <td class="mono">{{ p.providerReference || '—' }}<span class="muted"> · {{ methodLabels[p.method] }}</span></td>
                    <td class="num"><strong>{{ money(p.amount) }}</strong></td>
                    <td class="row-action"><button type="button" class="btn btn-primary btn-sm" (click)="open(p)">Place</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </section>

    @if (placing(); as p) {
      <app-dialog [title]="'Place ' + money(p.amount)" [subtitle]="'Reference ' + (p.providerReference || '—') + ' · account typed ' + (p.accountReference || '—')"
                  width="32rem" (closed)="placing.set(null)">
        <div class="stack">
          <label class="field">
            <span>Agency it came from</span>
            <app-entity-picker [config]="pickers.agency" [formControl]="agencyPick" placeholder="Find the agency" />
          </label>
          @if (agencyPick.value) {
            <label class="field">
              <span>Put it on</span>
              <select [value]="invoiceId() ?? ''" (change)="invoiceId.set($any($event.target).value ? +$any($event.target).value : null)">
                <option value="">The agency's account (oldest unpaid invoice first, then credit)</option>
                @for (invoice of agencyInvoices(); track invoice.id) {
                  <option [value]="invoice.id">{{ invoice.invoiceNumber }} — {{ money(invoice.balance) }} owing</option>
                }
              </select>
            </label>
          }
          <label class="field">
            <span>Note <span class="muted">(optional)</span></span>
            <input [value]="note()" (input)="note.set($any($event.target).value)" maxlength="500">
          </label>
          @if (placeError(); as apiError) { <app-error-card title="Not placed" [message]="apiError.message" [details]="apiError.details" /> }
        </div>
        <div dialog-actions>
          <button type="button" class="btn btn-primary" [disabled]="busy() || !agencyPick.value" (click)="place(p)">{{ busy() ? 'Placing…' : 'Place payment' }}</button>
          <button type="button" class="btn btn-secondary" (click)="placing.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .row-action { text-align: right; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UnmatchedPaymentsPageComponent implements OnInit {
  readonly methodLabels = PAYMENT_METHOD_LABELS;
  readonly pickers = inject(EntityPickerRegistry);
  private readonly billing = inject(BillingService);
  private readonly toasts = inject(NotificationService);

  readonly payments = signal<BillingPayment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly placing = signal<BillingPayment | null>(null);
  readonly agencyInvoices = signal<BillingInvoice[]>([]);
  readonly invoiceId = signal<number | null>(null);
  readonly note = signal('');
  readonly busy = signal(false);
  readonly placeError = signal<ApiError | null>(null);
  readonly agencyPick = new FormControl<number | null>(null);

  constructor() {
    this.agencyPick.valueChanges.subscribe((agencyId) => {
      this.invoiceId.set(null);
      this.agencyInvoices.set([]);
      if (agencyId) {
        firstValueFrom(this.billing.invoices(agencyId))
          .then((list) => this.agencyInvoices.set(list.filter((i) => i.status === 'ISSUED' && Number(i.balance) > 0)))
          .catch(() => this.agencyInvoices.set([]));
      }
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.payments.set(await firstValueFrom(this.billing.unmatchedPayments()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  open(payment: BillingPayment): void {
    this.agencyPick.setValue(null);
    this.note.set('');
    this.placeError.set(null);
    this.placing.set(payment);
  }

  async place(payment: BillingPayment): Promise<void> {
    const agencyId = this.agencyPick.value;
    if (!agencyId) {
      return;
    }
    this.busy.set(true);
    this.placeError.set(null);
    try {
      await firstValueFrom(this.billing.allocatePayment(payment.id, {
        invoiceId: this.invoiceId(),
        agencyId: this.invoiceId() ? null : agencyId,
        notes: this.note().trim() || null
      }));
      this.toasts.push('success', 'Payment placed.');
      this.placing.set(null);
      this.payments.update((list) => list.filter((p) => p.id !== payment.id));
    } catch (error) {
      this.placeError.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }

  when(value: string | null | undefined): string {
    return value ? displayDateTime(value) : '—';
  }
}
