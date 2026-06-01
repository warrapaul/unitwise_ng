import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import {
  AddressDetail,
  AddressPreview,
  AddressSearchParams,
  AddressUpsertRequest,
  CityUpsertRequest,
  CityOption,
  CountyUpsertRequest,
  CountyOption,
  TownUpsertRequest,
  TownOption
} from './models/address.models';

@Injectable({ providedIn: 'root' })
export class AddressesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getAddresses(params: AddressSearchParams): Observable<PaginatedResult<AddressPreview>> {
    return this.http.get<PaginatedApiResponse<AddressPreview>>(
      `${this.apiUrl}/${ApiUrls.addresses}`,
      { params: this.toHttpParams(params) }
    ).pipe(map((response) => this.toPaginatedResult(response)));
  }

  getAddress(addressId: number): Observable<AddressDetail> {
    return this.http.get<ApiResponse<AddressDetail>>(`${this.apiUrl}/${ApiUrls.addressById(addressId)}`).pipe(
      map((response) => response.data)
    );
  }

  createAddress(request: AddressUpsertRequest): Observable<AddressDetail> {
    return this.http.post<ApiResponse<AddressDetail>>(`${this.apiUrl}/${ApiUrls.addresses}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateAddress(addressId: number, request: AddressUpsertRequest): Observable<AddressDetail> {
    return this.http.patch<ApiResponse<AddressDetail>>(`${this.apiUrl}/${ApiUrls.addressById(addressId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteAddress(addressId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.addressById(addressId)}`).pipe(
      map(() => void 0)
    );
  }

  getCounties(name?: string): Observable<CountyOption[]> {
    return this.http.get<ApiResponse<CountyOption[]>>(
      `${this.apiUrl}/${ApiUrls.addressCounties}`,
      { params: this.toHttpParams({ name }) }
    ).pipe(map((response) => response.data));
  }

  getCounty(countyId: number): Observable<CountyOption> {
    return this.http.get<ApiResponse<CountyOption>>(`${this.apiUrl}/${ApiUrls.addressCountyById(countyId)}`).pipe(
      map((response) => response.data)
    );
  }

  createCounty(request: CountyUpsertRequest): Observable<CountyOption> {
    return this.http.post<ApiResponse<CountyOption>>(`${this.apiUrl}/${ApiUrls.addressCounties}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateCounty(countyId: number, request: CountyUpsertRequest): Observable<CountyOption> {
    return this.http.patch<ApiResponse<CountyOption>>(`${this.apiUrl}/${ApiUrls.addressCountyById(countyId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteCounty(countyId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.addressCountyById(countyId)}`).pipe(
      map(() => void 0)
    );
  }

  getCities(name?: string): Observable<CityOption[]> {
    return this.http.get<ApiResponse<CityOption[]>>(
      `${this.apiUrl}/${ApiUrls.addressCities}`,
      { params: this.toHttpParams({ name }) }
    ).pipe(map((response) => response.data));
  }

  getCity(cityId: number): Observable<CityOption> {
    return this.http.get<ApiResponse<CityOption>>(`${this.apiUrl}/${ApiUrls.addressCityById(cityId)}`).pipe(
      map((response) => response.data)
    );
  }

  createCity(request: CityUpsertRequest): Observable<CityOption> {
    return this.http.post<ApiResponse<CityOption>>(`${this.apiUrl}/${ApiUrls.addressCities}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateCity(cityId: number, request: CityUpsertRequest): Observable<CityOption> {
    return this.http.patch<ApiResponse<CityOption>>(`${this.apiUrl}/${ApiUrls.addressCityById(cityId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteCity(cityId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.addressCityById(cityId)}`).pipe(
      map(() => void 0)
    );
  }

  getCitiesByCounty(countyId: number, name?: string): Observable<CityOption[]> {
    return this.http.get<ApiResponse<CityOption[]>>(
      `${this.apiUrl}/${ApiUrls.addressCitiesByCounty(countyId)}`,
      { params: this.toHttpParams({ name }) }
    ).pipe(map((response) => response.data));
  }

  getTowns(name?: string): Observable<TownOption[]> {
    return this.http.get<ApiResponse<TownOption[]>>(
      `${this.apiUrl}/${ApiUrls.addressTowns}`,
      { params: this.toHttpParams({ name }) }
    ).pipe(map((response) => response.data));
  }

  getTown(townId: number): Observable<TownOption> {
    return this.http.get<ApiResponse<TownOption>>(`${this.apiUrl}/${ApiUrls.addressTownById(townId)}`).pipe(
      map((response) => response.data)
    );
  }

  createTown(request: TownUpsertRequest): Observable<TownOption> {
    return this.http.post<ApiResponse<TownOption>>(`${this.apiUrl}/${ApiUrls.addressTowns}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateTown(townId: number, request: TownUpsertRequest): Observable<TownOption> {
    return this.http.patch<ApiResponse<TownOption>>(`${this.apiUrl}/${ApiUrls.addressTownById(townId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteTown(townId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${ApiUrls.addressTownById(townId)}`).pipe(
      map(() => void 0)
    );
  }

  getTownsByCity(cityId: number, name?: string): Observable<TownOption[]> {
    return this.http.get<ApiResponse<TownOption[]>>(
      `${this.apiUrl}/${ApiUrls.addressTownsByCity(cityId)}`,
      { params: this.toHttpParams({ name }) }
    ).pipe(map((response) => response.data));
  }

  getTownsByCounty(countyId: number, name?: string): Observable<TownOption[]> {
    return this.http.get<ApiResponse<TownOption[]>>(
      `${this.apiUrl}/${ApiUrls.addressTownsByCounty(countyId)}`,
      { params: this.toHttpParams({ name }) }
    ).pipe(map((response) => response.data));
  }

  private toPaginatedResult<T>(response: PaginatedApiResponse<T>): PaginatedResult<T> {
    return {
      items: response.data,
      pagination: response.pagination
    };
  }

  private toHttpParams(params: object): HttpParams {
    let httpParams = new HttpParams();

    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      httpParams = httpParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }

    return httpParams;
  }
}
