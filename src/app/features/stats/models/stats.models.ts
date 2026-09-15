/**
 * Dashboard figures. Every metric describes itself — key, label, value and the
 * previous period — so the UI renders tiles from what the server sends rather
 * than from a hardcoded list of names. A metric added to a block appears on the
 * dashboard without a frontend change; one removed leaves no empty tile.
 */

export type StatsSource = 'LIVE' | 'SNAPSHOT' | 'CACHED';
export type DurationUnit = 'MINUTES' | 'HOURS' | 'DAYS';
export type ActionSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type StatsGranularity = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

export type StatsPeriod =
  | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS'
  | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR'
  | 'LAST_12_MONTHS' | 'ALL_TIME' | 'CUSTOM';

export interface StatsQuery {
  period?: StatsPeriod;
  from?: string;
  to?: string;
  granularity?: StatsGranularity;
  buildingId?: number | null;
  compare?: boolean;
  topN?: number;
  refresh?: boolean;
}

/** Where the numbers came from and what they cover. */
export interface StatsMeta {
  source?: StatsSource | null;
  generatedAt?: string | null;
  coversFrom?: string | null;
  coversTo?: string | null;
  comparesFrom?: string | null;
  comparesTo?: string | null;
  stale?: boolean | null;
  currency?: string | null;
  scopeType?: string | null;
  scopeId?: number | null;
  scopeLabel?: string | null;
}

/**
 * The four metric shapes share enough to render as one tile. `value` is a
 * string for amounts and rates because the server sends BigDecimal, and parsing
 * it to a float in the client is how a rent figure loses its last cent.
 */
export interface StatMetric {
  key?: string | null;
  label?: string | null;
  value?: number | string | null;
  previousValue?: number | string | null;
  /** Counts and amounts move by percent… */
  changePercent?: number | string | null;
  /** …a rate moves by points, since a percent change of a percent is nonsense. */
  changePoints?: number | string | null;
  numerator?: number | null;
  denominator?: number | null;
  unit?: DurationUnit | null;
}

export interface StatusCount {
  key?: string | null;
  label?: string | null;
  count?: number | null;
  percentage?: number | string | null;
  amount?: number | string | null;
}

export interface StatusBreakdown {
  key?: string | null;
  label?: string | null;
  total?: number | null;
  buckets?: StatusCount[] | null;
}

export interface RankedEntry {
  id?: number | null;
  label?: string | null;
  subLabel?: string | null;
  rank?: number | null;
  count?: number | null;
  amount?: number | string | null;
  percentage?: number | string | null;
  /** Where the record lives, so a row can be followed. */
  targetPath?: string | null;
}

/**
 * The part an operator acts on. Carries its own route, so the dashboard links
 * without knowing what each item is about.
 */
export interface ActionItem {
  key?: string | null;
  label?: string | null;
  count?: number | null;
  severity?: ActionSeverity | null;
  targetPath?: string | null;
  oldestItemAgeDays?: number | null;
}

export interface TrendPoint {
  bucket?: string | null;
  label?: string | null;
  value?: number | string | null;
  secondaryValue?: number | string | null;
}

export interface TrendSeries {
  key?: string | null;
  label?: string | null;
  valueLabel?: string | null;
  secondaryValueLabel?: string | null;
  granularity?: StatsGranularity | null;
  points?: TrendPoint[] | null;
}

/**
 * A block of metrics. Typed as an index rather than field by field: the blocks
 * carry thirty-odd named metrics between them, and the dashboard reads the ones
 * it leads with by key while the rest stay available without a model change
 * every time the backend adds one.
 */
export type StatBlock = Record<string, unknown>;

interface OverviewBase {
  meta?: StatsMeta | null;
  needsAttention?: ActionItem[] | null;
}

export interface AgencyOverview extends OverviewBase {
  portfolio?: StatBlock | null;
  occupancy?: StatBlock | null;
  tenants?: StatBlock | null;
  leases?: StatBlock | null;
  rent?: StatBlock | null;
  maintenance?: StatBlock | null;
}

export interface CaretakerOverview extends OverviewBase {
  /** Declared below — the caretaker's own blocks, not a generic list. */
  assignedBuildings?: AssignedBuilding[] | null;
  rooms?: StatBlock | null;
  tenants?: StatBlock | null;
  today?: StatBlock | null;
  maintenance?: StatBlock | null;
}

