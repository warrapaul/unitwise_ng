/** Mirrors the backend's MaintenanceRequestDtos. */

export type MaintenanceCategory =
  | 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'APPLIANCE' | 'STRUCTURAL' | 'PEST_CONTROL' | 'CLEANING' | 'OTHER';

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY';

export type MaintenanceStatus = 'SUBMITTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ON_HOLD';

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
}

export interface MaintenanceCreateRequest {
  tenantId: number;
  roomId?: number | null;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority?: MaintenancePriority | null;
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
