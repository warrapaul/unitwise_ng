import { Directive, ElementRef, OnDestroy, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Keeps Tab focus inside a modal or drawer and restores it on close. Escape
 * raises a bubbling `trap-escape` event so the host can close itself.
 *
 * Used bare (`appFocusTrap`) it traps for as long as the element exists, which
 * is what a modal rendered inside an `@if` wants. An element that is only
 * *sometimes* modal — the filter panel, which is an inline region on a desktop
 * and a bottom sheet on a phone — binds a boolean instead and the trap follows
 * it: `[appFocusTrap]="sheet() && open()"`.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true
})
export class FocusTrapDirective implements OnDestroy {
  /** Bare usage yields `''`; only an explicit `false` turns the trap off. */
  readonly appFocusTrap = input<boolean | '' | null>('');
  readonly returnFocusTo = input<HTMLElement | null>(null);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly keydownHandler = (event: KeyboardEvent) => this.onKeydown(event);
  private readonly rendered = signal(false);
  private readonly enabled = computed(() => this.appFocusTrap() !== false && this.appFocusTrap() !== null);

  private active = false;
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    // Nothing to focus until the element is in the DOM.
    afterNextRender(() => this.rendered.set(true));

    effect(() => {
      if (!this.rendered()) {
        return;
      }

      if (this.enabled()) {
        this.activate();
      } else {
        this.release();
      }
    });
  }

  ngOnDestroy(): void {
    this.release();
  }

  private activate(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    this.el.nativeElement.addEventListener('keydown', this.keydownHandler);
    this.getFocusable()[0]?.focus();
  }

  private release(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.el.nativeElement.removeEventListener('keydown', this.keydownHandler);
    (this.returnFocusTo() ?? this.previouslyFocused)?.focus();
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.el.nativeElement.dispatchEvent(new CustomEvent('trap-escape', { bubbles: true }));
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = this.getFocusable();
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }
}
