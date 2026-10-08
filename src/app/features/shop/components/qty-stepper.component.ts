import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** − 2 + : the shop's way to change a quantity, never a bare number box. */
@Component({
  selector: 'app-qty-stepper',
  standalone: true,
  template: `
    <div class="stepper" role="group" [attr.aria-label]="'Quantity for ' + label()">
      <button type="button" (click)="changed.emit(value() - 1)" [disabled]="value() <= min()"
              [attr.aria-label]="'One fewer ' + label()">−</button>
      <output aria-live="polite">{{ value() }}</output>
      <button type="button" (click)="changed.emit(value() + 1)" [disabled]="value() >= max()"
              [attr.aria-label]="'One more ' + label()">+</button>
    </div>
  `,
  styles: [`
    .stepper { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
    button { width: 2rem; height: 2rem; border: 0; background: none; color: var(--text); font-size: 1.05rem; font-weight: 700; cursor: pointer; border-radius: 999px; }
    button:hover:not(:disabled) { background: var(--surface-2); }
    button:disabled { color: var(--text-subtle); cursor: not-allowed; }
    output { min-width: 1.8rem; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QtyStepperComponent {
  readonly value = input.required<number>();
  readonly min = input(1);
  readonly max = input(99);
  readonly label = input('this item');
  readonly changed = output<number>();
}
