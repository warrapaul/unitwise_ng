/**
 * The proof, from a sign-in by code, that lets this tab set a new password
 * without the current one — the way back for someone who forgot it.
 *
 * Session storage, not local: it belongs to the tab that verified the code and
 * dies with it. The server allows one use within 15 minutes; the expiry here
 * only stops offering the shortcut once the server would refuse it.
 */
const KEY = 'otp-password-token';
const LIFETIME_MS = 14 * 60 * 1000;

export function rememberOtpPasswordToken(token: string | null | undefined): void {
  try {
    if (token) {
      sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt: Date.now() + LIFETIME_MS }));
    }
  } catch {
    // Storage blocked: the user falls back to entering their current password.
  }
}

export function readOtpPasswordToken(): string | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { token: string; expiresAt: number } | null;
    if (!stored || stored.expiresAt < Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return stored.token;
  } catch {
    return null;
  }
}

export function forgetOtpPasswordToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
