import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { slugify } from '../../../shared/utils/slug.util';
import { CatalogAdminService } from '../catalog-admin.service';
import { EcommerceService } from '../ecommerce.service';
import { CategoryPreview } from '../models/ecommerce.models';

type Pane = 'parents' | 'children';

/**
 * Categories as two lists side by side: top-level categories on the left, the selected one's
 * subcategories on the right. Each row renames in place; the pencil opens the full form for the
 * image, description and SEO fields; + adds a row by name; the bin deletes. The server refuses
 * to delete a category that still has products or subcategories, and says so.
 */
@Component({
  selector: 'app-category-list-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="stack">
      <header class="page-head">
        <h1>Categories</h1>
        <input class="search" type="search" placeholder="Filter by name" [value]="query()"
               (input)="query.set($any($event.target).value)" aria-label="Filter categories">
      </header>

      @if (loading()) {
        <app-loading-state label="Loading categories..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else {
        <div class="board">
          <!-- ── Top-level categories ── -->
          <section class="pane" aria-labelledby="parents-title">
            <h2 id="parents-title">Categories</h2>
            <ol class="rows" role="listbox" aria-label="Categories">
              @for (c of parentsShown(); track c.id; let i = $index) {
                <li class="row" role="option" [attr.aria-selected]="selectedId() === c.id"
                    [class.row--on]="selectedId() === c.id" [class.row--inactive]="c.isActive === false"
                    (click)="select(c)">
                  @if (renaming() === c.id) {
                    <input class="rename" [value]="c.name" (click)="$event.stopPropagation()"
                           (keydown.enter)="rename(c, $any($event.target).value)" (keydown.escape)="renaming.set(null)"
                           (blur)="rename(c, $any($event.target).value)" aria-label="Category name" autofocus>
                  } @else {
                    <span class="row__name">{{ i + 1 }}. {{ c.name }}@if (c.isActive === false) { <span class="muted"> (inactive)</span> }</span>
                  }
                  <span class="row__end">
                    @if (canEdit()) {
                      <span class="row__actions">
                        <button type="button" class="icon-btn" title="Rename" aria-label="Rename" (click)="$event.stopPropagation(); renaming.set(c.id)">✎</button>
                        <a class="icon-btn" title="Edit details" aria-label="Edit details" [routerLink]="RoutePaths.ecomCategoryEdit(c.id)" (click)="$event.stopPropagation()">⋯</a>
                      </span>
                    }
                    <span class="badge" [title]="childCount(c.id) + ' subcategories'">{{ childCount(c.id) }}</span>
                  </span>
                </li>
              } @empty {
                <li class="empty muted">{{ query() ? 'No category matches.' : 'No categories yet.' }}</li>
              }
              @if (adding() === 'parents') {
                <li class="row row--add">
                  <input class="rename" placeholder="New category name" (keydown.enter)="add(null, $any($event.target).value)"
                         (keydown.escape)="adding.set(null)" aria-label="New category name" autofocus>
                </li>
              }
            </ol>
            <footer class="pane__foot">
              @if (canDelete()) {
                <button type="button" class="icon-btn" title="Delete selected category" aria-label="Delete selected category"
                        [disabled]="!selected() || busy()" (click)="remove(selected()!)">🗑</button>
              } @else { <span></span> }
              @if (canCreate()) {
                <button type="button" class="icon-btn icon-btn--add" title="Add category" aria-label="Add category" (click)="adding.set('parents')">+</button>
              }
            </footer>
          </section>

          <!-- ── Subcategories of the selected one ── -->
          <section class="pane" aria-labelledby="children-title">
            <h2 id="children-title">{{ selected() ? 'Subcategories of ' + selected()!.name : 'Subcategories' }}</h2>
            <ol class="rows">
              @if (!selected()) {
                <li class="empty muted">Choose a category on the left.</li>
              } @else {
                @for (c of childrenShown(); track c.id; let i = $index) {
                  <li class="row" [class.row--inactive]="c.isActive === false" [class.row--on]="selectedChildId() === c.id"
                      (click)="selectedChildId.set(c.id)">
                    @if (renaming() === c.id) {
                      <input class="rename" [value]="c.name" (click)="$event.stopPropagation()"
                             (keydown.enter)="rename(c, $any($event.target).value)" (keydown.escape)="renaming.set(null)"
                             (blur)="rename(c, $any($event.target).value)" aria-label="Subcategory name" autofocus>
                    } @else {
                      <span class="row__name">{{ i + 1 }}. {{ c.name }}@if (c.isActive === false) { <span class="muted"> (inactive)</span> }</span>
                    }
                    <span class="row__end">
                      @if (canEdit()) {
                        <span class="row__actions">
                          <button type="button" class="icon-btn" title="Rename" aria-label="Rename" (click)="$event.stopPropagation(); renaming.set(c.id)">✎</button>
                          <a class="icon-btn" title="Edit details" aria-label="Edit details" [routerLink]="RoutePaths.ecomCategoryEdit(c.id)" (click)="$event.stopPropagation()">⋯</a>
                        </span>
                      }
                      @if (canDelete()) {
                        <button type="button" class="icon-btn" title="Delete" aria-label="Delete" [disabled]="busy()" (click)="$event.stopPropagation(); remove(c)">🗑</button>
                      }
                    </span>
                  </li>
                } @empty {
                  <li class="empty muted">{{ query() ? 'No subcategory matches.' : 'No subcategories yet.' }}</li>
                }
                @if (adding() === 'children') {
                  <li class="row row--add">
                    <input class="rename" [placeholder]="'New subcategory of ' + selected()!.name"
                           (keydown.enter)="add(selected()!.id, $any($event.target).value)" (keydown.escape)="adding.set(null)"
                           aria-label="New subcategory name" autofocus>
                  </li>
                }
              }
            </ol>
            <footer class="pane__foot">
              <span class="muted small">{{ selected() ? childrenOf(selected()!.id).length + ' subcategories' : '' }}</span>
              @if (canCreate()) {
                <button type="button" class="icon-btn icon-btn--add" title="Add subcategory" aria-label="Add subcategory"
                        [disabled]="!selected()" (click)="adding.set('children')">+</button>
              }
            </footer>
          </section>
        </div>
        <p class="muted small">Click a name's ✎ to rename it in place (Enter saves, Esc cancels); ⋯ opens the full form for the image, description and visibility.</p>
      }
    </section>
  `,
  styles: [`
    .page-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;
                 padding-bottom: 0.6rem; border-bottom: 1px solid var(--border); }
    .page-head h1 { margin: 0; font-size: 1.3rem; }
    .search { max-width: 18rem; }
    .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 0.75rem;
             padding: 0.6rem; border-radius: 6px; background: var(--surface-2); }
    .pane { display: flex; flex-direction: column; min-width: 0; border-radius: 4px; background: var(--surface);
            box-shadow: 0 1px 3px rgb(0 0 0 / 12%); }
    .pane h2 { margin: 0; padding: 0.8rem 0.75rem 0.4rem; font-size: 1rem; }
    .rows { flex: 1; margin: 0; padding: 0.25rem 0; list-style: none; height: 22rem; overflow-y: auto; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 2.5rem;
           padding: 0.2rem 0.75rem 0.2rem 1rem; cursor: pointer; }
    .row:hover { background: var(--surface-2); }
    .row--on { background: var(--primary-tint); }
    .row--inactive .row__name { color: var(--text-muted); }
    .row--add { cursor: default; }
    .row__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row__end { display: inline-flex; align-items: center; gap: 0.25rem; flex: none; }
    .row__actions { display: inline-flex; gap: 0.1rem; opacity: 0; transition: opacity 0.1s; }
    .row:hover .row__actions, .row--on .row__actions, .row:focus-within .row__actions { opacity: 1; }
    .badge { display: inline-grid; place-items: center; min-width: 1.9rem; height: 1.9rem; padding: 0 0.4rem;
             border-radius: 999px; background: var(--surface-2); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
    .row--on .badge { background: var(--surface); }
    .rename { flex: 1; min-width: 0; padding: 0.3rem 0.5rem; }
    .empty { padding: 0.75rem 1rem; }
    .pane__foot { display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.6rem;
                  border-top: 1px solid var(--border); }
    .icon-btn { display: inline-grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: 0; border-radius: 6px;
                background: none; color: var(--text-muted); font: inherit; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .icon-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
    .icon-btn:disabled { opacity: 0.4; cursor: default; }
    .icon-btn--add { font-size: 1.4rem; }
    .small { font-size: 0.82rem; }
    @media (max-width: 640px) { .rows { height: 16rem; } .row__actions { opacity: 1; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly ecommerce = inject(EcommerceService);
  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);
  private readonly context = inject(ActiveContextService);

  readonly all = signal<CategoryPreview[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly query = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly selectedChildId = signal<number | null>(null);
  readonly renaming = signal<number | null>(null);
  readonly adding = signal<Pane | null>(null);

  readonly canCreate = computed(() => this.context.can('CATEGORY_CREATE'));
  readonly canEdit = computed(() => this.context.can('CATEGORY_UPDATE'));
  readonly canDelete = computed(() => this.context.can('CATEGORY_DELETE'));

  readonly parents = computed(() => this.sorted(this.all().filter((c) => !c.parentId)));
  readonly selected = computed(() => this.all().find((c) => c.id === this.selectedId()) ?? null);

  /** A filter shows a parent when it or one of its children matches. */
  readonly parentsShown = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.parents();
    return this.parents().filter((p) => p.name.toLowerCase().includes(q)
      || this.childrenOf(p.id).some((c) => c.name.toLowerCase().includes(q)));
  });

  readonly childrenShown = computed(() => {
    const parent = this.selectedId();
    if (parent === null) return [];
    const q = this.query().trim().toLowerCase();
    const children = this.childrenOf(parent);
    const parentMatches = this.selected()?.name.toLowerCase().includes(q);
    return !q || parentMatches ? children : children.filter((c) => c.name.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // The server caps a page at 100; a catalogue can have more, so read every page.
      const items: CategoryPreview[] = [];
      for (let page = 0; page < 50; page++) {
        const result = await firstValueFrom(this.ecommerce.getCategories({ page, size: 100, includeInactive: true }));
        items.push(...result.items);
        if (!result.pagination || result.pagination.isLast || result.items.length === 0) break;
      }
      this.all.set(items);
      // Keep the selection across reloads; otherwise start on the first category.
      if (!this.all().some((c) => c.id === this.selectedId())) {
        this.selectedId.set(this.parents()[0]?.id ?? null);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  childrenOf(parentId: number): CategoryPreview[] {
    return this.sorted(this.all().filter((c) => c.parentId === parentId));
  }

  childCount(parentId: number): number {
    return this.all().filter((c) => c.parentId === parentId).length;
  }

  select(category: CategoryPreview): void {
    this.selectedId.set(category.id);
    this.selectedChildId.set(null);
    this.adding.set(this.adding() === 'children' ? null : this.adding());
  }

  async add(parentId: number | null, rawName: string): Promise<void> {
    const name = rawName.trim();
    if (!name) {
      this.adding.set(null);
      return;
    }
    this.busy.set(true);
    try {
      const created = await firstValueFrom(this.catalogAdmin.createCategory({
        name, slug: slugify(name), parentId, isActive: true
      }));
      this.adding.set(null);
      await this.load();
      if (parentId === null) this.selectedId.set(created.id);
      this.toasts.push('success', `Added ${name}.`);
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Renames in place; a slug that was the name's follows it, a hand-chosen one stays. */
  async rename(category: CategoryPreview, rawName: string): Promise<void> {
    if (this.renaming() !== category.id) return; // Enter then blur: once.
    const name = rawName.trim();
    this.renaming.set(null);
    if (!name || name === category.name) return;
    this.busy.set(true);
    try {
      const slug = !category.slug || category.slug === slugify(category.name) ? slugify(name) : category.slug;
      await firstValueFrom(this.catalogAdmin.updateCategory(category.id, { name, slug }));
      this.all.update((list) => list.map((c) => c.id === category.id ? { ...c, name, slug } : c));
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(category: CategoryPreview): Promise<void> {
    const children = this.childCount(category.id);
    if (children > 0) {
      this.toasts.push('error', `Delete or move the ${children} subcategories of ${category.name} first.`);
      return;
    }
    if (!await this.confirm.ask({
      title: `Delete ${category.name}?`,
      message: 'A category that still has products cannot be deleted; move them or mark it inactive instead.',
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.catalogAdmin.deleteCategory(category.id));
      if (this.selectedId() === category.id) this.selectedId.set(null);
      await this.load();
      this.toasts.push('success', `Deleted ${category.name}.`);
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private sorted(list: CategoryPreview[]): CategoryPreview[] {
    return [...list].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999) || a.name.localeCompare(b.name));
  }
}
