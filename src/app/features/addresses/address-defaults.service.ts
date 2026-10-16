import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse } from '../../core/models/api-response.model';
import { API_URL } from '../../core/tokens/api-url.token';

/** Where new addresses start, set by an admin: the county, sub-county and ward the business serves. */
export interface AddressDefaults {
  countyId?: number | null;
  countyName?: string | null;
  subCountyId?: number | null;
  subCountyName?: string | null;
  wardId?: number | null;
  wardName?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AddressDefaultsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private cached$: Observable<AddressDefaults> | null = null;

  /** Read once per session; a failure means "no defaults", never an error on a form. */
  get(): Observable<AddressDefaults> {
    this.cached$ ??= this.http.get<ApiResponse<AddressDefaults>>(`${this.apiUrl}/${ApiUrls.addressDefaults}`).pipe(
      map((response) => response.data ?? {}),
      catchError(() => of({})),
      shareReplay(1)
    );
    return this.cached$;
  }

  save(request: AddressDefaults): Observable<AddressDefaults> {
    return this.http.put<ApiResponse<AddressDefaults>>(`${this.apiUrl}/${ApiUrls.addressDefaults}`, request).pipe(
      map((response) => {
        this.cached$ = of(response.data);
        return response.data;
      })
    );
  }
}
