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

/** Help & support, the privacy policy and the web version: public, set by the platform admin. */
export interface AppInfo {
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
  supportEmail?: string | null;
  supportHours?: string | null;
  helpText?: string | null;
  privacyPolicy?: string | null;
  privacyUpdatedOn?: string | null;
  companyName?: string | null;
  companyRegistration?: string | null;
  companyAddress?: string | null;
  /** Registration with the Office of the Data Protection Commissioner. */
  dataProtectionRegistration?: string | null;
  termsOfService?: string | null;
  termsUpdatedOn?: string | null;
  /** The demo the landing page plays: the link, or the uploaded file's URL. Only this on a save: the link. */
  demoVideoUrl?: string | null;
  /** Which demo plays. */
  demoVideoSource?: DemoVideoSource | null;
  /** The link as entered, whichever source is chosen. */
  demoVideoLink?: string | null;
  /** The uploaded file, whichever source is chosen. */
  demoVideoFile?: DemoVideoFile | null;
  socialLinks?: SocialLink[] | null;
  /** Real customers' words, entered by the platform admin. */
  testimonials?: Testimonial[] | null;
  showPlatformStats?: boolean;
  /** The latest web version from the version config. */
  appVersion?: string | null;
}

export type DemoVideoSource = 'LINK' | 'FILE';
export interface DemoVideoFile { fileName: string; fileSize?: number | null; url: string; }

export interface SocialLink { label: string; url: string; }
export interface Testimonial { quote: string; name: string; role?: string | null; }

/** Live counts for the landing page; null while switched off. */
export interface PlatformStats { agencies: number; rooms: number; rentRecorded: number | string; }
