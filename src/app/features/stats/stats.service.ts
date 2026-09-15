import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import {
  AgencyOverview,
  AgencyTrends,
  BuildingBreakdown,
  CaretakerOverview,
  CaretakerRentStatus,
  EcomCatalog,
  EcomCustomers,
  EcomFulfilment,
  EcomOverview,
  EcomSales,
  EcomTrends,
  EcomVouchers,
  MovementSchedule,
  TenantOnboarding,
  TenantOverview,
  TenantRentStatement,
  GeoCoverage,
  OccupancyMovement,
  OnboardingFunnel,
  PlatformOperations,
  PlatformOverview,
  PlatformTrends,
  RentCollectionStats,
  StatsQuery
} from './models/stats.models';

/**
 * Dashboard figures, one endpoint per scope.
 *
 * The scope is the permission, not a parameter: a caretaker's endpoint reads
 * their own building assignments, and the agency one is authorised against the
 * agency in its path. Nothing here lets a caller widen what they are shown.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getPlatformOverview(query: StatsQuery = {}): Observable<PlatformOverview> {
    return this.http.get<ApiResponse<PlatformOverview>>(`${this.apiUrl}/${ApiUrls.statsPlatformOverview}`, {
      params: buildHttpParams(query)
    }).pipe(retry({ count: 1, delay: 1000 }), map((response) => response.data));
  }

  getAgencyOverview(agencyId: number, query: StatsQuery = {}): Observable<AgencyOverview> {
    return this.http.get<ApiResponse<AgencyOverview>>(`${this.apiUrl}/${ApiUrls.statsAgencyOverview(agencyId)}`, {
      params: buildHttpParams(query)
    }).pipe(retry({ count: 1, delay: 1000 }), map((response) => response.data));
  }

  getCaretakerOverview(query: StatsQuery = {}): Observable<CaretakerOverview> {
    return this.http.get<ApiResponse<CaretakerOverview>>(`${this.apiUrl}/${ApiUrls.statsCaretakerOverview}`, {
      params: buildHttpParams(query)
    }).pipe(retry({ count: 1, delay: 1000 }), map((response) => response.data));
  }

  getEcomOverview(query: StatsQuery = {}): Observable<EcomOverview> {
    return this.http.get<ApiResponse<EcomOverview>>(`${this.apiUrl}/${ApiUrls.statsEcomOverview}`, {
      params: buildHttpParams(query)
    }).pipe(retry({ count: 1, delay: 1000 }), map((response) => response.data));
  }

  // --- Agency detail ---

  getAgencyRent(agencyId: number, query: StatsQuery = {}): Observable<RentCollectionStats> {
    return this.get<RentCollectionStats>(ApiUrls.statsAgencyRent(agencyId), query);
  }

  getAgencyOccupancyMovement(agencyId: number, query: StatsQuery = {}): Observable<OccupancyMovement> {
    return this.get<OccupancyMovement>(ApiUrls.statsAgencyOccupancyMovement(agencyId), query);
  }

  getAgencyBuildings(agencyId: number, query: StatsQuery = {}): Observable<BuildingBreakdown> {
    return this.get<BuildingBreakdown>(ApiUrls.statsAgencyBuildings(agencyId), query);
  }

  getAgencyTrends(agencyId: number, query: StatsQuery = {}): Observable<AgencyTrends> {
    return this.get<AgencyTrends>(ApiUrls.statsAgencyTrends(agencyId), query);
  }

  // --- Platform detail ---

  getPlatformOperations(query: StatsQuery = {}): Observable<PlatformOperations> {
    return this.get<PlatformOperations>(ApiUrls.statsPlatformOperations, query);
  }

  getPlatformOnboarding(query: StatsQuery = {}): Observable<OnboardingFunnel> {
    return this.get<OnboardingFunnel>(ApiUrls.statsPlatformOnboarding, query);
  }

  getPlatformGeo(query: StatsQuery = {}): Observable<GeoCoverage> {
    return this.get<GeoCoverage>(ApiUrls.statsPlatformGeo, query);
  }

  getPlatformTrends(query: StatsQuery = {}): Observable<PlatformTrends> {
    return this.get<PlatformTrends>(ApiUrls.statsPlatformTrends, query);
  }

  // --- Tenant (the signed-in user's own tenancies) ---

  /**
   * `tenantId` selects between tenancies when someone holds several; omitted,
   * the server picks their primary one. It is authorised against ownership, so
   * it can never widen what is returned.
   */
  getMyOverview(tenantId?: number | null, query: StatsQuery = {}): Observable<TenantOverview> {
    return this.get<TenantOverview>(ApiUrls.statsMyOverview, { ...query, ...(tenantId ? { tenantId } : {}) });
  }

  getMyRent(tenantId?: number | null, query: StatsQuery = {}): Observable<TenantRentStatement> {
    return this.get<TenantRentStatement>(ApiUrls.statsMyRent, { ...query, ...(tenantId ? { tenantId } : {}) });
  }

  getMyOnboarding(query: StatsQuery = {}): Observable<TenantOnboarding> {
    return this.get<TenantOnboarding>(ApiUrls.statsMyOnboarding, query);
  }

  // --- Caretaker detail ---

  getCaretakerRentStatus(query: StatsQuery = {}): Observable<CaretakerRentStatus> {
    return this.get<CaretakerRentStatus>(ApiUrls.statsCaretakerRentStatus, query);
  }

  getCaretakerSchedule(query: StatsQuery = {}): Observable<MovementSchedule> {
    return this.get<MovementSchedule>(ApiUrls.statsCaretakerMovementSchedule, query);
  }

  // --- Ecommerce detail ---

  getEcomSales(query: StatsQuery = {}): Observable<EcomSales> {
    return this.get<EcomSales>(ApiUrls.statsEcomSales, query);
  }

  getEcomFulfilment(query: StatsQuery = {}): Observable<EcomFulfilment> {
    return this.get<EcomFulfilment>(ApiUrls.statsEcomFulfilment, query);
  }

  getEcomCatalog(query: StatsQuery = {}): Observable<EcomCatalog> {
    return this.get<EcomCatalog>(ApiUrls.statsEcomCatalog, query);
  }

  getEcomCustomers(query: StatsQuery = {}): Observable<EcomCustomers> {
    return this.get<EcomCustomers>(ApiUrls.statsEcomCustomers, query);
  }

  getEcomVouchers(query: StatsQuery = {}): Observable<EcomVouchers> {
    return this.get<EcomVouchers>(ApiUrls.statsEcomVouchers, query);
  }

  getEcomTrends(query: StatsQuery = {}): Observable<EcomTrends> {
    return this.get<EcomTrends>(ApiUrls.statsEcomTrends, query);
  }

  /** One retry: a dashboard panel that fails is a panel, not the page. */
  private get<T>(path: string, query: StatsQuery): Observable<T> {
    return this.http.get<ApiResponse<T>>(`${this.apiUrl}/${path}`, {
      params: buildHttpParams(query)
    }).pipe(retry({ count: 1, delay: 1000 }), map((response) => response.data));
  }
}