export interface PlatformOverview extends OverviewBase {
  users?: StatBlock | null;
  agencies?: StatBlock | null;
  property?: StatBlock | null;
  tenants?: StatBlock | null;
  leases?: StatBlock | null;
  revenue?: StatBlock | null;
}

export interface EcomOverview extends OverviewBase {
  sales?: StatBlock | null;
  orders?: StatBlock | null;
  payments?: StatBlock | null;
  fulfilment?: StatBlock | null;
  catalog?: StatBlock | null;
  customers?: StatBlock | null;
}

/** Which dashboard the active role gets. */
export type StatsDomain = 'PLATFORM' | 'AGENCY' | 'CARETAKER' | 'ECOM' | 'TENANT' | 'NONE';

// ── Agency detail ──────────────────────────────────────────────────────────

export interface ArrearsAgingBucket {
  key?: string | null;
  label?: string | null;
  minDays?: number | null;
  maxDays?: number | null;
  tenantCount?: number | null;
  amount?: number | string | null;
  percentageOfTotal?: number | string | null;
}

export interface RentCollectionStats {
  meta?: StatsMeta | null;
  billingMonth?: string | null;
  expected?: StatMetric | null;
  collected?: StatMetric | null;
  outstanding?: StatMetric | null;
  overdue?: StatMetric | null;
  lateFees?: StatMetric | null;
  waived?: StatMetric | null;
  collectionRate?: StatMetric | null;
  tenantsPaid?: StatMetric | null;
  tenantsPartiallyPaid?: StatMetric | null;
  tenantsOverdue?: StatMetric | null;
  tenantsPending?: StatMetric | null;
  chargeBreakdown?: StatMetric[] | null;
  chargesByStatus?: StatusCount[] | null;
  arrearsAging?: ArrearsAgingBucket[] | null;
  topDebtors?: RankedEntry[] | null;
  collectionByBuilding?: RankedEntry[] | null;
}

/** A move-in, move-out or transfer that has happened or is scheduled. */
export interface MovementEntry {
  type?: string | null;
  occurredOn?: string | null;
  tenantId?: number | null;
  tenantName?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  roomNumber?: string | null;
  reason?: string | null;
  wasEvicted?: boolean | null;
}

export interface OccupancyMovement {
  meta?: StatsMeta | null;
  moveIns?: StatMetric | null;
  moveOuts?: StatMetric | null;
  transfers?: StatMetric | null;
  evictions?: StatMetric | null;
  netOccupancyChange?: StatMetric | null;
  averageTenancyLength?: StatMetric | null;
  turnoverRate?: StatMetric | null;
  moveOutsByReason?: StatusBreakdown | null;
  movementByBuilding?: RankedEntry[] | null;
  recentMovements?: MovementEntry[] | null;
  upcomingMovements?: MovementEntry[] | null;
}

/** One row of the per-building table; plain numbers, not metrics. */
export interface BuildingStatsRow {
  buildingId?: number | null;
  buildingName?: string | null;
  rooms?: number | null;
  occupied?: number | null;
  vacant?: number | null;
  underMaintenance?: number | null;
  occupancyRate?: number | string | null;
  activeTenants?: number | null;
  pendingTenants?: number | null;
  leasesExpiringIn30Days?: number | null;
  rentExpected?: number | string | null;
  rentCollected?: number | string | null;
  rentOutstanding?: number | string | null;
  collectionRate?: number | string | null;
  openMaintenanceRequests?: number | null;
  billingCycleStatus?: string | null;
  pendingMeterReadings?: number | null;
}

export interface BuildingBreakdown {
  meta?: StatsMeta | null;
  buildings?: BuildingStatsRow[] | null;
  agencyTotals?: BuildingStatsRow | null;
}

export interface AgencyTrends {
  meta?: StatsMeta | null;
  occupancyRate?: TrendSeries | null;
  rentCollection?: TrendSeries | null;
  arrears?: TrendSeries | null;
  tenantGrowth?: TrendSeries | null;
  movement?: TrendSeries | null;
  maintenance?: TrendSeries | null;
}

// ── Platform detail ────────────────────────────────────────────────────────

export interface FunnelStage {
  key?: string | null;
  label?: string | null;
  position?: number | null;
  count?: number | null;
  conversionFromPrevious?: number | string | null;
  conversionFromStart?: number | string | null;
  medianDaysFromPrevious?: number | string | null;
}

