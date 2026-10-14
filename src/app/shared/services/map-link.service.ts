import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse } from '../../core/models/api-response.model';
import { API_URL } from '../../core/tokens/api-url.token';
import { MapLinkResult } from '../../features/geo/models/geo.models';

/** Reads a pasted Google Maps link (short links included) or "lat, lng" on the server. */
@Injectable({ providedIn: 'root' })
export class MapLinkService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  resolve(link: string): Observable<MapLinkResult> {
    return this.http.post<ApiResponse<MapLinkResult>>(`${this.apiUrl}/${ApiUrls.geoResolveLink}`, { link }).pipe(
      map((response) => response.data)
    );
  }
}

/** What to tell someone whose link held no usable point. */
export const MAP_LINK_FAILURES: Record<string, string> = {
  SHORT_LINK_UNRESOLVED: 'That short link could not be opened. Open it in Maps and copy the full link instead.',
  NOT_A_LOCATION: 'That link is a list or a review, not a place.',
  LOOKUP_FAILED: 'Google did not say where that place is. Drop a pin on it and share that instead.',
  NO_LOCATION_IN_LINK: 'No location in that link. Drop a pin and share it, or paste the coordinates.'
};
