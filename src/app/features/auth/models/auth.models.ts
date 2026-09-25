/**
 * Password sign-in by email or by phone number — exactly one is sent. Accounts
 * are keyed by phone; email is a second way in for those who have one.
 */
export interface LoginRequest {
  email?: string;
  phoneNumber?: string;
  password: string;
}

export interface OtpRequestDto {
  phoneNumber: string;
}

export interface VerifyOtpDto {
  phoneNumber: string;
  otp: string;
}

export interface OtpRequestResponse {
  success?: boolean;
  message?: string;
  phoneNumber?: string;
  otpReference?: string;
  expiresInSeconds?: number;
}

export interface VerifyOtpResponse {
  success: boolean;
  message?: string;
  verificationToken?: string;
  requiresCompletion?: boolean;
}

export interface RegisterRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
}

export interface PasswordSetRequest {
  password: string;
  phoneNumber: string;
  verificationToken: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordResetInitiateRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

export interface AdminPasswordResetRequest {
  userId: number;
}

/** The signup form, held between the details step and the code step. */
export const SIGNUP_DRAFT_KEY = 'signup-draft';

/** Mirrors PasswordValidator on the server, which RegisterRequest's own @Size understates. */
export const MIN_PASSWORD_LENGTH = 8;