export interface OnboardingFunnel {
  meta?: StatsMeta | null;
  stages?: FunnelStage[] | null;
  overallConversion?: StatMetric | null;
  claimConversion?: StatMetric | null;
  medianTimeToActive?: StatMetric | null;
  medianTimeToClaim?: StatMetric | null;
  medianTimeToVerify?: StatMetric | null;
  byCreationMode?: StatusBreakdown | null;
  stalledByStage?: RankedEntry[] | null;
}

export interface GeoCoverage {
  meta?: StatsMeta | null;
  countiesCovered?: StatMetric | null;
  townsCovered?: StatMetric | null;
  geoRegions?: StatMetric | null;
  geoLandmarks?: StatMetric | null;
  addresses?: StatMetric | null;
  buildingsGeocoded?: StatMetric | null;
  buildingsByCounty?: RankedEntry[] | null;
  agenciesByCounty?: RankedEntry[] | null;
  tenantsByCounty?: RankedEntry[] | null;
  storesByTown?: RankedEntry[] | null;
}

/**
 * Operations health. Each block is a different subsystem with its own fields,
 * so they stay loose here — the page reads the action items, which is what an
 * operator acts on, and the blocks are available for a drill-down later.
 */
export interface PlatformOperations {
  meta?: StatsMeta | null;
  billing?: StatBlock | null;
  notifications?: StatBlock | null;
  payments?: StatBlock | null;
  appRelease?: StatBlock | null;
  audit?: StatBlock | null;
  needsAttention?: ActionItem[] | null;
}

export interface PlatformTrends {
  meta?: StatsMeta | null;
  userSignups?: TrendSeries | null;
  tenantGrowth?: TrendSeries | null;
  agencyGrowth?: TrendSeries | null;
  occupancyRate?: TrendSeries | null;
  rentCollection?: TrendSeries | null;
  ecomGmv?: TrendSeries | null;
  tenantMovement?: TrendSeries | null;
}

// ── Caretaker detail ───────────────────────────────────────────────────────

/** A tenant behind on rent, with what a caretaker needs to chase them. */
export interface ArrearsWatchEntry {
  tenantId?: number | null;
  tenantName?: string | null;
  contactPhone?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  roomNumber?: string | null;
  outstanding?: number | string | null;
  daysOverdue?: number | null;
  lastPaymentDate?: string | null;
  paymentStatus?: string | null;
}

export interface CaretakerRentStatus {
  meta?: StatsMeta | null;
  billingMonth?: string | null;
  tenantsPaid?: StatMetric | null;
  tenantsPartiallyPaid?: StatMetric | null;
  tenantsOverdue?: StatMetric | null;
  tenantsPending?: StatMetric | null;
  byPaymentStatus?: StatusBreakdown | null;
  watchlist?: ArrearsWatchEntry[] | null;
  arrearsByBuilding?: RankedEntry[] | null;
}

/** A move that has not happened yet — the caretaker's actual diary. */
export interface ScheduledMovement {
  type?: string | null;
  scheduledDate?: string | null;
  daysFromToday?: number | null;
  tenantId?: number | null;
  tenantName?: string | null;
  contactPhone?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  roomNumber?: string | null;
  leaseId?: number | null;
  note?: string | null;
}

export interface MovementSchedule {
  meta?: StatsMeta | null;
  horizonDays?: number | null;
  upcomingMoveIns?: StatMetric | null;
  upcomingMoveOuts?: StatMetric | null;
  upcomingTransfers?: StatMetric | null;
  leasesExpiring?: StatMetric | null;
  schedule?: ScheduledMovement[] | null;
}

export interface AssignedBuilding {
  buildingId?: number | null;
  buildingName?: string | null;
  agencyId?: number | null;
  rooms?: number | null;
  occupied?: number | null;
  vacant?: number | null;
  underMaintenance?: number | null;
  occupancyRate?: number | string | null;
  openMaintenanceRequests?: number | null;
  tenantsInArrears?: number | null;
}

// ── Ecommerce detail ───────────────────────────────────────────────────────

export interface EcomSales {
  meta?: StatsMeta | null;
  ordersToday?: StatMetric | null;
  ordersThisPeriod?: StatMetric | null;
  revenueToday?: StatMetric | null;
  revenueThisPeriod?: StatMetric | null;
  averageOrderValue?: StatMetric | null;
  unitsSold?: StatMetric | null;
  discountGiven?: StatMetric | null;
  refundedValue?: StatMetric | null;
  netRevenue?: StatMetric | null;
  topDays?: RankedEntry[] | null;
}

export interface EcomFulfilment {
  meta?: StatsMeta | null;
  homeDelivery?: StatMetric | null;
  storePickup?: StatMetric | null;
  deliveredToTenantBuilding?: StatMetric | null;
  tenantAddressShare?: StatMetric | null;
  addressesPendingVerification?: StatMetric | null;
  failedDeliveries?: StatMetric | null;
  pickupBacklog?: StatMetric | null;
  averageDeliveryTime?: StatMetric | null;
  ordersByStore?: RankedEntry[] | null;
  deliveriesByBuilding?: RankedEntry[] | null;
  deliveriesByTown?: RankedEntry[] | null;
}

export interface EcomCatalog {
  meta?: StatsMeta | null;
  totalProducts?: StatMetric | null;
  activeProducts?: StatMetric | null;
  outOfStock?: StatMetric | null;
  lowStock?: StatMetric | null;
  variants?: StatMetric | null;
  activeDiscounts?: StatMetric | null;
  inventoryValue?: StatMetric | null;
  topSellers?: RankedEntry[] | null;
  lowStockProducts?: RankedEntry[] | null;
  zeroMovementProducts?: RankedEntry[] | null;
  revenueByCategory?: RankedEntry[] | null;
}

export interface EcomCustomers {
  meta?: StatsMeta | null;
  totalCustomers?: StatMetric | null;
  newCustomers?: StatMetric | null;
  returningCustomers?: StatMetric | null;
  repeatPurchaseRate?: StatMetric | null;
  tenantCustomers?: StatMetric | null;
  abandonedCarts?: StatMetric | null;
  abandonedCartValue?: StatMetric | null;
  averageLifetimeValue?: StatMetric | null;
  openChatConversations?: StatMetric | null;
  membersByGroup?: StatusCount[] | null;
  topCustomers?: RankedEntry[] | null;
}

export interface EcomVouchers {
  meta?: StatsMeta | null;
  activeVouchers?: StatMetric | null;
  exhaustedVouchers?: StatMetric | null;
  expiringSoon?: StatMetric | null;
  redemptions?: StatMetric | null;
  discountGiven?: StatMetric | null;
  revenueInfluenced?: StatMetric | null;
  redemptionRate?: StatMetric | null;
  topVouchers?: RankedEntry[] | null;
}

export interface EcomTrends {
  meta?: StatsMeta | null;
  revenue?: TrendSeries | null;
  orders?: TrendSeries | null;
  averageOrderValue?: TrendSeries | null;
  customers?: TrendSeries | null;
  cancellationRate?: TrendSeries | null;
}

// ── Tenant ─────────────────────────────────────────────────────────────────

/** One of the tenant's tenancies. Someone can hold several at once. */
export interface TenantProfileSummary {
  tenantId?: number | null;
  tenantUid?: string | null;
  status?: string | null;
  creationMode?: string | null;
  claimStatus?: string | null;
  tenantType?: string | null;
  agencyId?: number | null;
  agencyName?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  roomId?: number | null;
  roomName?: string | null;
  movedInOn?: string | null;
  outstandingBalance?: number | string | null;
  selected?: boolean | null;
  pendingActionCount?: number | null;
}

export interface VerificationFeedback {
  documentId?: number | null;
  documentType?: string | null;
  note?: string | null;
  recordedOn?: string | null;
  /** True when the tenant can still do something about it. */
  actionable?: boolean | null;
}

export interface PendingInvitation {
  tenantId?: number | null;
  agencyId?: number | null;
  agencyName?: string | null;
  buildingName?: string | null;
  buildingAddress?: string | null;
  roomName?: string | null;
  monthlyRent?: number | string | null;
  securityDeposit?: number | string | null;
  invitedOn?: string | null;
  expiresOn?: string | null;
  daysUntilExpiry?: number | null;
  requiredDocuments?: string[] | null;
}

export interface TenantOnboardingProgress {
  currentStep?: string | null;
  currentStepLabel?: string | null;
  stepsCompleted?: StatMetric | null;
  stepsTotal?: StatMetric | null;
  percentComplete?: number | string | null;
  documentsEditable?: boolean | null;
  documentsOutstanding?: StatMetric | null;
  documentsAwaitingReview?: StatMetric | null;
  documentsRejected?: StatMetric | null;
  documentsByStatus?: StatusBreakdown | null;
  feedback?: VerificationFeedback[] | null;
  submittedOn?: string | null;
  awaitingDecisionFor?: StatMetric | null;
  pendingInvitations?: PendingInvitation[] | null;
}

