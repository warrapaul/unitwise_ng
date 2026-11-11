import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';

/**
 * The actions that are not the point of the screen, behind one "More" button: a detail page shows
 * its one or two main actions, and the rest (renew, rebuild, move out) wait here instead of a row of
 * six equal buttons. Project buttons in; any click inside closes the menu.
 *
 *   <app-more-menu>
 *     <button type="button" (click)="renew()">Renew</button>
 *     <button type="button" class="danger" (click)="moveOut()">Move out</button>
 *   </app-more-menu>
 */
@Component({
  selector: 'app-more-menu',
  standalone: true,
  host: {
    '(document:click)': 'outside($event)',
    '(keydown.escape)': 'close(true)'
  },
  template: `
    <details class="more">
      <!-- "⋯" is the compact form for a row: named for assistive tech, no caret. -->
      <summary class="btn btn-secondary" [class.more--dots]="label() === '⋯'" [attr.aria-label]="label() === '⋯' ? 'More actions' : label()">{{ label() }}@if (label() !== '⋯') { <span aria-hidden="true">▾</span> }</summary>
      <div class="more__panel" role="menu" (click)="close(false)">
        <ng-content />
      </div>
    </details>
  `,
  styles: [`
    :host { position: relative; display: inline-block; }
    .more > summary { list-style: none; cursor: pointer; }
    .more > summary.more--dots { min-width: 2.75rem; justify-content: center; border-color: transparent; background: none; font-size: 1.25rem; }
    .more > summary::-webkit-details-marker { display: none; }
    .more__panel { position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; min-width: 13rem; padding: var(--space-1);
                   display: grid; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-md);
                   box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
    :host ::ng-deep .more__panel > button, :host ::ng-deep .more__panel > a {
      display: flex; align-items: center; min-height: 2.75rem; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm);
      background: none; font: inherit; color: var(--text); text-align: left; text-decoration: none; cursor: pointer; }
    :host ::ng-deep .more__panel > :is(button, a):hover, :host ::ng-deep .more__panel > :is(button, a):focus-visible { background: var(--surface-muted, #f1f3ef); }
    :host ::ng-deep .more__panel > :is(button, a).danger { color: var(--danger); }
    :host ::ng-deep .more__panel > button:disabled { opacity: 0.5; cursor: not-allowed; }
    @media (max-width: 640px) { .more__panel { right: auto; left: 0; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoreMenuComponent {
  readonly label = input('More');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  close(refocus: boolean): void {
    const details = this.host.querySelector('details');
    if (details?.open) {
      details.open = false;
      if (refocus) {
        details.querySelector('summary')?.focus();
      }
    }
  }

  outside(event: Event): void {
    if (!this.host.contains(event.target as Node)) {
      this.close(false);
    }
  }
}
