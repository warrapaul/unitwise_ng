import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { CategoryDetail } from '../models/ecommerce.models';

@Component({
  selector: 'app-category-detail-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading category..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load category'" (retry)="reload()" />
      } @else if (category()) {
        <app-section-card [title]="category()?.name || 'Category detail'" [subtitle]="category()?.slug || null">
          <ng-container actions>
            <div class="detail-actions">
              <a class="btn btn-secondary" routerLink="/ecommerce/categories">Back to categories</a>
              <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          <div class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Overview</p>
              <p class="muted">{{ category()?.description || 'No description provided.' }}</p>
              <div class="meta-grid">
                <div><span class="muted">Active</span><strong>{{ category()?.isActive ? 'Yes' : 'No' }}</strong></div>
                <div><span class="muted">Order</span><strong>{{ category()?.displayOrder ?? '-' }}</strong></div>
                <div><span class="muted">Parent</span><strong>{{ category()?.parent?.name || category()?.parentName || 'Root' }}</strong></div>
                <div><span class="muted">Products</span><strong>{{ productCount() ?? '-' }}</strong></div>
              </div>
            </article>

            <article class="panel subcard">
              <p class="eyebrow">SEO</p>
              <div class="stack compact">
                <div><span class="muted">Meta title</span><strong>{{ category()?.metaTitle || '-' }}</strong></div>
                <div><span class="muted">Meta description</span><strong>{{ category()?.metaDescription || '-' }}</strong></div>
                <div><span class="muted">Meta keywords</span><strong>{{ category()?.metaKeywords || '-' }}</strong></div>
              </div>
            </article>
          </div>

          @if (category()?.subCategories?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Subcategories</p>
              <div class="tag-row">
                @for (subCategory of category()?.subCategories || []; track subCategory.id) {
                  <a class="pill" [routerLink]="['/ecommerce/categories', subCategory.id]">{{ subCategory.name }}</a>
                }
              </div>
            </article>
          }
        </app-section-card>
      } @else {
        <app-empty-state title="No category selected" description="Choose a category from the list to view its detail." />
      }
    </section>
  `,
  styles: [`
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .subcard {
      padding: 1rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .meta-grid div,
    .stack.compact div {
      display: grid;
      gap: 0.15rem;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly category = signal<CategoryDetail | null>(null);
  readonly productCount = signal<number | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    const categoryId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(categoryId)) {
      this.error.set('Invalid category id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [category, productCount] = await Promise.all([
        firstValueFrom(this.ecommerceService.getCategory(categoryId)),
        firstValueFrom(this.ecommerceService.getCategoryProductCount(categoryId))
      ]);

      this.category.set(category);
      this.productCount.set(productCount);
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
