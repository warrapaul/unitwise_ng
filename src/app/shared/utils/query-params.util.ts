import { HttpParams } from '@angular/common/http';

/**
 * Builds query params for a `@ModelAttribute` search DTO: null/undefined/empty
 * values are skipped so the backend falls back to its own defaults, and arrays
 * are sent comma-joined (this backend does not accept JSON-stringified arrays).
 */
export function buildHttpParams(params: Record<string, unknown> | object): HttpParams {
  let httpParams = new HttpParams();
  const entries = params as Record<string, unknown>;

  /*
   * Spring's Pageable resolver reads the direction out of `sort` itself —
   * `sort=createdAt,desc` — and ignores any separate `direction` param. Every
   * list page here holds the two apart in its form, so sending them apart meant
   * a descending sort silently came back ascending: the header arrow flipped and
   * the rows did not move. Folded here rather than in twenty-nine call sites.
   */
  const sortField = entries['sort'];
  const sortDirection = entries['direction'];

  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    if (key === 'direction') {
      continue;
    }

    if (key === 'sort' && sortDirection && !String(sortField).includes(',')) {
      httpParams = httpParams.set('sort', `${String(value)},${String(sortDirection)}`);
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }

      /*
       * A multi-column ordering is several `sort` params, applied in the order
       * they arrive — `sort=createdAt,desc&sort=name,asc`. Comma-joining them
       * the way other array params are joined would hand Spring one unparseable
       * `sort=createdAt,desc,name,asc`.
       */
      if (key === 'sort') {
        for (const entry of value) {
          httpParams = httpParams.append('sort', String(entry));
        }

        continue;
      }

      httpParams = httpParams.set(key, value.join(','));
      continue;
    }

    httpParams = httpParams.set(key, String(value));
  }

  return httpParams;
}
