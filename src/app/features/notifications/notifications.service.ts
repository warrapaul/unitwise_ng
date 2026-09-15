import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  AdminSendNotificationRequest,
  FcmSendResult,
  InAppNotification,
  NotificationMediaUpload,
  NotificationSearchParams,
  RegisterDeviceTokenRequest
} from './models/notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getNotifications(params: NotificationSearchParams = {}): Observable<PaginatedResult<InAppNotification>> {
    return this.http.get<PaginatedApiResponse<InAppNotification>>(`${this.apiUrl}/${ApiUrls.notifications}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getUnread(params: NotificationSearchParams = {}): Observable<PaginatedResult<InAppNotification>> {
    return this.http.get<PaginatedApiResponse<InAppNotification>>(`${this.apiUrl}/${ApiUrls.notificationsUnread}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getStarred(params: NotificationSearchParams = {}): Observable<PaginatedResult<InAppNotification>> {
    return this.http.get<PaginatedApiResponse<InAppNotification>>(`${this.apiUrl}/${ApiUrls.notificationsStarred}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<ApiResponse<number>>(`${this.apiUrl}/${ApiUrls.notificationsUnreadCount}`).pipe(
      map((response) => response.data ?? 0)
    );
  }

  markRead(notificationId: number): Observable<InAppNotification> {
    return this.http.patch<ApiResponse<InAppNotification>>(
      `${this.apiUrl}/${ApiUrls.notificationRead(notificationId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  markAllRead(): Observable<void> {
    return this.http.patch<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.notificationsReadAll}`, {}).pipe(
      map(() => void 0)
    );
  }

  toggleStar(notificationId: number): Observable<InAppNotification> {
    return this.http.patch<ApiResponse<InAppNotification>>(
      `${this.apiUrl}/${ApiUrls.notificationStar(notificationId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  registerDeviceToken(request: RegisterDeviceTokenRequest): Observable<void> {
    return this.http.post<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.notificationTokens}`, request).pipe(
      map(() => void 0)
    );
  }

  deactivateDeviceToken(token: string): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.notificationTokenByValue(token)}`).pipe(
      map(() => void 0)
    );
  }

  deactivateAllDeviceTokens(): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.notificationTokens}`).pipe(
      map(() => void 0)
    );
  }

  /** Uploads the image a broadcast will carry; returns the stored path to send with it. */
  uploadBroadcastMedia(file: File): Observable<NotificationMediaUpload> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ApiResponse<NotificationMediaUpload>>(
      `${this.apiUrl}/${ApiUrls.notificationAdminMedia}`,
      formData
    ).pipe(map((response) => response.data));
  }

  sendBroadcast(request: AdminSendNotificationRequest): Observable<FcmSendResult> {
    return this.http.post<ApiResponse<FcmSendResult>>(`${this.apiUrl}/${ApiUrls.notificationAdminSend}`, request).pipe(
      map((response) => response.data)
    );
  }
}
