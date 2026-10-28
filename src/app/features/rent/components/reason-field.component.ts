import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';

const OTHER = '__other__';

/**
 * A reason picked from the usual ones, or typed when it is something else.
 *
 * Writes the final wording into `control`, so the form and the request see one
 * string whichever way it was given — the backend stores the reason as text.
 */
@Component({
  selector: 'app-reason-field',
  standalone: true,
  imports: [ReactiveFormsModule, FieldErrorComponent],
  template: `
    <label class="field">
      <span>{{ label() }}</span>
      <select [value]="choice()" (change)="choose($any($event.target).value)">
        <option value="" disabled>Choose a reason</option>
        @for (reason of reasons(); track reason) { <option [value]="reason">{{ reason }}</option> }
        <option [value]="OTHER">Other (specify)</option>
      </select>
      @if (!typing()) { <app-field-error [control]="control()" [label]="label()" /> }
    </label>
    @if (typing()) {
      <label class="field">
        <span>Specify</span>
        <input [formControl]="control()" maxlength="500">
        <app-field-error [control]="control()" [label]="label()" />
      </label>
    }
  `,
  styles: [`:host { display: contents; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReasonFieldComponent implements OnInit {
  readonly OTHER = OTHER;

  readonly control = input.required<FormControl<string>>();
  readonly reasons = input.required<readonly string[]>();
  readonly label = input('Reason');

  readonly choice = signal('');
  readonly typing = computed(() => this.choice() === OTHER);

  ngOnInit(): void {
    // A reason already in the control (a reset with a value) shows as its choice, or as typed text.
    const current = this.control().value;
    this.choice.set(!current ? '' : this.reasons().includes(current) ? current : OTHER);
  }

  choose(value: string): void {
    this.choice.set(value);
    this.control().setValue(value === OTHER ? '' : value);
    this.control().markAsTouched();
  }
}

/** The usual reasons, per action. "Other" is always offered beside them. */
export const WAIVE_REASONS = [
  'Goodwill gesture',
  'Service not provided this month',
  'Billed in error',
  'Agreed in the lease',
  'Settled outside UnitWise'
] as const;

export const ADJUST_REASONS = [
  'Billed in error',
  'Meter reading corrected',
  'Partial month',
  'Agreed discount',
  'Price change'
] as const;

export const REINSTATE_REASONS = [
  'Waived in error',
  'Waiver conditions not met'
] as const;

export const CHARGE_REASONS = [
  'Repairs caused by the tenant',
  'Replacement key or card',
  'Late payment fee',
  'Cleaning'
] as const;
