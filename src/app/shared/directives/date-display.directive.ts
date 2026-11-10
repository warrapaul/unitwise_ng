import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Every date and month field shows "7 Nov 2026" / "Nov 2026", whatever language the browser runs in.
 *
 * A native date input draws its text in the browser's own format (mm/dd/yyyy on an American-English
 * browser). Its picker is good, so it is kept: the field's own text is hidden and the date is written
 * over it in the app's format. The value the form holds is unchanged (ISO), and a click anywhere on
 * the field opens the picker rather than only its small icon.
 *
 * A month field gets the app's own selector instead of the browser's (which is a full calendar in
 * Chrome, and nothing at all in Firefox): a year with ‹ › and its twelve months. min/max are honoured.
 */
@Directive({
  selector: 'input[type=date], input[type=month]',
  standalone: true,
  host: {
    class: 'date-field',
    '(input)': 'refresh()',
    '(change)': 'refresh()',
    '(click)': 'openPicker($event)',
    '(keydown)': 'onKey($event)'
  }
})
export class DateDisplayDirective {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly control = inject(NgControl, { optional: true, self: true });
  private label: HTMLSpanElement | null = null;
  private wrapper: HTMLSpanElement | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const parent = this.input.parentNode;
      if (!parent) {
        return;
      }
      this.wrapper = document.createElement('span');
      this.wrapper.className = 'date-field__wrap';
      this.label = document.createElement('span');
      this.label.className = 'date-field__text';
      this.label.setAttribute('aria-hidden', 'true');
      parent.insertBefore(this.wrapper, this.input);
      this.wrapper.append(this.input, this.label);
      this.refresh();
      // A form value set from code fires no DOM event.
      const subscription = this.control?.valueChanges?.subscribe(() => queueMicrotask(() => this.refresh()));
      destroyRef.onDestroy(() => {
        subscription?.unsubscribe();
        this.closePanel();
        this.wrapper?.remove();
      });
    });
  }

  refresh(): void {
    if (!this.label) {
      return;
    }
    const value = this.input.value;
    this.label.textContent = value ? this.format(value) : (this.input.type === 'month' ? 'Choose a month' : 'Choose a date');
    this.label.classList.toggle('date-field__text--empty', !value);
  }

  private panel: HTMLDivElement | null = null;
  private shownYear = new Date().getFullYear();
  private readonly closeOnOutside = (event: Event) => {
    if (this.panel && !this.panel.contains(event.target as Node) && event.target !== this.input) {
      this.closePanel();
    }
  };

  openPicker(event?: Event): void {
    if (this.input.disabled || this.input.readOnly) {
      return;
    }
    if (this.input.type === 'month') {
      event?.preventDefault();
      this.panel ? this.closePanel() : this.openMonthPanel();
      return;
    }
    try {
      this.input.showPicker?.();
    } catch {
      // Not allowed in this context (some browsers, or no user gesture): the icon still works.
    }
  }

  onKey(event: KeyboardEvent): void {
    if (this.input.type !== 'month') {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.openMonthPanel();
    } else if (event.key === 'Escape') {
      this.closePanel();
    } else if (event.key !== 'Tab') {
      // The text is drawn by us; typing into the hidden native field would desync it.
      event.preventDefault();
    }
  }

  private openMonthPanel(): void {
    if (this.panel || !this.wrapper) {
      return;
    }
    const value = this.input.value;
    this.shownYear = value ? Number(value.slice(0, 4)) : new Date().getFullYear();
    this.panel = document.createElement('div');
    this.panel.className = 'month-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Choose a month');
    this.wrapper.append(this.panel);
    this.renderPanel();
    setTimeout(() => document.addEventListener('click', this.closeOnOutside));
    this.panel.querySelector<HTMLButtonElement>('[aria-pressed="true"], .month-panel__grid button:not(:disabled)')?.focus();
  }

  private renderPanel(): void {
    if (!this.panel) {
      return;
    }
    const year = this.shownYear;
    const [minY, minM] = (this.input.min || '0000-01').split('-').map(Number);
    const [maxY, maxM] = (this.input.max || '9999-12').split('-').map(Number);
    const selected = this.input.value;
    const head = document.createElement('div');
    head.className = 'month-panel__head';
    const prev = this.button('‹', 'Previous year', () => { this.shownYear--; this.renderPanel(); });
    const next = this.button('›', 'Next year', () => { this.shownYear++; this.renderPanel(); });
    prev.disabled = year <= minY;
    next.disabled = year >= maxY;
    const title = document.createElement('span');
    title.textContent = String(year);
    head.append(prev, title, next);
    const grid = document.createElement('div');
    grid.className = 'month-panel__grid';
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = new Date(year, month - 1, 1).toLocaleDateString('en-KE', { month: 'short' }).replace('Sept', 'Sep');
      const option = this.button(label, `${label} ${year}`, () => this.choose(key));
      option.setAttribute('aria-pressed', String(key === selected));
      option.disabled = year * 12 + month < minY * 12 + minM || year * 12 + month > maxY * 12 + maxM;
      grid.append(option);
    }
    this.panel.replaceChildren(head, grid);
  }

  private button(text: string, label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); action(); });
    return button;
  }

  private choose(key: string): void {
    this.input.value = key;
    // The form hears it as if typed.
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
    this.closePanel();
    this.input.focus();
  }

  private closePanel(): void {
    document.removeEventListener('click', this.closeOnOutside);
    this.panel?.remove();
    this.panel = null;
  }

  private format(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const text = this.input.type === 'month'
      ? date.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
      : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
    return text.replace('Sept', 'Sep');
  }
}
