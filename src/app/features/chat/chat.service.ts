import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { ChatMessage, Conversation, SendMessageRequest } from './models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getMyConversations(params: { page?: number; size?: number } = {}): Observable<PaginatedResult<Conversation>> {
    return this.http.get<PaginatedApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatMyConversations}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  /** Unassigned conversations waiting for an admin to pick them up. */
  getOpenConversations(params: { page?: number; size?: number } = {}): Observable<PaginatedResult<Conversation>> {
    return this.http.get<PaginatedApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatOpenConversations}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  /** Conversations the signed-in admin has claimed. */
  getClaimedConversations(params: { page?: number; size?: number } = {}): Observable<PaginatedResult<Conversation>> {
    return this.http.get<PaginatedApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatClaimedConversations}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  startConversation(): Observable<Conversation> {
    return this.http.post<ApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatStartConversation}`, {}).pipe(
      map((response) => response.data)
    );
  }

  getMessages(conversationId: number, params: { page?: number; size?: number } = {}): Observable<PaginatedResult<ChatMessage>> {
    return this.http.get<PaginatedApiResponse<ChatMessage>>(`${this.apiUrl}/${ApiUrls.chatMessages(conversationId)}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  sendTextMessage(conversationId: number, request: SendMessageRequest): Observable<ChatMessage> {
    return this.http.post<ApiResponse<ChatMessage>>(
      `${this.apiUrl}/${ApiUrls.chatMessages(conversationId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  /** Same URL as `sendTextMessage`, but multipart — mirrors the backend's second @PostMapping. */
  sendMessageWithAttachment(conversationId: number, request: SendMessageRequest, file: File): Observable<ChatMessage> {
    const formData = new FormData();
    formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    formData.append('file', file);

    return this.http.post<ApiResponse<ChatMessage>>(
      `${this.apiUrl}/${ApiUrls.chatMessages(conversationId)}`,
      formData
    ).pipe(map((response) => response.data));
  }

  claimConversation(conversationId: number): Observable<Conversation> {
    return this.http.post<ApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatClaim(conversationId)}`, {}).pipe(
      map((response) => response.data)
    );
  }

  unclaimConversation(conversationId: number): Observable<Conversation> {
    return this.http.post<ApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatUnclaim(conversationId)}`, {}).pipe(
      map((response) => response.data)
    );
  }

  closeConversation(conversationId: number): Observable<Conversation> {
    return this.http.post<ApiResponse<Conversation>>(`${this.apiUrl}/${ApiUrls.chatClose(conversationId)}`, {}).pipe(
      map((response) => response.data)
    );
  }
}
