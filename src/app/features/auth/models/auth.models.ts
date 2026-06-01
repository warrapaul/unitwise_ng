export interface LoginRequest {
  email: string;
  password: string;
}

export interface CheckLoginMethodRequest {
  phoneNumber: string;
}

export interface LoginMethodResponse {
  requiresPassword: boolean;
  temporary: boolean;
  message?: string;
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
  nationalIdNumber: string;
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
