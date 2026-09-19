import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Marks the requests that *make up* a session refresh — the token exchange and
 * the profile load that follows it.
 *
 * They must never trigger a refresh of their own. The profile load runs inside
 * the refresh observable, so a 401 there would have the expiry interceptor
 * wait on the very refresh that is waiting on it: a hang at bootstrap with no
 * error and no app.
 */
export const REFRESH_FLOW = new HttpContextToken(() => false);

/** Marks a request the expiry interceptor has already replayed once. */
export const RETRIED = new HttpContextToken(() => false);

export function refreshFlowContext(): HttpContext {
  return new HttpContext().set(REFRESH_FLOW, true);
}
