import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import {
  ChannelPolicy,
  ChannelPreference,
  NotificationReference,
  UpdateChannelPolicyRequest,
  UpdateChannelPreferenceRequest
} from './models/notification-channel.models';

/**
 * Which channel each kind of message travels on.
 *
 * Two audiences, deliberately separate endpoints: a super admin sets the
 * platform **policy** per topic, and each person sets their own **preference**
 * within what that policy allows.
 */
@Injectable({ providedIn: 'root' })
export class NotificationChannelService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  /** Channels and topics the backend knows about — no user-specific data. */
  getReference(): Observable<NotificationReference> {
    return this.http.get<ApiResponse<NotificationReference>>(
      `${this.apiUrl}/${ApiUrls.notificationChannelReference}`
    ).pipe(map((response) => response.data));
  }

  getPolicies(): Observable<ChannelPolicy[]> {
    return this.http.get<ApiResponse<ChannelPolicy[]>>(
      `${this.apiUrl}/${ApiUrls.notificationChannelPolicies}`
    ).pipe(map((response) => response.data ?? []));
  }

  updatePolicy(topic: string, request: UpdateChannelPolicyRequest): Observable<ChannelPolicy> {
    return this.http.put<ApiResponse<ChannelPolicy>>(
      `${this.apiUrl}/${ApiUrls.notificationChannelPolicy(topic)}`,
      request
    ).pipe(map((response) => response.data));
  }

  getMyPreferences(): Observable<ChannelPreference[]> {
    return this.http.get<ApiResponse<ChannelPreference[]>>(
      `${this.apiUrl}/${ApiUrls.notificationChannelPreferences}`
    ).pipe(map((response) => response.data ?? []));
  }

  updateMyPreference(topic: string, request: UpdateChannelPreferenceRequest): Observable<ChannelPreference> {
    return this.http.put<ApiResponse<ChannelPreference>>(
      `${this.apiUrl}/${ApiUrls.notificationChannelPreference(topic)}`,
      request
    ).pipe(map((response) => response.data));
  }
}
