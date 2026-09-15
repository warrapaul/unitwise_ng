import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { signalStore, withComputed, withMethods, withState, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { RoutePaths } from '../../../core/routes/route-paths';
import {
  CheckLoginMethodRequest,
  LoginMethodResponse,
  LoginRequest,
  OtpRequestDto,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetInitiateRequest,
  PasswordSetRequest,
  RegisterRequest,
  VerifyOtpDto
} from '../models/auth.models';

export interface AuthStoreState {
  loading: boolean;
  /** The message alone, for the many places that only render a line of text. */
  error: string | null;
  /**
   * The whole rejection, including `details[]` — the per-field list a 400
   * carries. Auth pages render this through `app-error-card` (§31.2); dropping
   * it left "Request failed" as the only thing a failed signup ever said.
   */
  apiError: ApiError | null;
  loginMethod: LoginMethodResponse | null;
  verificationMessage: string | null;
  passwordResetRequired: boolean;
}

const initialState: AuthStoreState = {
  loading: false,
  error: null,
  apiError: null,
  loginMethod: null,
  verificationMessage: null,
  passwordResetRequired: false
};

/** Every failure lands here, so no auth flow can quietly lose its details. */
function failure(error: unknown): { loading: false; error: string; apiError: ApiError } {
  const apiError = toApiError(error);
  return { loading: false, error: apiError.message, apiError };
}

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    isBusy: computed(() => store.loading()),
    hasLoginMethod: computed(() => !!store.loginMethod())
  })),
  withMethods((store, authService = inject(AuthService), router = inject(Router)) => ({
    async login(request: LoginRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null, passwordResetRequired: false });

      try {
        const auth = await firstValueFrom(authService.login(request));
        patchState(store, {
          loading: false,
          passwordResetRequired: auth.passwordResetRequired,
          verificationMessage: auth.passwordResetRequired ? 'Password reset required' : 'Welcome back'
        });

        await router.navigateByUrl(auth.passwordResetRequired ? RoutePaths.changePassword : RoutePaths.home);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async checkLoginMethod(request: CheckLoginMethodRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        const loginMethod = await firstValueFrom(authService.checkLoginMethod(request));
        patchState(store, { loading: false, loginMethod });
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async requestLoginOtp(request: OtpRequestDto): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        const response = await firstValueFrom(authService.requestLoginOtp(request));
        patchState(store, {
          loading: false,
          verificationMessage: response.message ?? 'OTP sent'
        });
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async confirmLoginOtp(request: VerifyOtpDto): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        await firstValueFrom(authService.verifyLoginOtp(request));
        patchState(store, { loading: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async requestSignupVerification(request: OtpRequestDto): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        const response = await firstValueFrom(authService.requestSignupPhoneVerification(request));
        patchState(store, { loading: false, verificationMessage: response.message ?? 'Verification OTP sent' });
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async confirmSignupVerification(request: VerifyOtpDto): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        const response = await firstValueFrom(authService.confirmSignupPhoneVerification(request));
        patchState(store, { loading: false, verificationMessage: response.message ?? 'Phone verified' });
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async signup(request: RegisterRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        await firstValueFrom(authService.registerUser(request));
        patchState(store, { loading: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async changePassword(request: PasswordChangeRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        await firstValueFrom(authService.changePassword(request));
        patchState(store, { loading: false, passwordResetRequired: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async setPassword(request: PasswordSetRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        await firstValueFrom(authService.setPassword(request));
        patchState(store, { loading: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async initiatePasswordReset(request: PasswordResetInitiateRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        const message = await firstValueFrom(authService.initiatePasswordReset(request));
        patchState(store, { loading: false, verificationMessage: message });
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async confirmPasswordReset(request: PasswordResetConfirmRequest): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        const message = await firstValueFrom(authService.confirmPasswordReset(request));
        patchState(store, { loading: false, verificationMessage: message });
        await router.navigateByUrl(RoutePaths.login);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    async logout(): Promise<void> {
      patchState(store, { loading: true, error: null, apiError: null });
      try {
        await firstValueFrom(authService.logout());
        patchState(store, initialState);
        await router.navigateByUrl(RoutePaths.login);
      } catch (error) {
        patchState(store, failure(error));
      }
    },

    clearMessages(): void {
      patchState(store, { error: null, apiError: null, verificationMessage: null });
    }
  }))
);
