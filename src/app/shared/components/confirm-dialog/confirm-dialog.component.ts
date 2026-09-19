import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
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

          <!--
            Part of the same decision, not a second prompt after it. A refusal
            is the decision and the reason for it together, and asking twice
            lets somebody commit before they have seen what they must supply.
          -->
          @if (request.reason; as ask) {
            <label class="field">
              <span>{{ ask.label }}</span>
              <textarea
                #reasonField
                rows="3"
                [attr.maxlength]="ask.maxLength || 500"
                [attr.placeholder]="ask.placeholder || null"
                [attr.aria-required]="ask.required ? 'true' : null"
                (input)="onReasonInput($event)"
              ></textarea>
              <p class="confirm__counter">
                @if (ask.hint) { <span>{{ ask.hint }}</span> }
                <span class="confirm__count">{{ reason().length }}/{{ ask.maxLength || 500 }}</span>
              </p>
            </label>
          }

          <div class="button-row">
            <button
              type="button"
              class="btn"
              [class.btn-danger]="request.destructive"
              [class.btn-primary]="!request.destructive"
              [disabled]="blocked()"
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

    .confirm__counter {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.78rem;
    }

    .confirm__count { white-space: nowrap; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  readonly confirm = inject(ConfirmService);

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly reasonField = viewChild<ElementRef<HTMLTextAreaElement>>('reasonField');

  readonly reason = signal('');

  /** A required reason holds the confirming button until something is typed. */
  readonly blocked = computed(() => {
    const ask = this.confirm.pending()?.reason;
    return !!ask?.required && this.reason().trim().length === 0;
  });

  constructor() {
    effect(() => {
      const pending = this.confirm.pending();
      if (!pending) {
        return;
      }

      this.reason.set('');

      queueMicrotask(() => {
        /*
         * Focus the way out, not the way through — except when there is
         * something to write, where the field is the way out: the operator
         * has to type before they can confirm, and landing on Cancel would
         * make them tab past the button that does the thing to reach it.
         */
        if (pending.reason) {
          this.reasonField()?.nativeElement.focus();
        } else {
          this.cancelButton()?.nativeElement.focus();
        }
      });
    });
  }

  onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  accept(): void {
    if (this.blocked()) {
      return;
    }

    this.confirm.settle(true, this.reason());
  }

  cancel(): void {
    this.confirm.settle(false);
  }
}
