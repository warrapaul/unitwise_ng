export type ConversationStatus = 'OPEN' | 'CLOSED' | 'PENDING_USER';
export type ChatSenderRole = 'USER' | 'ADMIN';
export type ChatMessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';

export interface ChatMessage {
  id: number;
  conversationId?: number | null;
  senderId?: number | null;
  senderRole?: ChatSenderRole | null;
  content?: string | null;
  messageType?: ChatMessageType | null;
  attachmentUrl?: string | null;
  isRead?: boolean;
  createdAt?: string | null;
}

export interface Conversation {
  id: number;
  userId?: number | null;
  userName?: string | null;
  assignedAdminId?: number | null;
  assignedAdminName?: string | null;
  status?: ConversationStatus | null;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  createdAt?: string | null;
}

export interface SendMessageRequest {
  conversationId?: number | null;
  content: string;
  messageType?: ChatMessageType | null;
}

/** Server-pushed chat event over STOMP. */
export interface WsChatEvent {
  eventType?: string | null;
  conversationId?: number | null;
  senderId?: number | null;
  senderName?: string | null;
  senderRole?: ChatSenderRole | null;
  message?: ChatMessage | null;
  timestamp?: string | null;
}

export interface TypingEvent {
  conversationId?: number | null;
  adminId?: number | null;
  adminName?: string | null;
  typing?: boolean | null;
}

export interface WsSubscriptionManifest {
  personalTopic?: string | null;
  buildingTopics?: string[] | null;
  adminTopic?: string | null;
}
