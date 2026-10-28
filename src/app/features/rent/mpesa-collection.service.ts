import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { MpesaCollectionAccount, MpesaCollectionUpsert } from './mpesa-collection.models';

/** An agency's own M-Pesa PayBill or till, with per-building overrides. */
@Injectable({ providedIn: 'root' })
export class MpesaCollectionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  list(agencyId: number): Observable<MpesaCollectionAccount[]> {
    return this.http.get<ApiResponse<MpesaCollectionAccount[]>>(`${this.apiUrl}/${ApiUrls.agencyMpesaAccounts(agencyId)}`)
      .pipe(map((response) => response.data ?? []));
  }

  save(agencyId: number, request: MpesaCollectionUpsert): Observable<MpesaCollectionAccount> {
    return this.http.put<ApiResponse<MpesaCollectionAccount>>(`${this.apiUrl}/${ApiUrls.agencyMpesaAccounts(agencyId)}`, request)
      .pipe(map((response) => response.data));
  }

  /** Registers UnitWise's confirmation URL with Safaricom; the result is on the account either way. */
  connect(agencyId: number, id: number): Observable<MpesaCollectionAccount> {
    return this.http.post<ApiResponse<MpesaCollectionAccount>>(`${this.apiUrl}/${ApiUrls.agencyMpesaAccount(agencyId, id)}/connect`, {})
      .pipe(map((response) => response.data));
  }

  remove(agencyId: number, id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.agencyMpesaAccount(agencyId, id)}`)
      .pipe(map(() => void 0));
  }
}
