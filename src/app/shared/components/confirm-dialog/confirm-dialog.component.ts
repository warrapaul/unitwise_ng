import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { ConfirmService } from '../../services/confirm.service';

/**
 * The one confirmation dialog, rendered by the shell and driven by
 * `ConfirmService`. See that service for why this exists rather than
 * `window.confirm`.
 *
 * Cancel is the default focus and every escape route answers "no" — Escape, the
 * backdrop, the close button. The confirming button is never the one focus
 * lands on, so a stray Enter cannot delete anything.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    @if (confirm.pending(); as request) {
      <div class="confirm-backdrop" (click)="cancel()">
        <section
          class="confirm panel"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          [attr.aria-describedby]="request.message ? 'confirm-message' : null"
          appFocusTrap
          (trap-escape)="cancel()"
          (click)="$event.stopPropagation()"
        >
          <h2 id="confirm-title">{{ request.title }}</h2>

          @if (request.message) {
            <p id="confirm-message">{{ request.message }}</p>
          }

          <div class="button-row">
            <button
              type="button"
              class="btn"
              [class.btn-danger]="request.destructive"
              [class.btn-primary]="!request.destructive"
              (click)="accept()"
            >{{ request.confirmLabel || 'Confirm' }}</button>
            <button #cancelButton type="button" class="btn btn-secondary" (click)="cancel()">
              {{ request.cancelLabel || 'Cancel' }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgba(20, 26, 23, 0.45);
    }

    .confirm {
      display: grid;
      gap: 0.75rem;
      width: min(100%, 28rem);
      padding: 1.25rem;
    }

    h2 {
      margin: 0;
      font-size: 1.1rem;
      line-height: 1.3;
    }

    p {
      margin: 0;
      color: var(--text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  readonly confirm = inject(ConfirmService);

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    // Focus the way out, not the way through.
    effect(() => {
      if (this.confirm.pending()) {
        queueMicrotask(() => this.cancelButton()?.nativeElement.focus());
      }
    });
  }

  accept(): void {
    this.confirm.settle(true);
  }

  cancel(): void {
    this.confirm.settle(false);
  }
}
