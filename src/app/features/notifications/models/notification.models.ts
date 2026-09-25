export interface InAppNotification {
  id: number;
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  notificationType?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  /** The ids a screen needs to open the subject: agencyId, buildingId, tenantId, orderId… */
  data?: Record<string, string> | null;
  isRead?: boolean;
  isStarred?: boolean;
  readAt?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

export interface RegisterDeviceTokenRequest {
  token: string;
  platform?: string | null;
  deviceName?: string | null;
  appVersion?: string | null;
}

export interface AdminSendNotificationRequest {
  title: string;
  body: string;
  imageFilePath?: string | null;
  imageUrl?: string | null;
  topic?: string | null;
  token?: string | null;
  tokens?: string[] | null;
  data?: Record<string, string> | null;
  persistToDb?: boolean;
  highPriority?: boolean;
}

export interface NotificationMediaUpload {
  filePath?: string | null;
  previewUrl?: string | null;
}

export interface FcmTokenResult {
  token?: string | null;
  success?: boolean | null;
  messageId?: string | null;
  errorCode?: string | null;
  tokenInvalidated?: boolean | null;
}

export interface FcmSendResult {
  success?: boolean | null;
  messageId?: string | null;
  successCount?: number | null;
  failureCount?: number | null;
  tokenResults?: FcmTokenResult[] | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
}

export interface NotificationSearchParams {
  page?: number;
  size?: number;
  sort?: string | string[];
  direction?: 'asc' | 'desc';
}
