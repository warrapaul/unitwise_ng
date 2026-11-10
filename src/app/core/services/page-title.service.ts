import { Injectable, signal } from '@angular/core';

/** A page that knows its record's name says so, and the app bar shows it instead of the route's generic title. */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  readonly title = signal<string | null>(null);

  set(title: string | null): void {
    this.title.set(title);
  }
}
