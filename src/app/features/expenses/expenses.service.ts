import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiUrls } from '../../core/constants/api-urls';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { API_URL } from '../../core/tokens/api-url.token';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { Expense, ExpenseSaveRequest, ExpenseSearchParams, ExpenseSummary } from './expenses.models';

/** Money spent on an agency's buildings. */
@Injectable({ providedIn: 'root' })
export class ExpensesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  search(agencyId: number, params: ExpenseSearchParams = {}): Observable<PaginatedResult<Expense>> {
    return this.http.get<PaginatedApiResponse<Expense>>(`${this.apiUrl}/${ApiUrls.expenses(agencyId)}`, { params: buildHttpParams(params) })
      .pipe(map((response) => ({ items: response.data ?? [], pagination: response.pagination })));
  }

  summary(agencyId: number, params: ExpenseSearchParams = {}): Observable<ExpenseSummary> {
    return this.http.get<ApiResponse<ExpenseSummary>>(`${this.apiUrl}/${ApiUrls.expenseSummary(agencyId)}`, { params: buildHttpParams(params) })
      .pipe(map((response) => response.data));
  }

  create(agencyId: number, buildingId: number, request: ExpenseSaveRequest): Observable<Expense> {
    return this.http.post<ApiResponse<Expense>>(`${this.apiUrl}/${ApiUrls.expensesForBuilding(agencyId, buildingId)}`, request)
      .pipe(map((response) => response.data));
  }

  update(agencyId: number, buildingId: number, id: number, request: ExpenseSaveRequest): Observable<Expense> {
    return this.http.put<ApiResponse<Expense>>(`${this.apiUrl}/${ApiUrls.expense(agencyId, buildingId, id)}`, request)
      .pipe(map((response) => response.data));
  }

  attachReceipt(agencyId: number, buildingId: number, id: number, file: File): Observable<Expense> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ApiResponse<Expense>>(`${this.apiUrl}/${ApiUrls.expenseReceipt(agencyId, buildingId, id)}`, body)
      .pipe(map((response) => response.data));
  }

  delete(agencyId: number, buildingId: number, id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.expense(agencyId, buildingId, id)}`).pipe(map(() => undefined));
  }
}
