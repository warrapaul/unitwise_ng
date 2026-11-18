import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { formatCurrency } from '../../../shared/utils/format.util';
import { OwnerStatement } from '../owners.models';

/**
 * An owner's month: the four figures that matter, how the balance is reached, and each building's
 * part. The same for the agency preparing it and the owner reading it, so the two never disagree.
 */
@Component({
  selector: 'app-statement-view',
  standalone: true,
  imports: [CardTableDirective],
  template: `
    @let s = statement();
    <div class="kpi-grid" aria-label="The month in figures">
      <div class="kpi" [class.kpi--good]="+s.rentCollected > 0">
        <span class="kpi__label">Rent collected</span>
        <span class="kpi__value">{{ money(s.rentCollected) }}</span>
        <span class="kpi__note">Received this month</span>
      </div>
      <div class="kpi" [class.kpi--bad]="+s.arrears > 0">
        <span class="kpi__label">Still owed by tenants</span>
        <span class="kpi__value">{{ money(s.arrears) }}</span>
        <span class="kpi__note">Not in the balance yet</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Expenses and commission</span>
        <span class="kpi__value">{{ money(+s.expensesByAgency + +s.commission) }}</span>
        <span class="kpi__note">{{ money(s.commission) }} commission</span>
      </div>
      <div class="kpi" [class.kpi--good]="+s.closingBalance > 0" [class.kpi--bad]="+s.closingBalance < 0">
        <span class="kpi__label">{{ +s.closingBalance < 0 ? 'Owner owes the agency' : 'Balance due to owner' }}</span>
        <span class="kpi__value">{{ money(abs(s.closingBalance)) }}</span>
        <span class="kpi__note">After {{ money(+s.payouts + +s.advances) }} already sent</span>
      </div>
    </div>

    <div class="split">
      <section class="ledger" aria-label="How the balance is worked out">
        <h3 class="sub">How the balance is worked out</h3>
        <dl>
          <div><dt>Brought forward</dt><dd>{{ money(s.openingBalance) }}</dd></div>
          <div><dt>Rent collected</dt><dd>+ {{ money(s.rentCollected) }}</dd></div>
          <div><dt>Expenses paid by the agency</dt><dd>− {{ money(s.expensesByAgency) }}</dd></div>
          <div><dt>Management commission</dt><dd>− {{ money(s.commission) }}</dd></div>
          <div><dt>Paid to the owner</dt><dd>− {{ money(s.payouts) }}</dd></div>
          @if (+s.advances > 0) { <div><dt>Advances</dt><dd>− {{ money(s.advances) }}</dd></div> }
          <div class="total"><dt>Balance</dt><dd>{{ money(s.closingBalance) }}</dd></div>
        </dl>
        @if (+s.expensesByOwner > 0) {
          <p class="muted note">The owner also paid {{ money(s.expensesByOwner) }} of expenses directly; not counted above.</p>
        }
        @if (s.notes) { <p class="note"><strong>Note:</strong> {{ s.notes }}</p> }
      </section>

      <section aria-label="By building">
        <h3 class="sub">By building</h3>
        @if (s.buildings.length === 0) {
          <p class="muted">No buildings are linked to this owner.</p>
        } @else {
          <div class="table-scroll">
            <table appCardTable class="table">
              <thead><tr><th>Building</th>@if (showOccupancy()) {<th>Occupied</th>}<th class="num">Collected</th><th class="num">Owed</th><th class="num">Expenses</th><th class="num">Commission</th></tr></thead>
              <tbody>
                @for (b of s.buildings; track b.buildingId) {
                  <tr>
                    <td class="card-title"><div class="cell-stack"><strong>{{ b.name }}</strong><span class="muted">{{ b.commissionLabel }}</span></div></td>
                    @if (showOccupancy()) { <td data-label="Occupied">{{ b.occupied ?? 0 }} of {{ b.rooms ?? 0 }}</td> }
                    <td class="num" data-label="Collected">{{ money(b.collected) }}</td>
                    <td class="num" data-label="Owed">{{ money(b.arrears) }}</td>
                    <td class="num" data-label="Expenses">{{ money(b.expensesByAgency) }}</td>
                    <td class="num" data-label="Commission">{{ money(b.commission) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: grid; gap: var(--space-4); }
    /* Shillings in the hundreds of thousands must not break mid-number in a half-width phone tile. */
    .kpi__value { white-space: nowrap; font-size: clamp(1.05rem, 4.6vw, 1.6rem); }
    .split { display: grid; gap: var(--space-5); grid-template-columns: minmax(0, 22rem) minmax(0, 1fr); align-items: start; }
    @media (max-width: 900px) { .split { grid-template-columns: minmax(0, 1fr); } }
    .sub { font-size: var(--font-subsection); margin: 0 0 var(--space-2); }
    dl { margin: 0; display: grid; }
    dl > div { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
    dt { color: var(--text); }
    dd { margin: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .total { font-weight: var(--weight-bold); border-bottom: 0; border-top: 2px solid var(--border-strong); }
    .note { font-size: var(--text-sm); margin: var(--space-2) 0 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatementViewComponent {
  readonly statement = input.required<OwnerStatement>();
  readonly showOccupancy = computed(() => this.statement().buildings.some((b) => b.rooms != null));

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  abs(value: number | string): number {
    return Math.abs(Number(value));
  }
}
