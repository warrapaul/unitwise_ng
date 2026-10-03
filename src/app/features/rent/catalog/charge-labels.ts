import { ChargeBillingTiming, UtilityBillingType } from '../models/rent.models';

/** One wording for a charge's billing, shared by the catalog and the landlord's charge form. */
export const BILLING_TYPE_LABELS: Record<UtilityBillingType, string> = {
  FIXED: 'Same amount every month',
  METERED: 'By meter reading',
  PER_UNIT: 'Per unit used',
  PERCENTAGE_OF_RENT: 'Share of the rent'
};

export const BILLING_TIMING_LABELS: Record<ChargeBillingTiming, string> = {
  CURRENT_MONTH: 'The current month',
  PRIOR_MONTH_ARREARS: 'The month before',
  ADVANCE: 'The coming month'
};
