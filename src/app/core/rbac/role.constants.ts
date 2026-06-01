export const RoleConstants = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  ECOMMERCE_ADMIN: 'ECOMMERCE_ADMIN',
  TENANT: 'TENANT',
  USER: 'USER',
  GUEST: 'GUEST'
} as const;

export type UserRole = typeof RoleConstants[keyof typeof RoleConstants];
