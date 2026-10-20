import type { Logger } from 'pino';
import { ordersService } from '../modules/orders/orders.routes';
import { paymentsService } from '../modules/payments/payments.routes';
import { logisticsService } from '../modules/logistics/logistics.routes';

/** Repeating jobs: name → how often → what it does. */
export const MAINTENANCE_JOBS: Record<string, { everyMs: number; run: (log: Logger) => Promise<void> }> = {
  'orders.expire-unpaid': {
    everyMs: 60_000,
    run: async (log) => {
      const expired = await ordersService.expireUnpaid();
      if (expired) log.info({ expired }, 'Expired unpaid orders and released their stock');
    },
  },
  'payments.reconcile': {
    everyMs: 60_000,
    run: async (log) => {
      const result = await paymentsService.reconcile();
      if (result.events || result.checked) log.info(result, 'Reconciled M-Pesa payments');
    },
  },
  'logistics.cod-overdue': {
    everyMs: 60 * 60_000, // hourly
    run: async (log) => {
      const alerted = await logisticsService.alertOverdueCod();
      if (alerted) log.warn({ alerted }, 'COD cash not handed in within 24 hours (BR-006)');
    },
  },
};
