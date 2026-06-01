import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  template: `
    <div class="pagination panel">
      <div class="pagination__nav">
        <button type="button" class="btn btn-secondary" [disabled]="pagination().isFirst" (click)="previous.emit()">
          Previous
        </button>

        <span class="muted">
          Page {{ pagination().page + 1 }} of {{ pagination().totalPages || 1 }}
        </span>

        <button type="button" class="btn btn-secondary" [disabled]="pagination().isLast" (click)="next.emit()">
          Next
        </button>
      </div>

      <label class="pagination__size">
        <span class="muted">Rows</span>
        <select [value]="size()" (change)="handleSizeChange($event)">
          @for (option of sizes(); track option) {
            <option [value]="option">{{ option }}</option>
          }
        </select>
      </label>
    </div>
  `,
  styles: [`
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.9rem 1rem;
    }

    .pagination__nav {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .pagination__size {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      white-space: nowrap;
      font-size: 0.9rem;
    }

    .pagination__size select {
      min-width: 5.5rem;
      padding: 0.6rem 0.8rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--text);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaginationComponent {
  readonly pagination = input.required<{ page: number; totalPages: number; isFirst: boolean; isLast: boolean }>();
  readonly size = input.required<number>();
  readonly sizes = input<number[]>([10, 20, 50]);
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly sizeChange = output<number>();

  handleSizeChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }

    this.sizeChange.emit(Number(target.value));
  }
}
