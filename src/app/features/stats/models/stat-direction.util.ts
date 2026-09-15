import { StatMetric } from './stats.models';

/**
 * Metrics where a fall is the good news.
 *
 * Declared, not inferred. Colour on a delta has to say *good or bad*, never up
 * or down — a rise in arrears and a rise in collections are the same arrow and
 * opposite news — and guessing that from a metric's name would be wrong the
 * first time the backend adds one this list has not heard of. Anything missing
 * here shows its movement without a verdict, which is the honest default.
 */
const LOWER_IS_BETTER: ReadonlySet<string> = new Set([
  // Rent and arrears
  'outstanding', 'rentOutstanding', 'overdue', 'tenantsOverdue', 'tenantsPending',
  'lateFees', 'arrears',

  // Rooms and tenancies
  'vacant', 'underMaintenance', 'needsRepair', 'inArrears', 'noticeGiven',
  'unreadMessages', 'turnoverRate', 'expiringIn30Days',

  // Pipeline: a backlog, not an achievement
  'pendingVerification', 'documentsAwaitingReview', 'pendingClaim',
  'unclaimedInvitations', 'unclaimedExpired',

  // Maintenance
  'open', 'urgent', 'unacknowledged', 'averageResolutionTime',

  // Commerce
  'outOfStock', 'lowStock', 'cancelled', 'refundedValue', 'failedDeliveries',
  'pickupBacklog', 'abandonedCarts', 'abandonedCartValue',
  'unreconciledGatewayRecords', 'cashOnDeliveryOutstanding', 'partialPaymentsOverdue',
  'awaitingPaymentConfirmation', 'awaitingPaymentCompletion',
  'addressesPendingVerification', 'expiringSoon', 'exhaustedVouchers',
  'averageDeliveryTime', 'cancellationRate',

  // Onboarding: time to get somewhere
  'medianTimeToActive', 'medianTimeToClaim', 'medianTimeToVerify', 'averageTimeToVerify',
  'averageVacancyDuration'
]);

/** `null` where the direction carries no verdict. */
export function lowerIsBetter(metric: StatMetric): boolean | null {
  const key = metric.key;
  if (!key) {
    return null;
  }

  // The key is sent bare ("outstanding") or dotted ("financials.outstanding").
  const leaf = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
  return LOWER_IS_BETTER.has(leaf) ? true : null;
}
