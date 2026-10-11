/**
 * Central permissions registry.
 * Every route permission check uses these constants.
 * Roles bundle permissions — defined in the seed file.
 */
export const PERMISSIONS = {
  // Catalogue
  CATALOG_READ:                   'catalog:read',
  CATALOG_WRITE:                  'catalog:write',

  // Pricing
  PRICING_VIEW_COST:              'pricing:view_cost',
  PRICING_SET_FLOOR:              'pricing:set_floor',

  // Inventory
  INVENTORY_VIEW:                 'inventory:view',
  INVENTORY_ADJUST:               'inventory:adjust',
  INVENTORY_APPROVE_STOCKTAKE:    'inventory:approve_stocktake',

  // Orders
  ORDERS_READ_ALL:                'orders:read_all',
  ORDERS_UPDATE_STATUS:           'orders:update_status',
  ORDERS_CANCEL:                  'orders:cancel',
  ORDERS_REFUND:                  'orders:refund',

  // Procurement
  PROCUREMENT_CREATE_PO:          'procurement:create_po',
  PROCUREMENT_SEND_PO:            'procurement:send_po',
  PROCUREMENT_APPROVE_RESTOCK:    'procurement:approve_restock',
  PROCUREMENT_APPROVE_PRICES:     'procurement:approve_supplier_prices',

  // Logistics
  LOGISTICS_ASSIGN:               'logistics:assign',
  LOGISTICS_MANAGE_RIDERS:        'logistics:manage_riders',
  LOGISTICS_RECONCILE_COD:        'logistics:reconcile_cod',

  // POS
  POS_SELL:                       'pos:sell',
  POS_APPROVE_OVERRIDE:           'pos:approve_override',
  POS_MANAGE_SHIFT:               'pos:manage_shift',

  // Finance
  FINANCE_VIEW:                   'finance:view',
  FINANCE_APPROVE_BELOW_COST:     'finance:approve_below_cost',
  FINANCE_APPROVE_PAYOUTS:        'finance:approve_payouts',

  // Reports
  REPORTS_EXPORT:                 'reports:export',

  // Users / Roles
  USERS_MANAGE:                   'users:manage',
  USERS_MANAGE_ROLES:             'users:manage_roles',

  // Settings / Audit
  SETTINGS_MANAGE:                'settings:manage',
  AUDIT_VIEW:                     'audit:view',
};

/**
 * Seeded role → permission bundles.
 * The seed script reads this to create RolePermission rows.
 */
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: Object.values(PERMISSIONS),

  OPERATIONS_MANAGER: [
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.ORDERS_READ_ALL, PERMISSIONS.ORDERS_UPDATE_STATUS, PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.PROCUREMENT_CREATE_PO, PERMISSIONS.PROCUREMENT_SEND_PO,
    PERMISSIONS.LOGISTICS_ASSIGN, PERMISSIONS.LOGISTICS_MANAGE_RIDERS,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
  ],

  FINANCE_MANAGER: [
    PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_APPROVE_BELOW_COST, PERMISSIONS.FINANCE_APPROVE_PAYOUTS,
    PERMISSIONS.PRICING_VIEW_COST, PERMISSIONS.ORDERS_READ_ALL,
    PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.AUDIT_VIEW,
  ],

  STORE_MANAGER: [
    PERMISSIONS.POS_SELL, PERMISSIONS.POS_APPROVE_OVERRIDE, PERMISSIONS.POS_MANAGE_SHIFT,
    PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_APPROVE_STOCKTAKE,
    PERMISSIONS.CATALOG_READ, PERMISSIONS.ORDERS_READ_ALL,
    PERMISSIONS.AUDIT_VIEW,
  ],

  SALES_STAFF: [
    PERMISSIONS.POS_SELL, PERMISSIONS.CATALOG_READ,
    PERMISSIONS.ORDERS_UPDATE_STATUS,
  ],

  WAREHOUSE_STAFF: [
    PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.ORDERS_UPDATE_STATUS, PERMISSIONS.CATALOG_READ,
  ],

  PROCUREMENT_OFFICER: [
    PERMISSIONS.PROCUREMENT_CREATE_PO, PERMISSIONS.PROCUREMENT_SEND_PO,
    PERMISSIONS.PROCUREMENT_APPROVE_PRICES,
    PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.ORDERS_READ_ALL,
  ],

  DISPATCHER: [
    PERMISSIONS.LOGISTICS_ASSIGN, PERMISSIONS.LOGISTICS_RECONCILE_COD,
    PERMISSIONS.ORDERS_READ_ALL,
  ],

  CUSTOMER: [],
  TRADE_CUSTOMER: [],
  SUPPLIER: [],
  RIDER: [],
};

export default PERMISSIONS;