export interface MonthlyStatementRow {
  month?: string | null;
  monthDisplay?: string | null;
  baseRent?: number | string | null;
  utilities?: number | string | null;
  otherCharges?: number | string | null;
  lateFee?: number | string | null;
  totalDue?: number | string | null;
  totalPaid?: number | string | null;
  balance?: number | string | null;
  paymentStatus?: string | null;
  /** False while the month's charges are still being entered. */
  confirmed?: boolean | null;
}

export interface AgingRow {
  key?: string | null;
  label?: string | null;
  amount?: number | string | null;
  monthCount?: number | null;
}

export interface TenantRentPosition {
  totalOutstanding?: StatMetric | null;
  currentMonthDue?: StatMetric | null;
  arrearsBroughtForward?: StatMetric | null;
  creditBalance?: StatMetric | null;
  lateFeesOutstanding?: StatMetric | null;
  securityDepositHeld?: StatMetric | null;
  monthlyRent?: StatMetric | null;
  dueDate?: string | null;
  daysUntilDue?: number | null;
  paymentStatus?: string | null;
  isOverdue?: boolean | null;
  /** The month is not final — charges are still being entered. */
  isProvisional?: boolean | null;
  chargesPendingInput?: StatMetric | null;
  lastPaymentDate?: string | null;
  lastPaymentAmount?: StatMetric | null;
  paidThisPeriod?: StatMetric | null;
  monthsPaidOnTime?: StatMetric | null;
  statementHistory?: MonthlyStatementRow[] | null;
  arrearsAging?: AgingRow[] | null;
}

export interface TenantLeaseSummary {
  status?: string | null;
  leaseType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  daysUntilExpiry?: number | null;
  inRenewalWindow?: boolean | null;
  autoRenews?: boolean | null;
  awaitingTenantSignature?: boolean | null;
  awaitingLandlordSignature?: boolean | null;
  noticePeriodDays?: number | null;
  noticeGivenOn?: string | null;
  amendments?: StatMetric | null;
}

export interface RoomUtilityRow {
  name?: string | null;
  billingType?: string | null;
  billingTiming?: string | null;
  unitRate?: number | string | null;
  unit?: string | null;
  latestReading?: number | string | null;
  latestConsumption?: number | string | null;
  latestAmount?: number | string | null;
}

export interface TenantResidence {
  buildingId?: number | null;
  buildingName?: string | null;
  buildingAddress?: string | null;
  floorName?: string | null;
  roomId?: number | null;
  roomName?: string | null;
  roomStatus?: string | null;
  movedInOn?: string | null;
  tenancyDuration?: StatMetric | null;
  /** Who to call, which is the next step after most of this screen. */
  caretakerName?: string | null;
  caretakerPhone?: string | null;
  agencyPhone?: string | null;
  utilities?: RoomUtilityRow[] | null;
}

export interface TimelineEntry {
  key?: string | null;
  label?: string | null;
  occurredOn?: string | null;
  amount?: number | string | null;
  targetPath?: string | null;
}

export interface TenantOverview {
  meta?: StatsMeta | null;
  profiles?: TenantProfileSummary[] | null;
  selectedProfile?: TenantProfileSummary | null;
  onboarding?: TenantOnboardingProgress | null;
  rent?: TenantRentPosition | null;
  lease?: TenantLeaseSummary | null;
  residence?: TenantResidence | null;
  maintenance?: StatBlock | null;
  activity?: StatBlock | null;
  shopping?: StatBlock | null;
  needsAttention?: ActionItem[] | null;
}

export interface TenantRentStatement {
  meta?: StatsMeta | null;
  profile?: TenantProfileSummary | null;
  position?: TenantRentPosition | null;
  paymentHistory?: TrendSeries | null;
  months?: MonthlyStatementRow[] | null;
}

export interface ProfileOnboardingRow {
  profile?: TenantProfileSummary | null;
  progress?: TenantOnboardingProgress | null;
}

/** The account-level view: what is done before any single tenancy matters. */
export interface TenantOnboarding {
  meta?: StatsMeta | null;
  accountClaimed?: boolean | null;
  phoneVerified?: boolean | null;
  emailVerified?: boolean | null;
  profileCount?: StatMetric | null;
  pendingInvitationCount?: StatMetric | null;
  profiles?: ProfileOnboardingRow[] | null;
  needsAttention?: ActionItem[] | null;
}
