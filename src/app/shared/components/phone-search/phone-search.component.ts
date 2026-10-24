import { ChangeDetectionStrategy, Component, ElementRef, OnInit, input, output, signal, viewChild } from '@angular/core';

/**
 * One phone-number box that searches by itself. The desk usually has the
 * number on the clipboard (from a call log, a chat, an SMS), so there is a
 * paste button, and a paste — or a ninth digit typed — runs the search. Enter
 * and the Find button still work for anything shorter.
 */
@Component({
  selector: 'app-phone-search',
  standalone: true,
  template: `
    <form class="phone-search" (submit)="$event.preventDefault(); fire(true)">
      <label class="field">
        <span class="visually-hidden">Phone number</span>
        <span class="phone-search__box">
          <input #box type="tel" inputmode="tel" autocomplete="off" [value]="value()" [placeholder]="placeholder()"
                 (input)="onInput($any($event.target).value)" (paste)="onPaste($event)">
          <button type="button" class="phone-search__paste" title="Paste the number" aria-label="Paste the number" (click)="paste()">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-copy" /></svg>
          </button>
        </span>
      </label>
      <button type="submit" class="btn btn-primary" [disabled]="busy() || digits(value()).length < 9">{{ busy() ? 'Searching...' : 'Find' }}</button>
    </form>
    @if (note(); as message) { <small class="hint">{{ message }}</small> }
  `,
  styles: [`
    .phone-search { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.5rem; }
    .phone-search .field { flex: 1 1 14rem; max-width: 22rem; }
    .phone-search__box { position: relative; display: block; }
    .phone-search__box input { padding-right: 2.6rem; }
    .phone-search__paste { position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%); display: grid; place-items: center;
                           width: 2rem; height: 2rem; border: 0; border-radius: 8px; background: none; color: var(--text-muted); cursor: pointer; }
    .phone-search__paste:hover { background: var(--surface-2); color: var(--primary-strong); }
    .phone-search__paste svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 1.8; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneSearchComponent implements OnInit {
  readonly placeholder = input('e.g. 0712 345 678');
  readonly busy = input(false);
  /** The number to start from (a link with ?phone=). */
  readonly initial = input<string | null>(null);
  /** The number, spaces removed, once it is long enough to be one. */
  readonly search = output<string>();

  readonly value = signal('');
  readonly note = signal<string | null>(null);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private lastFired = '';

  ngOnInit(): void {
    const start = this.initial();
    if (start) {
      this.value.set(start);
      this.fire();
    }
  }

  onInput(text: string): void {
    this.value.set(text);
    this.note.set(null);
    // Typed by hand: search once it is long enough to be a number (more than 8 digits).
    if (this.digits(text).length > 8) {
      this.fire();
    }
  }

  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (text) {
      event.preventDefault();
      this.take(text);
    }
  }

  /** The paste button: read the clipboard where the browser allows it, else ask for Ctrl+V. */
  async paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        this.take(text);
        return;
      }
      this.note.set('The clipboard is empty.');
    } catch {
      this.note.set('Paste with Ctrl+V (or long-press) in the box — this browser keeps the clipboard private.');
      this.box()?.nativeElement.focus();
    }
  }

  /** Auto-searches skip a number already searched; Find (force) always runs. */
  fire(force = false): void {
    const number = this.value().replace(/[^\d+]/g, '');
    if (this.digits(number).length < 9 || (!force && number === this.lastFired)) {
      return;
    }
    this.lastFired = number;
    this.search.emit(number);
  }

  digits(text: string): string {
    return text.replace(/\D/g, '');
  }

  /** A pasted number often carries spaces, dashes or a label ("Tel: +254 712..."): keep the number. */
  private take(text: string): void {
    const number = (text.match(/\+?[\d\s()-]{9,}/)?.[0] ?? text).trim();
    this.value.set(number);
    this.note.set(null);
    this.fire();
  }
}
