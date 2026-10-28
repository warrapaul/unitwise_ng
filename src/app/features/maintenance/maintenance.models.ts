/** Mirrors the backend's MaintenanceRequestDtos. */

export type MaintenanceCategory =
  | 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'APPLIANCE' | 'STRUCTURAL' | 'PEST_CONTROL' | 'CLEANING' | 'OTHER';

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY';

export type MaintenanceStatus = 'SUBMITTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ON_HOLD';

/** How the tenant wants the visit handled. */
export type AccessPreference = 'CONTACT_FIRST' | 'ARRANGE_VISIT' | 'ENTER_IF_AWAY';

export const ACCESS_LABELS: Record<AccessPreference, string> = {
  CONTACT_FIRST: 'Call me before coming',
  ARRANGE_VISIT: 'Agree a time with me',
  ENTER_IF_AWAY: 'You may enter if I am out'
};

/** The overview figures; each is also a list view. */
export type MaintenanceView = 'NEW' | 'UNASSIGNED' | 'URGENT' | 'OVERDUE' | 'SCHEDULED_TODAY' | 'COMPLETED_MONTH';

export interface MaintenanceMetrics {
  newRequests: number;
  unassigned: number;
  urgent: number;
  overdue: number;
  scheduledToday: number;
  completedThisMonth: number;
}

export interface MaintenanceEvent {
  type: 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'SCHEDULED' | 'CHARGED' | 'PHOTO_ADDED';
  fromStatus?: MaintenanceStatus | null;
  toStatus?: MaintenanceStatus | null;
  note?: string | null;
  actorName?: string | null;
  at?: string | null;
}

export interface MaintenancePhoto {
  id: number;
  /** Short-lived; never cache it. */
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  uploadedAt?: string | null;
}

export interface StaffOption {
  userId: number;
  name: string;
  role?: string | null;
}

export interface MaintenancePreview {
  id: number;
  requestNumber?: string | null;
  title: string;
  category: MaintenanceCategory;
  priority?: MaintenancePriority | null;
  status: MaintenanceStatus;
  tenantId?: number | null;
  tenantName?: string | null;
  roomId?: number | null;
  roomNumber?: string | null;
  buildingId?: number | null;
  buildingName?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  createdAt?: string | null;
  open?: boolean | null;
  overdue?: boolean | null;
  assignedToUserId?: number | null;
  assignedToName?: string | null;
  chargedAmount?: number | string | null;
}

export interface MaintenanceDetail extends MaintenancePreview {
  description?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  roomName?: string | null;
  buildingAddress?: string | null;
  updatedAt?: string | null;
  workNotes?: string | null;
  allowedNextStatuses?: MaintenanceStatus[] | null;
  resolutionHours?: number | null;
  locationInProperty?: string | null;
  accessPreference?: AccessPreference | null;
  chargeAdjustmentId?: number | null;
  followUpOfId?: number | null;
  followUpOfNumber?: string | null;
  events?: MaintenanceEvent[] | null;
  photos?: MaintenancePhoto[] | null;
}

export interface MaintenanceCreateRequest {
  tenantId: number;
  roomId?: number | null;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority?: MaintenancePriority | null;
  locationInProperty?: string | null;
  accessPreference?: AccessPreference | null;
  followUpOfId?: number | null;
}

export interface MaintenanceStatusChange {
  status: MaintenanceStatus;
  workNotes?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
}

export interface MaintenanceSearchParams {
  buildingId?: number;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  category?: MaintenanceCategory;
  openOnly?: boolean;
  view?: MaintenanceView;
  search?: string;
  page?: number;
  size?: number;
}

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  PLUMBING: 'Plumbing / water',
  ELECTRICAL: 'Electrical',
  HVAC: 'Heating / ventilation',
  APPLIANCE: 'Appliance',
  STRUCTURAL: 'Walls, doors, windows',
  PEST_CONTROL: 'Pests',
  CLEANING: 'Cleaning',
  OTHER: 'Something else'
};

/** What each move is called on a button: the status names are states, not verbs. */
export const MAINTENANCE_ACTION_LABELS: Record<MaintenanceStatus, string> = {
  SUBMITTED: 'Reopen',
  ACKNOWLEDGED: 'Acknowledge',
  IN_PROGRESS: 'Start work',
  ON_HOLD: 'Put on hold',
  COMPLETED: 'Mark done',
  CANCELLED: 'Cancel request'
};
