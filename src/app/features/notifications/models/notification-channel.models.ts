/** Mirrors `NotificationChannel` — one sender behind each value. */
export type NotificationChannel = 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH' | 'IN_APP';

export interface ChannelReference {
  name: NotificationChannel;
  displayName: string;
  /** False for PUSH and IN_APP: they reach nobody who is not already in the app. */
  reachesOfflineUser: boolean;
}

export interface TopicReference {
  name: string;
  allowedChannels: NotificationChannel[];
  userOverridable: boolean;
  transactional: boolean;
}

export interface NotificationReference {
  channels: ChannelReference[];
  topics: TopicReference[];
}

/** Platform-wide rule for one topic. Super admin only. */
export interface ChannelPolicy {
  id?: number | null;
  topic: string;
  description?: string | null;
  enabledChannels: NotificationChannel[];
  defaultChannels: NotificationChannel[];
  mandatoryChannels: NotificationChannel[];
  /** What a super admin is permitted to enable — the outer bound of the policy. */
  allowedChannels: NotificationChannel[];
  userOverridable?: boolean | null;
  enabled?: boolean | null;
  /** A transactional topic cannot be silenced by the recipient. */
  transactional?: boolean | null;
}

export interface UpdateChannelPolicyRequest {
  enabledChannels?: NotificationChannel[];
  defaultChannels?: NotificationChannel[];
  mandatoryChannels?: NotificationChannel[];
  userOverridable?: boolean | null;
  enabled?: boolean | null;
  description?: string | null;
}

/** How the signed-in user receives one topic. */
export interface ChannelPreference {
  topic: string;
  topicDescription?: string | null;
  /** In effect right now, after the policy has filtered the user's choice. */
  effectiveChannels: NotificationChannel[];
  /** What the user chose; empty when they have not chosen. */
  selectedChannels: NotificationChannel[];
  selectableChannels: NotificationChannel[];
  mandatoryChannels: NotificationChannel[];
  muted?: boolean | null;
  /** False when the super admin has locked this topic's channels. */
  editable?: boolean | null;
}

export interface UpdateChannelPreferenceRequest {
  /** Empty with `muted: false` resets to the policy default. */
  channels?: NotificationChannel[];
  muted?: boolean | null;
}
