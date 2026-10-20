// Every permission in the system lives here. Routes check PERMISSIONS, never role names.
export const PERMISSIONS = [
  // users & access
  'users:manage',
  'users:manage_roles',
  'audit:view',
  'settings:manage',
  // catalogue & pricing
  'catalog:write',
  'pricing:view_cost',
  // inventory
  'inventory:view',
  'inventory:adjust',
  'inventory:approve_stocktake',
  // orders
  'orders:read_all',
  'orders:update_status',
  'orders:cancel',
  'orders:refund',
  // procurement
  'procurement:create_po',
  'procurement:send_po',
  'procurement:approve_restock',
  'procurement:approve_supplier_prices',
  // logistics
  'logistics:assign',
  'logistics:manage_riders',
  'logistics:reconcile_cod',
  // POS
  'pos:sell',
  'pos:approve_override',
  'pos:manage_shift',
  // finance & reports
  'finance:view',
  'finance:approve_below_cost',
  'finance:approve_payouts',
  'reports:export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Role → permissions. The seed script writes this into the database.
export const ROLES: Record<string, { name: string; permissions: readonly Permission[] }> = {
  SUPER_ADMIN: { name: 'Super Admin', permissions: PERMISSIONS },
  OPERATIONS_MANAGER: {
    name: 'Operations Manager',
    permissions: [
      'orders:read_all', 'orders:update_status', 'orders:cancel',
      'inventory:view', 'inventory:adjust', 'inventory:approve_stocktake',
      'procurement:create_po', 'procurement:send_po', 'procurement:approve_restock',
      'logistics:assign', 'logistics:manage_riders', 'logistics:reconcile_cod',
      'catalog:write', 'reports:export',
    ],
  },
  FINANCE_MANAGER: {
    name: 'Finance Manager',
    permissions: [
      'finance:view', 'finance:approve_below_cost', 'finance:approve_payouts',
      'pricing:view_cost', 'orders:read_all', 'orders:refund', 'reports:export', 'inventory:view',
    ],
  },
  STORE_MANAGER: {
    name: 'Store Manager',
    permissions: [
      'pos:sell', 'pos:approve_override', 'pos:manage_shift',
      'inventory:view', 'inventory:adjust', 'inventory:approve_stocktake', 'orders:read_all',
    ],
  },
  SALES_STAFF: { name: 'Sales Staff', permissions: ['pos:sell', 'pos:manage_shift', 'inventory:view'] },
  WAREHOUSE_STAFF: {
    name: 'Warehouse Staff',
    permissions: ['orders:read_all', 'orders:update_status', 'inventory:view', 'inventory:adjust'],
  },
  PROCUREMENT_OFFICER: {
    name: 'Procurement Officer',
    permissions: ['procurement:create_po', 'procurement:send_po', 'orders:read_all', 'inventory:view'],
  },
  DISPATCHER: {
    name: 'Dispatcher',
    permissions: ['logistics:assign', 'logistics:reconcile_cod', 'orders:read_all'],
  },
  CUSTOMER: { name: 'Customer', permissions: [] },
  TRADE_CUSTOMER: { name: 'Trade Customer', permissions: [] },
  SUPPLIER: { name: 'Supplier', permissions: [] },
  RIDER: { name: 'Rider', permissions: [] },
};
