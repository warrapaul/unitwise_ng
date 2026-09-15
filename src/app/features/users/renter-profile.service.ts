import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { RenterProfileDetail, RenterProfileUpsertRequest } from './models/renter-profile.models';

/**
 * The signed-in person's own renter profile.
 *
 * Owner-only on the server: no path-variable user id, no administrative read.
 * An agency reaches this only through an approved PROFILE grant, and sees a
 * separate redacted shape.
 */
@Injectable({ providedIn: 'root' })
export class RenterProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  /** Returns an empty DRAFT when nothing is saved, so a form always binds. */
  getMyProfile(): Observable<RenterProfileDetail> {
    return this.http.get<ApiResponse<RenterProfileDetail>>(`${this.apiUrl}/${ApiUrls.myTenancyProfile}`)
      .pipe(map((response) => response.data));
  }

  /**
   * Whole-object replace, not a merge — otherwise a former employer could
   * never be cleared. Send every field the form holds, including the blanks.
   */
  saveMyProfile(request: RenterProfileUpsertRequest): Observable<RenterProfileDetail> {
    return this.http.put<ApiResponse<RenterProfileDetail>>(
      `${this.apiUrl}/${ApiUrls.myTenancyProfile}`, request
    ).pipe(map((response) => response.data));
  }
}
