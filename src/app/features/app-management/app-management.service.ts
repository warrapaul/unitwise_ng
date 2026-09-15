import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  AppCheckRequest,
  AppCheckResponse,
  AppNoticeDetail,
  AppNoticeUpsertRequest,
  AppPlatform,
  VersionConfig,
  VersionConfigUpsertRequest
} from './models/app-management.models';

/** In-app notices and per-platform version gating. */
@Injectable({ providedIn: 'root' })
export class AppManagementService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  /** What a client calls on launch to learn about updates and active notices. */
  check(request: AppCheckRequest): Observable<AppCheckResponse> {
    return this.http.post<ApiResponse<AppCheckResponse>>(`${this.apiUrl}/${ApiUrls.appCheck}`, request).pipe(
      map((response) => response.data)
    );
  }

  acknowledgeNotice(noticeId: number): Observable<void> {
    return this.http.post<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.appNoticeAcknowledge(noticeId)}`, {}).pipe(
      map(() => void 0)
    );
  }

  /** `includeInactive` is the endpoint's one criterion; the rest is paging and sort. */
  getNotices(params: { includeInactive?: boolean; page?: number; size?: number; sort?: string | string[]; direction?: 'asc' | 'desc' } = {}): Observable<PaginatedResult<AppNoticeDetail>> {
    return this.http.get<PaginatedApiResponse<AppNoticeDetail>>(`${this.apiUrl}/${ApiUrls.appAdminNotices}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getNotice(noticeId: number): Observable<AppNoticeDetail> {
    return this.http.get<ApiResponse<AppNoticeDetail>>(`${this.apiUrl}/${ApiUrls.appAdminNoticeById(noticeId)}`).pipe(
      map((response) => response.data)
    );
  }

  createNotice(request: AppNoticeUpsertRequest): Observable<AppNoticeDetail> {
    return this.http.post<ApiResponse<AppNoticeDetail>>(`${this.apiUrl}/${ApiUrls.appAdminNotices}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateNotice(noticeId: number, request: AppNoticeUpsertRequest): Observable<AppNoticeDetail> {
    return this.http.patch<ApiResponse<AppNoticeDetail>>(
      `${this.apiUrl}/${ApiUrls.appAdminNoticeById(noticeId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  toggleNotice(noticeId: number): Observable<AppNoticeDetail> {
    return this.http.patch<ApiResponse<AppNoticeDetail>>(
      `${this.apiUrl}/${ApiUrls.appAdminNoticeToggle(noticeId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  deleteNotice(noticeId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.appAdminNoticeById(noticeId)}`).pipe(
      map(() => void 0)
    );
  }

  getVersionConfigs(): Observable<VersionConfig[]> {
    return this.http.get<ApiResponse<VersionConfig[]>>(`${this.apiUrl}/${ApiUrls.appAdminVersionConfigs}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  getVersionConfig(platform: AppPlatform): Observable<VersionConfig> {
    return this.http.get<ApiResponse<VersionConfig>>(
      `${this.apiUrl}/${ApiUrls.appAdminVersionConfigByPlatform(platform)}`
    ).pipe(map((response) => response.data));
  }

  /** Upserts the config for a platform — the backend keys on `platform`. */
  saveVersionConfig(request: VersionConfigUpsertRequest): Observable<VersionConfig> {
    return this.http.post<ApiResponse<VersionConfig>>(`${this.apiUrl}/${ApiUrls.appAdminVersionConfigs}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteVersionConfig(platform: AppPlatform): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.appAdminVersionConfigByPlatform(platform)}`
    ).pipe(map(() => void 0));
  }
}
