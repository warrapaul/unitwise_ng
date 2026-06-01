import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

@Component({
  selector: 'app-ecommerce-dashboard-page',
  standalone: true,
  imports: [RouterLink, SectionCardComponent],
  template: `
    <section class="stack">
      <app-section-card title="Ecommerce">
        <p class="muted intro">
          Minimal admin hub for catalog, orders, stores, and customer views.
        </p>

        <div class="grid-auto cards">
          <a routerLink="/ecommerce/products" class="panel card-link">
            <p class="eyebrow">Catalog</p>
            <h3>Products</h3>
            <p class="muted">Browse, filter, and inspect product records.</p>
          </a>
          <a routerLink="/ecommerce/orders" class="panel card-link">
            <p class="eyebrow">Sales</p>
            <h3>Orders</h3>
            <p class="muted">Review order status and update fulfilment.</p>
          </a>
          <a routerLink="/ecommerce/categories" class="panel card-link">
            <p class="eyebrow">Catalog</p>
            <h3>Categories</h3>
            <p class="muted">Manage the category hierarchy and visibility.</p>
          </a>
          <a routerLink="/ecommerce/stores" class="panel card-link">
            <p class="eyebrow">Operations</p>
            <h3>Stores</h3>
            <p class="muted">Track pickup locations and branch details.</p>
          </a>
          <a routerLink="/ecommerce/customers" class="panel card-link">
            <p class="eyebrow">People</p>
            <h3>Customers</h3>
            <p class="muted">View ecommerce customers and contact data.</p>
          </a>
        </div>
      </app-section-card>
    </section>
  `,
  styles: [`
    .intro {
      margin-bottom: 0.25rem;
    }

    .cards {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .card-link {
      padding: 1rem;
      display: grid;
      gap: 0.4rem;
      border-radius: 18px;
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }

    .card-link:hover {
      transform: translateY(-1px);
      border-color: rgba(79, 132, 217, 0.2);
      background: rgba(79, 132, 217, 0.04);
    }

    h3, p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcommerceDashboardPageComponent {}
