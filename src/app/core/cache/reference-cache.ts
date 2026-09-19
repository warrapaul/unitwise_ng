import { Observable, shareReplay } from 'rxjs';

/**
 * A short list that fills a picker — roles, permissions, categories, counties.
 *
 * Two properties make a list cacheable here, and both must hold:
 *
 *  - it is *small and whole*. The client holds every row, so there is no page,
 *    filter or sort to key on. A paginated list fails this: caching it means
 *    caching one arbitrary window of a table that the next write reshuffles,
 *    and the hit rate is near zero anyway because the key includes the page.
 *  - every write that changes it goes through code this app owns. That is what
 *    makes invalidation honest — the writer calls `invalidate()` on the way
 *    past, and the next read refetches. A list that a *different* actor edits
 *    (another admin, a background job) cannot be invalidated from here, so it
 *    gets fetched per use instead.
 *
 * `shareReplay(1)` also collapses the request storm on first paint: three
 * components asking for roles in the same tick share one HTTP call, which is
 * worth having even before any caching.
 */
export class ReferenceCache<T> {
  private cached?: Observable<T>;

  constructor(private readonly load: () => Observable<T>) {}

  /** The cached value, fetching once on first use. */
  read(): Observable<T> {
    this.cached ??= this.load().pipe(shareReplay(1));
    return this.cached;
  }

  /**
   * Drop it. Called by the write that invalidated it, not on a timer: a timer
   * would only decide how long the app is allowed to be wrong.
   */
  invalidate(): void {
    this.cached = undefined;
  }
}
