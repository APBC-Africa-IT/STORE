/**
 * Central registry of all BullMQ queue names.
 * Never use inline strings for queue names anywhere else in the codebase.
 */
export const QUEUES = {
  OUTBOX:           'outbox',
  NOTIFICATIONS:    'notifications',
  SEARCH_INDEX:     'search-index',
  REALTIME:         'realtime',
  FINANCE:          'finance',
  PAYMENTS:         'payments',
  PAYOUTS:          'payouts',
  IMPORTS:          'imports',
  EXPORTS:          'exports',
  DOCUMENTS:        'documents',
};

export default QUEUES;
