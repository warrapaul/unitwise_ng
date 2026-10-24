import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { PhoneSearchComponent } from '../../../shared/components/phone-search/phone-search.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

/**
 * The desk's most common job, on the dashboard: a number off the phone or a
 * chat, pasted, and straight to that customer (or to adding them) — from
 * there, an order in one more click.
 */
@Component({
  selector: 'app-customer-quick-find',
  standalone: true,
  imports: [PhoneSearchComponent, SectionCardComponent],
  template: `
    <app-section-card title="Find or add a customer" subtitle="Paste their phone number to see them, their addresses and orders — or add them.">
      <app-phone-search (search)="open($event)" />
    </app-section-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerQuickFindComponent {
  private readonly router = inject(Router);

  open(phone: string): void {
    void this.router.navigate([RoutePaths.ecomCustomerCreate], { queryParams: { phone } });
  }
}
