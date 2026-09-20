import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, EMPTY, catchError, finalize, firstValueFrom, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { API_URL } from '../tokens/api-url.token';
import { ApiResponse } from '../models/api-response.model';
import { JwtResponseDto, UserAccessProfile } from '../models/auth.models';
import { AuthSessionService } from '../services/auth-session.service';
import { ApiUrls } from '../constants/api-urls';
import { refreshFlowContext } from '../interceptors/session-context';
import {
  AdminPasswordResetRequest,
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
  private inFlightRefresh?: Observable<JwtResponseDto>;

  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly session = inject(AuthSessionService);

  login(request: LoginRequest): Observable<JwtResponseDto> {
    return this.http.post<ApiResponse<JwtResponseDto>>(`${this.apiUrl}/${ApiUrls.login}`, request).pipe(
      map((response) => response.data),
      switchMap((auth) => this.hydrateSession(auth))
    );
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

  /**
   * One refresh at a time, shared by everyone waiting on it.
   *
   * A revoked device 401s on every request it has in flight, and each of those
   * would otherwise start its own refresh — a burst of calls racing to rotate
   * the same token, where all but the winner fail against a token the server
   * has already replaced. The first caller starts the exchange and the rest
   * subscribe to the same result.
   *
   * Completes without a value when there is no refresh token to spend, so a
   * caller must treat an empty result as a failure rather than a success.
   */
  refreshSessionOnce(): Observable<JwtResponseDto> {
    this.inFlightRefresh ??= this.refreshToken().pipe(
      finalize(() => {
        this.inFlightRefresh = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.inFlightRefresh;
  }

  refreshToken(): Observable<JwtResponseDto> {
    const refreshToken = this.session.getRefreshToken();
    if (!refreshToken) {
      return EMPTY;
    }

    return this.http.post<ApiResponse<JwtResponseDto>>(`${this.apiUrl}/${ApiUrls.refreshToken}`, {
      refreshToken
    }, { context: refreshFlowContext() }).pipe(
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

  /**
   * Ends every *other* session and keeps this one. The backend stamps a
   * force-logout cutoff 1ms before this request's token was issued, so every
   * token but the current one is rejected from here on.
   *
   * The response must be stored, not discarded: the old refresh token was
   * deleted along with the other sessions and a new one comes back in its
   * place. Dropping it leaves this device holding a revoked refresh token and
   * signed out at the next silent refresh — the one outcome the feature exists
   * to avoid.
   *
   * A failure leaves the session alone. Nothing was revoked, so clearing it
   * would sign the user out of the device they were trying to protect.
   */
  logoutAllDevices(): Observable<void> {
    return this.http.post<ApiResponse<JwtResponseDto>>(`${this.apiUrl}/${ApiUrls.logoutAllDevices}`, {}).pipe(
      tap((response) => this.session.setSession(response.data)),
      map(() => void 0)
    );
  }

  /** Admin action: ends every session for another user. */
  forceLogout(userId: number): Observable<void> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.adminForceLogout(userId)}`, {}).pipe(
      map(() => void 0)
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

  /**
   * Rebuilds the session on a reload.
   *
   * A password-reset-required login has an access token and no refresh token,
   * so there is nothing to refresh — but the stored access token is exactly what
   * `password-change` needs, and clearing it would strand the operator on that
   * screen. Keep it, skip the profile load it is not entitled to make, and let
   * the change-password response replace it with a full session.
   */
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

  /**
   * The profile load that completes a refresh. Same request, tagged so a 401
   * on it cannot re-enter the refresh it is part of.
   */
  private getProfileForRefresh(): Observable<UserAccessProfile> {
    return this.http.get<ApiResponse<UserAccessProfile>>(
      `${this.apiUrl}/${ApiUrls.userProfile}`,
      { context: refreshFlowContext() }
    ).pipe(map((response) => response.data));
  }


  private hydrateSession(auth: JwtResponseDto): Observable<JwtResponseDto> {
    this.session.setSession(auth);
    this.session.setUserProfile(null);

    if (auth.passwordResetRequired) {
      return of(auth);
    }

    return this.getProfileForRefresh().pipe(
      tap((profile) => this.session.setUserProfile(profile)),
      map(() => auth),
      catchError((error) => {
        this.session.clear();
        return throwError(() => error);
      })
    );
  }
}
