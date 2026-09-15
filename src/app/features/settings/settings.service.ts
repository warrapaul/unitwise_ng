import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';

/**
 * Authorization cache maintenance.
 *
 * Permission checks are served from a Redis snapshot keyed by user and agency,
 * with a 12-hour TTL, while `/users/profile` reads the database. Anything that
 * changes roles or permissions *without* going through a service method —
 * a migration, a support fix run as SQL, the bootstrap initializer writing
 * role→permission rows on boot — leaves the two disagreeing until the TTL
 * expires. The symptom is a 403 on an endpoint the profile says you can reach.
 *
 * Evicting is the fix, and it is safe: the next request rebuilds the snapshot
 * from the database.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  /** Every cached snapshot. The blunt one, and the one a runbook calls for. */
  evictAllPermissions(): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.authCachePermissions}`)
      .pipe(map(() => void 0));
  }

  evictUserPermissions(userId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.authCachePermissionsUser(userId)}`)
      .pipe(map(() => void 0));
  }

  /** Every holder of the role, not just one of them. */
  evictRolePermissions(roleId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.authCachePermissionsRole(roleId)}`)
      .pipe(map(() => void 0));
  }

  evictAgencyPermissions(agencyId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.authCachePermissionsAgency(agencyId)}`)
      .pipe(map(() => void 0));
  }
}
