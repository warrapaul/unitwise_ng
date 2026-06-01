import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { signalStore, withComputed, withMethods, withState, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
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
  error: string | null;
  loginMethod: LoginMethodResponse | null;
  verificationMessage: string | null;
  passwordResetRequired: boolean;
}

const initialState: AuthStoreState = {
  loading: false,
  error: null,
  loginMethod: null,
  verificationMessage: null,
  passwordResetRequired: false
};

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const backendError = (error as { error?: { message?: string } }).error;
    return backendError?.message ?? 'Request failed';
  }

  return 'Request failed';
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
      patchState(store, { loading: true, error: null, passwordResetRequired: false });

      try {
        const auth = await firstValueFrom(authService.login(request));
        patchState(store, {
          loading: false,
          passwordResetRequired: auth.passwordResetRequired,
          verificationMessage: auth.passwordResetRequired ? 'Password reset required' : 'Welcome back'
        });

        await router.navigateByUrl(auth.passwordResetRequired ? RoutePaths.changePassword : RoutePaths.home);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async checkLoginMethod(request: CheckLoginMethodRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const loginMethod = await firstValueFrom(authService.checkLoginMethod(request));
        patchState(store, { loading: false, loginMethod });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async requestLoginOtp(request: OtpRequestDto): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const response = await firstValueFrom(authService.requestLoginOtp(request));
        patchState(store, {
          loading: false,
          verificationMessage: response.message ?? 'OTP sent'
        });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async confirmLoginOtp(request: VerifyOtpDto): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        await firstValueFrom(authService.verifyLoginOtp(request));
        patchState(store, { loading: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async requestSignupVerification(request: OtpRequestDto): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const response = await firstValueFrom(authService.requestSignupPhoneVerification(request));
        patchState(store, { loading: false, verificationMessage: response.message ?? 'Verification OTP sent' });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async confirmSignupVerification(request: VerifyOtpDto): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const response = await firstValueFrom(authService.confirmSignupPhoneVerification(request));
        patchState(store, { loading: false, verificationMessage: response.message ?? 'Phone verified' });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async signup(request: RegisterRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        await firstValueFrom(authService.registerUser(request));
        patchState(store, { loading: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async changePassword(request: PasswordChangeRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        await firstValueFrom(authService.changePassword(request));
        patchState(store, { loading: false, passwordResetRequired: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async setPassword(request: PasswordSetRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        await firstValueFrom(authService.setPassword(request));
        patchState(store, { loading: false });
        await router.navigateByUrl(RoutePaths.home);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async initiatePasswordReset(request: PasswordResetInitiateRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const message = await firstValueFrom(authService.initiatePasswordReset(request));
        patchState(store, { loading: false, verificationMessage: message });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async confirmPasswordReset(request: PasswordResetConfirmRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const message = await firstValueFrom(authService.confirmPasswordReset(request));
        patchState(store, { loading: false, verificationMessage: message });
        await router.navigateByUrl(RoutePaths.login);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async logout(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        await firstValueFrom(authService.logout());
        patchState(store, initialState);
        await router.navigateByUrl(RoutePaths.login);
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    clearMessages(): void {
      patchState(store, { error: null, verificationMessage: null });
    }
  }))
);
