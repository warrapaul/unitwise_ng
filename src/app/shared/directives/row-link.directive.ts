import { Directive, ElementRef, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/** Anything that owns its own click and must not trigger the row navigation. */
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [data-row-link-ignore]';

/**
 * Makes a whole table row navigate to the same place its first-cell link points.
 *
 * The row is a convenience target for the mouse, not a replacement for the link:
 * the anchor stays in the first cell so the row remains keyboard reachable,
 * announced by screen readers, hover-previewable, and openable in a new tab.
 * The directive adds no tab stop of its own for that reason (skills §28.4).
 *
 * Pass the same commands array the anchor uses; `null` disables the row (used
 * where the link itself is conditional on ids being present).
 *
 *     <tr [appRowLink]="RoutePaths.agencyDetail(agency.id)">
 */
@Directive({
  selector: 'tr[appRowLink]',
  standalone: true,
  host: {
    '[class.row-clickable]': 'commands() !== null',
    '(click)': 'onClick($event)',
    '(auxclick)': 'onAuxClick($event)'
  }
})
export class RowLinkDirective {
  readonly appRowLink = input<unknown[] | string | null>(null);
  readonly rowLinkQueryParams = input<Record<string, unknown> | null>(null);

  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  commands(): unknown[] | null {
    const value = this.appRowLink();
    if (value === null || value === undefined) {
      return null;
    }

    return Array.isArray(value) ? value : [value];
  }

  onClick(event: MouseEvent): void {
    const commands = this.commands();
    if (commands === null || !this.shouldNavigate(event)) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.openInNewTab(commands);
      return;
    }

    void this.router.navigate(commands, { queryParams: this.rowLinkQueryParams() ?? undefined });
  }

  /** Middle-click opens a new tab, matching what the anchor would do. */
  onAuxClick(event: MouseEvent): void {
    const commands = this.commands();
    if (event.button !== 1 || commands === null || !this.shouldNavigate(event)) {
      return;
    }

    event.preventDefault();
    this.openInNewTab(commands);
  }

  private shouldNavigate(event: MouseEvent): boolean {
    if (event.defaultPrevented) {
      return false;
    }

    // Buttons, links, and form controls in the row own their own clicks.
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE)) {
      return false;
    }

    // Don't yank the page away while the operator is selecting cell text.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && this.host.nativeElement.contains(selection.anchorNode)) {
      return false;
    }

    return true;
  }

  private openInNewTab(commands: unknown[]): void {
    const url = this.router.serializeUrl(
      this.router.createUrlTree(commands, { queryParams: this.rowLinkQueryParams() ?? undefined })
    );
    window.open(url, '_blank', 'noopener');
  }
}
