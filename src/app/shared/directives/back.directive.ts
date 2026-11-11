import { Location } from '@angular/common';
import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Cancel on a form goes back to where the person came from instead of forward to a new copy of it.
 * A forward link added a history entry, so the app bar's Back then returned to the form just left.
 * With history to go back to, this steps back; opened directly (no history), the link is followed.
 */
@Directive({
  selector: 'a[appBack]',
  standalone: true
})
export class BackDirective {
  private readonly location = inject(Location);

  constructor() {
    // Capture phase: runs before the routerLink on the same element, so that link never navigates forward.
    const element = inject<ElementRef<HTMLAnchorElement>>(ElementRef).nativeElement;
    const handler = (event: MouseEvent) => this.back(event);
    element.addEventListener('click', handler, { capture: true });
    inject(DestroyRef).onDestroy(() => element.removeEventListener('click', handler, { capture: true }));
  }

  back(event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
      return;
    }
    if (canGoBack(this.location)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.location.back();
    }
  }
}

/** True when the app itself navigated here, so Back lands on an app page rather than leaving it. */
export function canGoBack(location: Location): boolean {
  const state = location.getState() as { navigationId?: number } | null;
  return (state?.navigationId ?? 1) > 1;
}
