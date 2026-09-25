import { RoutePaths } from '../../core/routes/route-paths';

/** What a notification needs to say where it leads. */
export interface NotificationTarget {
  notificationType?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  /** The ids beside the entity: agencyId, buildingId, tenantId, orderId… */
  data?: Record<string, string> | null;
}

/**
 * Where a notification leads — the screen where its subject is acted on.
 *
 * One table, so the inbox, a toast and any future push handler agree. The
 * type says who it was for (the tenant or the agency), the entity and data say
 * which record. Null: nothing to open.
 */
export function notificationLink(target: NotificationTarget): string | null {
  const id = target.entityId ?? null;
  const data = target.data ?? {};

  switch (target.notificationType) {
    // To the tenant.
    case 'TENANCY_PROFILE_ACCESS_REQUESTED':
    case 'TENANCY_PROFILE_SHARE_CODE_REDEEMED':
      return RoutePaths.myProfileSharing;
    case 'TENANT_INVITATION':
      return RoutePaths.tenantProfile;
    case 'ROOM_APPLICATION_DECIDED':
      return id !== null ? RoutePaths.myRoomApplicationDetail(id) : RoutePaths.myRoomApplications;

    // To the agency.
    case 'TENANCY_PROFILE_ACCESS_DECIDED':
    case 'TENANCY_INVITATION_ANSWERED': {
      const tenantId = data['tenantId'] ?? (target.entityType === 'TENANT' ? id : null);
      return data['agencyId'] && data['buildingId'] && tenantId
        ? RoutePaths.tenantDetail(data['agencyId'], data['buildingId'], tenantId)
        : RoutePaths.agencyProfileSharing;
    }
    case 'ROOM_APPLICATION_SUBMITTED':
      return id !== null ? RoutePaths.roomApplicationDetail(id) : RoutePaths.roomApplications;
  }

  switch (target.entityType?.toUpperCase()) {
    case 'CONVERSATION':
      return id !== null ? RoutePaths.chatConversation(id) : RoutePaths.chat;
    case 'ORDER': {
      const orderId = id ?? (data['orderId'] ? Number(data['orderId']) : null);
      if (orderId === null) {
        return STAFF_ORDER_TYPES.has(target.notificationType ?? '') ? RoutePaths.ecomOrders : null;
      }
      // Staff are told about orders to fulfil; customers about their own.
      return STAFF_ORDER_TYPES.has(target.notificationType ?? '')
        ? RoutePaths.ecomOrderDetail(orderId)
        : RoutePaths.myOrderDetail(orderId);
    }
  }

  return STAFF_ORDER_TYPES.has(target.notificationType ?? '') ? RoutePaths.ecomOrders : null;
}

const STAFF_ORDER_TYPES = new Set(['NEW_ORDER', 'NEW_REGIONAL_ORDER', 'DELIVERY_ASSIGNMENT']);
