import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../../core/constants/api-urls';
import { ApiResponse } from '../../../core/models/api-response.model';
import { API_URL } from '../../../core/tokens/api-url.token';
import { buildHttpParams } from '../../../shared/utils/query-params.util';

/** Mirrors the backend's ReportDtos. Money arrives as a number or a string (BigDecimal). */
export interface RentRollRow {
  buildingId: number;
  buildingName: string;
  floorName?: string | null;
  roomId: number;
  roomName: string;
  tenantId: number;
  tenantName: string;
  tenantPhone?: string | null;
  moveInDate?: string | null;
  leaseEndDate?: string | null;
  monthlyRent?: number | string | null;
  depositExpected?: number | string | null;
  depositHeld?: number | string | null;
  owed?: number | string | null;
}

export interface RentRoll {
  asOf: string;
  rows: RentRollRow[];
  occupiedRooms: number;
  totalRooms: number;
  monthlyRent: number | string;
  depositsHeld: number | string;
  owed: number | string;
}

export interface MethodTotal {
  method: string;
  payments: number;
  amount: number | string;
}

export interface CollectionsByMethod {
  month: string;
  byMethod: MethodTotal[];
  total: number | string;
}

export interface DepositsRow {
  buildingId?: number | null;
  buildingName: string;
  openDeposits: number;
  expected: number | string;
  received: number | string;
  outstanding: number | string;
  refunded: number | string;
  deducted: number | string;
  held: number | string;
}

export interface DepositsHeld {
  rows: DepositsRow[];
  total: DepositsRow;
}

export interface AgeingRow {
  tenantId?: number | null;
  tenantName: string;
  tenantPhone?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  roomName?: string | null;
  formerTenant: boolean;
  days0to30: number | string;
  days31to60: number | string;
  days61to90: number | string;
  days90plus: number | string;
  total: number | string;
  oldestDays: number;
}

export interface ArrearsAgeing {
  asOf: string;
  rows: AgeingRow[];
  total: AgeingRow;
}

/** Rent roll, collections by payment method, deposits held and arrears by age. */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private one<T>(path: string, params: object): Observable<T> {
    return this.http.get<ApiResponse<T>>(`${this.apiUrl}/${path}`, { params: buildHttpParams(params) })
      .pipe(map((response) => response.data));
  }

  rentRoll(agencyId: number, buildingId: number | null): Observable<RentRoll> {
    return this.one(ApiUrls.reportRentRoll(agencyId), { buildingId });
  }

  collections(agencyId: number, buildingId: number | null, month: string): Observable<CollectionsByMethod> {
    return this.one(ApiUrls.reportCollections(agencyId), { buildingId, month });
  }

  deposits(agencyId: number, buildingId: number | null): Observable<DepositsHeld> {
    return this.one(ApiUrls.reportDeposits(agencyId), { buildingId });
  }

  ageing(agencyId: number, buildingId: number | null): Observable<ArrearsAgeing> {
    return this.one(ApiUrls.reportAgeing(agencyId), { buildingId });
  }
}
