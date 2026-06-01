import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, EMPTY, catchError, firstValueFrom, map, of, switchMap, tap, throwError } from 'rxjs';
import { API_URL } from '../tokens/api-url.token';
import { ApiResponse } from '../models/api-response.model';
import { JwtResponseDto, UserAccessProfile } from '../models/auth.models';
import { AuthSessionService } from '../services/auth-session.service';
import { ApiUrls } from '../constants/api-urls';
import {
  AdminPasswordResetRequest,
  CheckLoginMethodRequest,
  LoginMethodResponse,
  LoginRequest,
  OtpRequestDto,
  OtpRequestResponse,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetInitiateRequest,
  PasswordSetRequest,
  RegisterRequest,
  VerifyOtpDto,
  VerifyOtpResponse
} from '../../features/auth/models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly session = inject(AuthSessionService);

  login(request: LoginRequest): Observable<JwtResponseDto> {
    return this.http.post<ApiResponse<JwtResponseDto>>(`${this.apiUrl}/${ApiUrls.login}`, request).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
  }

  checkLoginMethod(request: CheckLoginMethodRequest): Observable<LoginMethodResponse> {
    return this.http.post<ApiResponse<LoginMethodResponse>>(
      `${this.apiUrl}/${ApiUrls.checkLoginMethod}`,
      request
    ).pipe(map((response) => response.data));
  }

  requestLoginOtp(request: OtpRequestDto): Observable<OtpRequestResponse> {
    return this.http.post<ApiResponse<OtpRequestResponse>>(
      `${this.apiUrl}/${ApiUrls.loginOtpRequest}`,
      request
    ).pipe(map((response) => response.data));
  }

  verifyLoginOtp(request: VerifyOtpDto): Observable<JwtResponseDto> {
    return this.http.post<ApiResponse<JwtResponseDto>>(
      `${this.apiUrl}/${ApiUrls.loginOtpConfirm}`,
      request
    ).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
  }

  requestSignupPhoneVerification(request: OtpRequestDto): Observable<OtpRequestResponse> {
    return this.http.post<ApiResponse<OtpRequestResponse>>(
      `${this.apiUrl}/${ApiUrls.signupVerifyPhoneRequest}`,
      request
    ).pipe(map((response) => response.data));
  }

  confirmSignupPhoneVerification(request: VerifyOtpDto): Observable<VerifyOtpResponse> {
    return this.http.post<ApiResponse<VerifyOtpResponse>>(
      `${this.apiUrl}/${ApiUrls.signupVerifyPhoneConfirm}`,
      request
    ).pipe(map((response) => response.data));
  }

  registerUser(request: RegisterRequest): Observable<JwtResponseDto> {
    return this.http.post<ApiResponse<JwtResponseDto>>(`${this.apiUrl}/${ApiUrls.signup}`, request).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
  }

  refreshToken(): Observable<JwtResponseDto> {
    const refreshToken = this.session.getRefreshToken();
    if (!refreshToken) {
      return EMPTY;
    }

    return this.http.post<ApiResponse<JwtResponseDto>>(`${this.apiUrl}/${ApiUrls.refreshToken}`, {
      refreshToken
    }).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
  }

  logout(): Observable<void> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.logout}`, {}).pipe(
      map(() => void 0),
      tap(() => this.session.clear()),
      catchError(() => {
        this.session.clear();
        return of(void 0);
      })
    );
  }

  initiatePasswordReset(request: PasswordResetInitiateRequest): Observable<string> {
    return this.http.post<ApiResponse<string>>(
      `${this.apiUrl}/${ApiUrls.passwordResetInitiate}`,
      request
    ).pipe(map((response) => response.data ?? response.message));
  }

  adminInitiatePasswordReset(request: AdminPasswordResetRequest): Observable<string> {
    return this.http.post<ApiResponse<string>>(
      `${this.apiUrl}/${ApiUrls.passwordResetAdminInitiate}`,
      request
    ).pipe(map((response) => response.data ?? response.message));
  }

  confirmPasswordReset(request: PasswordResetConfirmRequest): Observable<string> {
    return this.http.post<ApiResponse<string>>(
      `${this.apiUrl}/${ApiUrls.passwordResetConfirm}`,
      request
    ).pipe(map((response) => response.data ?? response.message));
  }

  changePassword(request: PasswordChangeRequest): Observable<JwtResponseDto> {
    return this.http.post<ApiResponse<JwtResponseDto>>(
      `${this.apiUrl}/${ApiUrls.passwordChange}`,
      request
    ).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
  }

  setPassword(request: PasswordSetRequest): Observable<JwtResponseDto> {
    return this.http.post<ApiResponse<JwtResponseDto>>(
      `${this.apiUrl}/${ApiUrls.passwordSet}`,
      request
    ).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
  }

  restoreSession(): Promise<void> {
    if (!this.session.getRefreshToken()) {
      return Promise.resolve();
    }

    return firstValueFrom(
      this.refreshToken().pipe(
        catchError(() => {
          this.session.clear();
          return of(null);
        })
      )
    ).then(() => void 0);
  }

  getCurrentUserProfile(): Observable<UserAccessProfile> {
    return this.http.get<ApiResponse<UserAccessProfile>>(`${this.apiUrl}/${ApiUrls.userProfile}`).pipe(
      map((response) => response.data)
    );
  }

  private hydrateSession(auth: JwtResponseDto): Observable<JwtResponseDto> {
    this.session.setSession(auth);
    this.session.setUserProfile(null);

    if (auth.passwordResetRequired) {
      return of(auth);
    }

    return this.getCurrentUserProfile().pipe(
      tap((profile) => this.session.setUserProfile(profile)),
      map(() => auth),
      catchError((error) => {
        this.session.clear();
        return throwError(() => error);
      })
    );
  }
}
