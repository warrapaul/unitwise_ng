/**
 * Chat threads (`/v1/chat/threads`).
 *
 * - TENANCY: one tenancy and its agency's staff; landlord broadcasts land here.
 * - BUILDING_CHANNEL: one per building, staff and its active tenants.
 * - SHOP: a user and the shop admins, optionally about one order.
 */
export type ThreadType = 'TENANCY' | 'BUILDING_CHANNEL' | 'SHOP' | 'SUPPORT';
export type PostingPolicy = 'ALL_MEMBERS' | 'ADMINS_ONLY';

export interface ChatThread {
  id: number;
  type: ThreadType;
  title?: string | null;
  agencyId?: number | null;
  buildingId?: number | null;
  tenantId?: number | null;
  orderId?: number | null;
  customerUserId?: number | null;
  postingPolicy?: PostingPolicy | null;
  canPost?: boolean;
  unreadCount?: number;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
}

export interface ThreadMessage {
  id: number;
  threadId: number;
  senderId?: number | null;
  senderName?: string | null;
  fromStaff?: boolean;
  content: string;
  createdAt?: string | null;
}

/** No buildings and no rooms: the whole agency. */
export interface BroadcastRequest {
  buildingIds?: number[] | null;
  roomIds?: number[] | null;
  content: string;
}

export interface BroadcastResult {
  recipients: number;
}

/** Pushed on /user/queue/chat. */
export interface ThreadEvent {
  eventType?: string | null;
  threadId: number;
  threadType?: ThreadType | null;
  message?: ThreadMessage | null;
  unreadCount?: number | null;
}
