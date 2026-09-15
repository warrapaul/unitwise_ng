export type AppPlatform = 'ANDROID' | 'IOS' | 'WEB' | 'ALL';
export type NoticeType = 'MAINTENANCE' | 'DISRUPTION' | 'INFO' | 'PROMOTION';
export type NoticeDisplayContext = 'GLOBAL' | 'ECOMMERCE_CHECKOUT' | 'ECOMMERCE_CART' | 'DASHBOARD' | 'CUSTOM';
export type NoticeActionType = 'BLOCKING' | 'DISMISSIBLE';
export type VersionStatus = 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'FORCE_UPDATE';

export interface AppNotice {
  id: number;
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  type?: NoticeType | null;
  displayContext?: NoticeDisplayContext | null;
  actionType?: NoticeActionType | null;
  priority?: number | null;
}

export interface AppNoticeDetail extends AppNotice {
  isActive?: boolean | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  targetPlatforms?: AppPlatform[] | null;
  targetRoles?: string[] | null;
  dismissalCooldownHours?: number | null;
  createdBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AppNoticeUpsertRequest {
  title: string;
  body: string;
  imageUrl?: string | null;
  type: NoticeType;
  displayContext?: NoticeDisplayContext | null;
  actionType?: NoticeActionType | null;
  isActive?: boolean | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  targetPlatforms?: AppPlatform[] | null;
  targetRoles?: string[] | null;
  dismissalCooldownHours?: number | null;
  priority?: number | null;
}

export interface AppCheckRequest {
  currentVersion: string;
  platform: AppPlatform;
  screenContext?: string | null;
  userId?: number | null;
}

export interface AppCheckResponse {
  versionStatus?: VersionStatus | null;
  latestVersion?: string | null;
  minimumVersion?: string | null;
  storeUrl?: string | null;
  updateMessage?: string | null;
  activeNotices?: AppNotice[] | null;
}

export interface VersionConfig {
  id: number;
  platform?: AppPlatform | null;
  minimumVersion?: string | null;
  latestVersion?: string | null;
  storeUrl?: string | null;
  forceUpdateMessage?: string | null;
  softUpdateMessage?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VersionConfigUpsertRequest {
  platform: AppPlatform;
  minimumVersion: string;
  latestVersion: string;
  storeUrl?: string | null;
  forceUpdateMessage?: string | null;
  softUpdateMessage?: string | null;
}
