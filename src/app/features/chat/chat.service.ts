import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { BroadcastRequest, BroadcastResult, ChatThread, PostingPolicy, ThreadMessage } from './models/chat.models';

type Paging = { page?: number; size?: number };

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // --- lists ---

  /** Everything the signed-in person is a member of: their tenancy threads, channels, shop threads. */
  getMyThreads(params: Paging = {}): Observable<PaginatedResult<ChatThread>> {
    return this.page<ChatThread>(ApiUrls.chatThreadsMine, params);
  }

  /** The staff inbox for an agency, optionally one building. */
  getAgencyThreads(agencyId: number, params: Paging & { buildingId?: number | null } = {}): Observable<PaginatedResult<ChatThread>> {
    return this.page<ChatThread>(ApiUrls.chatThreadsForAgency(agencyId), params);
  }

  /** The shop admins' inbox. */
  getShopThreads(params: Paging & { customerUserId?: number | null; orderId?: number | null } = {}): Observable<PaginatedResult<ChatThread>> {
    return this.page<ChatThread>(ApiUrls.chatThreadsShop, params);
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<ApiResponse<{ unreadCount?: number }>>(`${this.apiUrl}/${ApiUrls.chatThreadsUnreadCount}`)
      .pipe(map((response) => response.data?.unreadCount ?? 0));
  }

  // --- opening (each returns the existing thread or starts one) ---

  openTenancyAsStaff(agencyId: number, buildingId: number, tenantId: number): Observable<ChatThread> {
    return this.post<ChatThread>(ApiUrls.chatThreadTenancyAsStaff(agencyId, buildingId, tenantId));
  }

  openTenancyAsTenant(tenantId: number): Observable<ChatThread> {
    return this.post<ChatThread>(ApiUrls.chatThreadTenancyAsTenant(tenantId));
  }

  openBuildingChannel(agencyId: number, buildingId: number): Observable<ChatThread> {
    return this.post<ChatThread>(ApiUrls.chatThreadBuildingChannel(agencyId, buildingId));
  }

  /** A general enquiry, or one about the given order. */
  openShopAsCustomer(orderId?: number | null): Observable<ChatThread> {
    return this.post<ChatThread>(ApiUrls.chatThreadShopAsCustomer, orderId ? { orderId } : {});
  }

  openShopAsAdmin(customerUserId: number, orderId?: number | null): Observable<ChatThread> {
    return this.post<ChatThread>(ApiUrls.chatThreadShopAsAdmin(customerUserId), orderId ? { orderId } : {});
  }

  // --- a thread ---

  /** Newest first, as the server pages them. */
  getMessages(threadId: number, params: Paging = {}): Observable<PaginatedResult<ThreadMessage>> {
    return this.page<ThreadMessage>(ApiUrls.chatThreadMessages(threadId), params);
  }

  send(threadId: number, content: string): Observable<ThreadMessage> {
    return this.http.post<ApiResponse<ThreadMessage>>(`${this.apiUrl}/${ApiUrls.chatThreadMessages(threadId)}`, { content })
      .pipe(map((response) => response.data));
  }

  markRead(threadId: number): Observable<void> {
    return this.http.patch<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.chatThreadRead(threadId)}`, {})
      .pipe(map(() => void 0));
  }

  setPostingPolicy(threadId: number, postingPolicy: PostingPolicy): Observable<ChatThread> {
    return this.http.patch<ApiResponse<ChatThread>>(`${this.apiUrl}/${ApiUrls.chatThreadPostingPolicy(threadId)}`, { postingPolicy })
      .pipe(map((response) => response.data));
  }

  broadcast(agencyId: number, request: BroadcastRequest): Observable<BroadcastResult> {
    return this.http.post<ApiResponse<BroadcastResult>>(`${this.apiUrl}/${ApiUrls.chatBroadcast(agencyId)}`, request)
      .pipe(map((response) => response.data));
  }

  private page<T>(url: string, params: object): Observable<PaginatedResult<T>> {
    return this.http.get<PaginatedApiResponse<T>>(`${this.apiUrl}/${url}`, { params: buildHttpParams(params) })
      .pipe(map((response) => ({ items: response.data ?? [], pagination: response.pagination })));
  }

  private post<T>(url: string, query: Record<string, number> = {}): Observable<T> {
    return this.http.post<ApiResponse<T>>(`${this.apiUrl}/${url}`, {}, { params: buildHttpParams(query) })
      .pipe(map((response) => response.data));
  }
}
