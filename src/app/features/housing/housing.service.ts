import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { buildHttpParams } from '../../shared/utils/query-params.util';
import { AddressDetail, AddressUpsertRequest } from '../addresses/models/address.models';
import {
  AddFloorRequest,
  AddRoomRequest,
  AgencyAdmin,
  AgencyContractSettings,
  BuildingContractSettings,
  AgencyDetail,
  AgencyPreview,
  AgencyPreviewWithRole,
  AgencyPublicIdentity,
  AgencySearchParams,
  AvailableRoomSearchParams,
  BuildingDetail,
  BuildingFloorDetail,
  BuildingNamingConvention,
  BuildingNamingPreview,
  BuildingPreview,
  BuildingPreviewWithRole,
  BuildingSearchParams,
  CreateAgencyAdminRequest,
  CreateAgencyRequest,
  CreateBuildingRequest,
  RoomDetail,
  RoomEffectiveTerms,
  RoomPreview,
  RoomUtility,
  RoomUtilityUpsertRequest,
  UpdateAgencyRequest,
  UpdateBuildingRequest,
  UpdateFloorRequest,
  UpdateRoomRequest,
  UserAgencyMembership
} from './models/housing.models';

/**
 * Agencies, buildings, floors, rooms and room utilities. Most building-scoped
 * endpoints are addressed by `{agencyId}/{buildingId}` because the backend
 * resolves agency-scoped permissions from the path.
 */
