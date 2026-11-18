import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../../core/constants/api-urls';
import { ApiResponse } from '../../../core/models/api-response.model';
import { API_URL } from '../../../core/tokens/api-url.token';

/** Mirrors the backend's MoveOutDtos. Money arrives as a number or a string (BigDecimal). */
export type ItemCondition = 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';

export interface InspectionPhoto {
  id: number;
  url: string;
  fileName?: string | null;
}

export interface InspectionItem {
  id?: number | null;
  area: string;
  condition: ItemCondition;
  note?: string | null;
  charge?: number | string | null;
  photos: InspectionPhoto[];
}

export interface MoveOutInspection {
  id?: number | null;
  tenantId: number;
  tenantName?: string | null;
  roomId?: number | null;
  roomName?: string | null;
  buildingId: number;
  status?: 'DRAFT' | 'COMPLETED' | null;
  inspectedOn: string;
  keysReturned: boolean;
  metersRead: boolean;
  roomCleaned: boolean;
  tenantPresent: boolean;
  notes?: string | null;
  items: InspectionItem[];
  totalCharges: number | string;
  depositId?: number | null;
  depositHeld: number | string;
  rentOwed: number | string;
  balanceToReturn: number | string;
  inspectedByName?: string | null;
  completedAt?: string | null;
}

export interface MoveOutSaveRequest {
  inspectedOn: string;
  keysReturned: boolean;
  metersRead: boolean;
  roomCleaned: boolean;
  tenantPresent: boolean;
  notes: string | null;
  items: { id?: number | null; area: string; condition: ItemCondition; note: string | null; charge: number | null }[];
}

export const CONDITIONS: { value: ItemCondition; label: string; tone: string }[] = [
  { value: 'GOOD', label: 'Good', tone: 'success' },
  { value: 'FAIR', label: 'Fair wear', tone: 'neutral' },
  { value: 'DAMAGED', label: 'Damaged', tone: 'danger' },
  { value: 'MISSING', label: 'Missing', tone: 'danger' }
];

/** A tenant's move-out inspection. */
@Injectable({ providedIn: 'root' })
export class MoveOutService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private url(agencyId: number, buildingId: number, tenantId: number, rest = ''): string {
    return `${this.apiUrl}/${ApiUrls.moveOutInspection(agencyId, buildingId, tenantId)}${rest}`;
  }

  get(agencyId: number, buildingId: number, tenantId: number): Observable<MoveOutInspection> {
    return this.http.get<ApiResponse<MoveOutInspection>>(this.url(agencyId, buildingId, tenantId))
      .pipe(map((r) => r.data));
  }

  save(agencyId: number, buildingId: number, tenantId: number, request: MoveOutSaveRequest): Observable<MoveOutInspection> {
    return this.http.put<ApiResponse<MoveOutInspection>>(this.url(agencyId, buildingId, tenantId), request).pipe(map((r) => r.data));
  }

  addPhoto(agencyId: number, buildingId: number, tenantId: number, itemId: number, file: File): Observable<MoveOutInspection> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ApiResponse<MoveOutInspection>>(this.url(agencyId, buildingId, tenantId, `/items/${itemId}/photos`), body)
      .pipe(map((r) => r.data));
  }

  deletePhoto(agencyId: number, buildingId: number, tenantId: number, itemId: number, photoId: number): Observable<MoveOutInspection> {
    return this.http.delete<ApiResponse<MoveOutInspection>>(this.url(agencyId, buildingId, tenantId, `/items/${itemId}/photos/${photoId}`))
      .pipe(map((r) => r.data));
  }

  /** complete or reopen. */
  move(agencyId: number, buildingId: number, tenantId: number, action: 'complete' | 'reopen'): Observable<MoveOutInspection> {
    return this.http.post<ApiResponse<MoveOutInspection>>(this.url(agencyId, buildingId, tenantId, `/${action}`), {}).pipe(map((r) => r.data));
  }
}