@Injectable({ providedIn: 'root' })
export class HousingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // --- Agencies ---

  searchAgencies(params: AgencySearchParams = {}): Observable<PaginatedResult<AgencyPreview>> {
    return this.http.get<PaginatedApiResponse<AgencyPreview>>(`${this.apiUrl}/${ApiUrls.agencies}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  /** An exact code, answered with only the agency's name and logo — no search, no listing. */
  getAgencyByCode(code: string): Observable<AgencyPublicIdentity> {
    return this.http.get<ApiResponse<AgencyPublicIdentity>>(`${this.apiUrl}/${ApiUrls.agencyByCode(code)}`).pipe(
      map((response) => response.data)
    );
  }

  getAgency(agencyId: number): Observable<AgencyDetail> {
    return this.http.get<ApiResponse<AgencyDetail>>(`${this.apiUrl}/${ApiUrls.agencyById(agencyId)}`).pipe(
      map((response) => response.data)
    );
  }

  createAgency(request: CreateAgencyRequest): Observable<AgencyDetail> {
    return this.http.post<ApiResponse<AgencyDetail>>(`${this.apiUrl}/${ApiUrls.agencies}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateAgency(agencyId: number, request: UpdateAgencyRequest): Observable<AgencyDetail> {
    return this.http.patch<ApiResponse<AgencyDetail>>(`${this.apiUrl}/${ApiUrls.agencyById(agencyId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  getAgencyContractSettings(agencyId: number): Observable<AgencyContractSettings> {
    return this.http.get<ApiResponse<AgencyContractSettings>>(
      `${this.apiUrl}/${ApiUrls.agencyContractSettings(agencyId)}`
    ).pipe(map((response) => response.data ?? {}));
  }

  /** Whole-object replace: a null or blank value clears it. */
  updateAgencyContractSettings(agencyId: number, request: AgencyContractSettings): Observable<AgencyContractSettings> {
    return this.http.put<ApiResponse<AgencyContractSettings>>(
      `${this.apiUrl}/${ApiUrls.agencyContractSettings(agencyId)}`,
      request
    ).pipe(map((response) => response.data ?? {}));
  }

  getBuildingContractSettings(agencyId: number, buildingId: number): Observable<BuildingContractSettings> {
    return this.http.get<ApiResponse<BuildingContractSettings>>(
      `${this.apiUrl}/${ApiUrls.buildingContractSettings(agencyId, buildingId)}`
    ).pipe(map((response) => response.data ?? {}));
  }

  /** Whole-object replace; a null value falls back to the agency's. */
  updateBuildingContractSettings(agencyId: number, buildingId: number, request: BuildingContractSettings): Observable<BuildingContractSettings> {
    return this.http.put<ApiResponse<BuildingContractSettings>>(
      `${this.apiUrl}/${ApiUrls.buildingContractSettings(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data ?? {}));
  }

  deleteAgency(agencyId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.agencyById(agencyId)}`).pipe(
      map(() => void 0)
    );
  }

  /** Agencies the signed-in user administers, including their own role in each. */
  /**
   * The caller's own agencies, filtered and paged exactly like `searchAgencies` —
   * same request DTO, same envelope, plus the caller's role in each. The scope is
   * the authenticated user, never a parameter.
   */
  getMyAgencies(params: AgencySearchParams = {}): Observable<PaginatedResult<AgencyPreviewWithRole>> {
    return this.http.get<PaginatedApiResponse<AgencyPreviewWithRole>>(`${this.apiUrl}/${ApiUrls.userAgencies}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  /** Attaches a building the agency already owns; use `createBuilding` for a new one. */
  addBuildingToAgency(agencyId: number, building: BuildingPreview): Observable<BuildingPreview> {
    return this.http.post<ApiResponse<BuildingPreview>>(
      `${this.apiUrl}/${ApiUrls.agencyBuildings(agencyId)}`,
      { agencyId: String(agencyId), building }
    ).pipe(map((response) => response.data));
  }

  getAgencyAddresses(agencyId: number): Observable<AddressDetail[]> {
    return this.http.get<ApiResponse<AddressDetail[]>>(`${this.apiUrl}/${ApiUrls.agencyAddresses(agencyId)}`).pipe(
      map((response) => response.data ?? [])
    );
  }

  addAgencyAddress(agencyId: number, request: AddressUpsertRequest): Observable<AddressDetail> {
    return this.http.post<ApiResponse<AddressDetail>>(`${this.apiUrl}/${ApiUrls.agencyAddresses(agencyId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  /** Links an address that already exists to the agency. */
  linkAgencyAddress(agencyId: number, addressId: number): Observable<AddressDetail> {
    return this.http.post<ApiResponse<AddressDetail>>(
      `${this.apiUrl}/${ApiUrls.agencyAddressById(agencyId, addressId)}`,
      {}
    ).pipe(map((response) => response.data));
  }

  unlinkAgencyAddress(agencyId: number, addressId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.agencyAddressById(agencyId, addressId)}`
    ).pipe(map(() => void 0));
  }

  getAgencyAdmins(agencyId: number): Observable<AgencyAdmin[]> {
    return this.http.get<ApiResponse<AgencyAdmin[]>>(`${this.apiUrl}/${ApiUrls.agencyAdmins(agencyId)}`).pipe(
      map((response) => response.data ?? [])
    );
  }

  addAgencyAdmin(agencyId: number, request: CreateAgencyAdminRequest): Observable<AgencyAdmin> {
    return this.http.post<ApiResponse<AgencyAdmin>>(`${this.apiUrl}/${ApiUrls.agencyAdmins(agencyId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  removeAgencyAdmin(agencyId: number, userId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.agencyAdminById(agencyId, userId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Buildings ---

  searchBuildings(params: BuildingSearchParams = {}): Observable<PaginatedResult<BuildingPreview>> {
    return this.http.get<PaginatedApiResponse<BuildingPreview>>(`${this.apiUrl}/${ApiUrls.buildings}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  getBuildingsForAgency(agencyId: number, params: BuildingSearchParams = {}): Observable<PaginatedResult<BuildingPreview>> {
    return this.http.get<PaginatedApiResponse<BuildingPreview>>(`${this.apiUrl}/${ApiUrls.buildingsByAgency(agencyId)}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  /** Buildings the signed-in user administers, each carrying their role in it. */
  getMyBuildings(params: BuildingSearchParams = {}): Observable<PaginatedResult<BuildingPreviewWithRole>> {
    return this.http.get<PaginatedApiResponse<BuildingPreviewWithRole>>(`${this.apiUrl}/${ApiUrls.userBuildings}`, {
      params: buildHttpParams(params)
    }).pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  getBuilding(agencyId: number, buildingId: number): Observable<BuildingDetail> {
    return this.http.get<ApiResponse<BuildingDetail>>(`${this.apiUrl}/${ApiUrls.buildingById(agencyId, buildingId)}`).pipe(
      map((response) => response.data)
    );
  }

  createBuilding(request: CreateBuildingRequest): Observable<BuildingDetail> {
    return this.http.post<ApiResponse<BuildingDetail>>(`${this.apiUrl}/${ApiUrls.buildings}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateBuilding(agencyId: number, buildingId: number, request: UpdateBuildingRequest): Observable<BuildingDetail> {
    return this.http.patch<ApiResponse<BuildingDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingById(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteBuilding(agencyId: number, buildingId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.buildingById(agencyId, buildingId)}`).pipe(
      map(() => void 0)
    );
  }



  getBuildingAddress(agencyId: number, buildingId: number): Observable<AddressDetail> {
    return this.http.get<ApiResponse<AddressDetail>>(`${this.apiUrl}/${ApiUrls.buildingAddress(agencyId, buildingId)}`).pipe(
      map((response) => response.data)
    );
  }

  setBuildingAddress(agencyId: number, buildingId: number, request: AddressUpsertRequest): Observable<AddressDetail> {
    return this.http.post<ApiResponse<AddressDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingAddress(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  removeBuildingAddress(agencyId: number, buildingId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${ApiUrls.buildingAddress(agencyId, buildingId)}`).pipe(
      map(() => void 0)
    );
  }

  // --- Floors ---

  addFloor(agencyId: number, buildingId: number, request: AddFloorRequest): Observable<BuildingFloorDetail> {
    return this.http.post<ApiResponse<BuildingFloorDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingFloors(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  getFloor(agencyId: number, buildingId: number, floorId: number): Observable<BuildingFloorDetail> {
    return this.http.get<ApiResponse<BuildingFloorDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingFloorById(agencyId, buildingId, floorId)}`
    ).pipe(map((response) => response.data));
  }

  updateFloor(agencyId: number, buildingId: number, floorId: number, request: UpdateFloorRequest): Observable<BuildingFloorDetail> {
    return this.http.patch<ApiResponse<BuildingFloorDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingFloorById(agencyId, buildingId, floorId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteFloor(agencyId: number, buildingId: number, floorId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.buildingFloorById(agencyId, buildingId, floorId)}`
    ).pipe(map(() => void 0));
  }

  // --- Rooms ---

  addRoom(agencyId: number, buildingId: number, floorId: number, request: AddRoomRequest): Observable<RoomDetail> {
    return this.http.post<ApiResponse<RoomDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingFloorRooms(agencyId, buildingId, floorId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  getRoom(agencyId: number, buildingId: number, roomId: number): Observable<RoomDetail> {
    return this.http.get<ApiResponse<RoomDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingRoomById(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data));
  }

  /**
   * The terms a lease for this room would carry, with the level each came from.
   * Prefer this over reading `RoomDetail` for form prefill: the room's own
   * columns are null whenever the building or agency sets the figure.
   */
  getRoomEffectiveTerms(agencyId: number, buildingId: number, roomId: number): Observable<RoomEffectiveTerms> {
    return this.http.get<ApiResponse<RoomEffectiveTerms>>(
      `${this.apiUrl}/${ApiUrls.buildingRoomEffectiveTerms(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data));
  }

  updateRoom(agencyId: number, buildingId: number, roomId: number, request: UpdateRoomRequest): Observable<RoomDetail> {
    return this.http.patch<ApiResponse<RoomDetail>>(
      `${this.apiUrl}/${ApiUrls.buildingRoomById(agencyId, buildingId, roomId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteRoom(agencyId: number, buildingId: number, roomId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.buildingRoomById(agencyId, buildingId, roomId)}`
    ).pipe(map(() => void 0));
  }

  getAvailableRooms(params: AvailableRoomSearchParams = {}): Observable<PaginatedResult<RoomPreview>> {
    return this.http.get<PaginatedApiResponse<RoomPreview>>(`${this.apiUrl}/${ApiUrls.buildingAvailableRooms}`, {
      params: buildHttpParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => ({ items: response.data, pagination: response.pagination }))
    );
  }

  // --- Room / building utilities ---

  getRoomUtilities(agencyId: number, buildingId: number, roomId: number): Observable<RoomUtility[]> {
    return this.http.get<ApiResponse<RoomUtility[]>>(
      `${this.apiUrl}/${ApiUrls.roomUtilities(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  getActiveRoomUtilities(agencyId: number, buildingId: number, roomId: number): Observable<RoomUtility[]> {
    return this.http.get<ApiResponse<RoomUtility[]>>(
      `${this.apiUrl}/${ApiUrls.roomUtilitiesActive(agencyId, buildingId, roomId)}`
    ).pipe(map((response) => response.data ?? []));
  }

  addRoomUtility(agencyId: number, buildingId: number, roomId: number, request: RoomUtilityUpsertRequest): Observable<RoomUtility> {
    return this.http.post<ApiResponse<RoomUtility>>(
      `${this.apiUrl}/${ApiUrls.roomUtilities(agencyId, buildingId, roomId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteRoomUtilities(agencyId: number, buildingId: number, roomId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.roomUtilities(agencyId, buildingId, roomId)}`
    ).pipe(map(() => void 0));
  }

  getBuildingUtilities(agencyId: number, buildingId: number): Observable<RoomUtility[]> {
    return this.http.get<ApiResponse<RoomUtility[]>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilities(agencyId, buildingId)}`
    ).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  /**
   * Adds the utility to every room in the building, so the response is one row
   * per room — not the single record the name suggests. Typed as one for a long
   * time, which is why a created building utility never appeared in the table:
   * the page pushed an array into its list of rows.
   */
  addBuildingUtility(agencyId: number, buildingId: number, request: RoomUtilityUpsertRequest): Observable<RoomUtility[]> {
    return this.http.post<ApiResponse<RoomUtility[]>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilities(agencyId, buildingId)}`,
      request
    ).pipe(map((response) => response.data ?? []));
  }

  getUtility(agencyId: number, buildingId: number, utilityId: number): Observable<RoomUtility> {
    return this.http.get<ApiResponse<RoomUtility>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilityById(agencyId, buildingId, utilityId)}`
    ).pipe(map((response) => response.data));
  }

  updateUtility(agencyId: number, buildingId: number, utilityId: number, request: Partial<RoomUtilityUpsertRequest>): Observable<RoomUtility> {
    return this.http.patch<ApiResponse<RoomUtility>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilityById(agencyId, buildingId, utilityId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  deleteUtility(agencyId: number, buildingId: number, utilityId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilityById(agencyId, buildingId, utilityId)}`
    ).pipe(map(() => void 0));
  }

  applyUtilityToAllRooms(agencyId: number, buildingId: number, utilityId: number): Observable<void> {
    return this.http.patch<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilityApplyToAll(agencyId, buildingId, utilityId)}`,
      {}
    ).pipe(map(() => void 0));
  }

  removeUtilityFromAllRooms(agencyId: number, buildingId: number, utilityId: number): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${ApiUrls.buildingUtilityRemoveFromAll(agencyId, buildingId, utilityId)}`
    ).pipe(map(() => void 0));
  }
}
