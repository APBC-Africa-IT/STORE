/**
 * Worker entry point — BullMQ consumers + scheduled jobs.
 * Start with: node SERVER_SIDE/workers/index.js
 *
 * Consumers: outbox relay, notifications, search indexer, finance, payments reconcile,
 *            reservation expiry (scheduled), payouts, imports/exports.
 * Scheduled: reservation expiry, payment reconcile, procurement alerts,
 *            logistics alerts, COD alerts, supplier/rider perf, low-stock digest,
 *            outbox cleanup.
 */
import { createWorker, createQueue } from '../shared/queue/bullmq.js';
import { QUEUES } from '../shared/queue/queues.js';
import { prisma } from '../shared/db/prisma.js';
import { redis } from '../shared/db/redis.js';

// ── Outbox relay ───────────────────────────────────────────────────────────
// Polls outbox_events, fans out to the appropriate queues, marks published.

const notificationsQueue = createQueue(QUEUES.notifications);
const searchQueue        = createQueue(QUEUES.searchIndex);
const financeQueue       = createQueue(QUEUES.finance);
const realtimeQueue      = createQueue(QUEUES.realtime);
const paymentsQueue      = createQueue(QUEUES.payments);

createWorker(QUEUES.outbox, async job => {
  const { eventId } = job.data;
  const event = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
  if (!event || event.publishedAt) return;

  const { type, aggregateType, aggregateId, payload } = event;
  const jobData = { eventId: event.id, type, aggregateType, aggregateId, payload };

  // Fan out to relevant queues based on event type
  const promises = [];

  // Notifications for customer-facing events
  if ([
    'order.placed', 'order.status_changed', 'order.delivered', 'order.completed', 'order.cancelled',
    'payment.succeeded', 'payment.failed',
    'job.assigned', 'job.status_changed',
    'user.registered',
    'grn.failed', 'grn.completed',
    'po.sent', 'po.confirmed', 'po.rejected',
    'part_request.quoted',
    'alert.raised',
  ].includes(type)) {
    promises.push(notificationsQueue.add(type, jobData, { attempts: 5, backoff: { type: 'exponential', delay: 2000 } }));
  }

  // Search index update
  if (['product.created', 'product.updated', 'product.price_changed', 'inventory.changed'].includes(type)) {
    promises.push(searchQueue.add(type, jobData, { attempts: 10, backoff: { type: 'exponential', delay: 1000 } }));
  }

  // Finance posting
  if (['order.delivered', 'order.completed', 'payment.succeeded', 'grn.completed',
       'job.completed', 'cod.reconciled', 'payout.succeeded'].includes(type)) {
    promises.push(financeQueue.add(type, jobData, { attempts: 10, backoff: { type: 'exponential', delay: 3000 } }));
  }

  // Real-time websocket broadcasts
  if (['order.status_changed', 'inventory.changed', 'payment.updated', 'alert.raised',
       'job.assigned', 'job.status_changed'].includes(type)) {
    promises.push(realtimeQueue.add(type, jobData, { attempts: 3 }));
  }

  // Payment reconciliation triggers
  if (type === 'payment.initiated' && payload?.method === 'MPESA_STK') {
    // Schedule STK query after 60s, 120s, 300s
    for (const delay of [60000, 120000, 300000]) {
      promises.push(paymentsQueue.add('stk-query', jobData, { delay, attempts: 3 }));
    }
  }

  await Promise.all(promises);
  await prisma.outboxEvent.update({ where: { id: eventId }, data: { publishedAt: new Date(), attempts: event.attempts + 1 } });
}, {
  concurrency: 10,
  limiter: { max: 100, duration: 1000 },
});

// ── Notifications consumer ─────────────────────────────────────────────────

createWorker(QUEUES.notifications, async job => {
  const { type, aggregateType, aggregateId, payload } = job.data;
  const { sendNotification } = await import('../modules/notifications/notifications.service.js');

  // Route event type → template + recipient
  switch (type) {
    case 'user.registered': {
      // Verification email handled inside auth.service.js — nothing to do here
      break;
    }
    case 'order.placed': {
      const order = await prisma.order.findUnique({ where: { id: aggregateId } });
      if (order?.guestPhone || order?.customerId) {
        const phone = order.guestPhone || (await prisma.user.findUnique({ where: { id: order.customerId } }))?.phone;
        if (phone) await sendNotification({ channel: 'SMS', template: 'ORDER_PLACED', recipient: phone,
          data: { orderNumber: order.number }, eventId: job.data.eventId });
      }
      break;
    }
    case 'order.status_changed': {
      const { orderId, toStatus, customerVisibleText } = payload;
      if (!customerVisibleText) break;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const phone = order?.guestPhone;
      if (phone && order) {
        await sendNotification({ channel: 'SMS', template: 'ORDER_STATUS', recipient: phone,
          data: { orderNumber: order.number, statusText: customerVisibleText }, eventId: job.data.eventId });
      }
      break;
    }
    case 'job.assigned': {
      const { jobId, riderId } = payload;
      const rider = await prisma.rider.findUnique({ where: { id: riderId } });
      if (rider?.phone) {
        const job2 = await prisma.logisticsJob.findUnique({ where: { id: jobId } });
        await sendNotification({ channel: 'SMS', template: 'RIDER_JOB_ASSIGNED', recipient: rider.phone,
          data: { jobNumber: job2?.number }, eventId: job.data.eventId });
      }
      break;
    }
    case 'alert.raised': {
      // Log alert — in production, send to Slack/email
      console.warn(`[ALERT] ${JSON.stringify(payload)}`);
      break;
    }
    default: break;
  }
}, { concurrency: 20, attempts: 5 });

// ── Search index consumer ──────────────────────────────────────────────────

createWorker(QUEUES.searchIndex, async job => {
  const { aggregateType, aggregateId, payload } = job.data;
  const { reindexProducts } = await import('../modules/search/search.service.js');

  if (aggregateType === 'product') {
    await reindexProducts([aggregateId]);
  } else if (aggregateType === 'inventory_level' && payload?.productId) {
    await reindexProducts([payload.productId]);
  }
}, { concurrency: 5 });

// ── Finance consumer ───────────────────────────────────────────────────────

createWorker(QUEUES.finance, async job => {
  const { type, aggregateId, payload } = job.data;
  const financeService = await import('../modules/finance/finance.service.js');

  switch (type) {
    case 'payment.succeeded':
      await financeService.postPaymentCaptured(aggregateId).catch(e => console.error('[finance] payment', e.message));
      break;
    case 'order.delivered':
    case 'order.completed':
      await financeService.postOrderRevenue(aggregateId).catch(e => console.error('[finance] revenue', e.message));
      break;
    case 'grn.completed':
      await financeService.postGrnLanded(aggregateId).catch(e => console.error('[finance] grn', e.message));
      break;
    case 'cod.reconciled':
      await financeService.postCodHandover(payload?.codId || aggregateId).catch(e => console.error('[finance] cod', e.message));
      break;
    case 'payout.succeeded':
      await financeService.postRiderPayout(aggregateId).catch(e => console.error('[finance] payout', e.message));
      break;
    default: break;
  }
}, { concurrency: 5, attempts: 10 });

// ── Payments consumer — STK query / reconciliation ─────────────────────────

createWorker(QUEUES.payments, async job => {
  if (job.name === 'stk-query') {
    const { payload } = job.data;
    const { stkQuery } = await import('../integrations/mpesa/client.js');
    const { succeedPayment } = await import('../modules/payments/payments.service.js');

    const payment = await prisma.payment.findUnique({ where: { id: payload?.paymentId || job.data.aggregateId } });
    if (!payment || payment.state !== 'PENDING') return;
    if (!payment.providerRequestId) return;

    try {
      const result = await stkQuery({ checkoutRequestId: payment.providerRequestId });
      if (result?.ResultCode === '0' || result?.ResultCode === 0) {
        const receiptNumber = result?.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
        await succeedPayment(payment.id, receiptNumber, null);
      } else if (result?.ResultCode) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { state: 'FAILED', failureReason: result.ResultDesc },
        });
      }
    } catch (e) {
      console.error('[payments] STK query error:', e.message);
    }
  }
}, { concurrency: 10, attempts: 5 });

// ── Real-time consumer — websocket broadcast ───────────────────────────────

createWorker(QUEUES.realtime, async job => {
  // Socket.IO is on the API process — we publish to Redis pub/sub
  // The API process subscribes and emits to the correct rooms
  await redis.publish('rt:event', JSON.stringify(job.data));
}, { concurrency: 20 });

// ── Scheduled jobs ─────────────────────────────────────────────────────────

async function setupScheduledJobs() {
  const schedulerQueue = createQueue('scheduler');

  const jobs = [
    { name: 'reservations.expire',           cron: '* * * * *',       tz: 'Africa/Nairobi' },  // every 1 min
    { name: 'payments.reconcile-pending',    cron: '*/2 * * * *',     tz: 'Africa/Nairobi' },  // every 2 min
    { name: 'procurement.overdue-confirmations', cron: '*/5 * * * *', tz: 'Africa/Nairobi' },  // every 5 min
    { name: 'logistics.overdue-collections', cron: '*/5 * * * *',     tz: 'Africa/Nairobi' },
    { name: 'logistics.overdue-deliveries',  cron: '*/5 * * * *',     tz: 'Africa/Nairobi' },
    { name: 'cod.reconciliation-alerts',     cron: '0 * * * *',       tz: 'Africa/Nairobi' },  // hourly
    { name: 'finance.supplier-payables-due', cron: '0 7 * * *',       tz: 'Africa/Nairobi' },  // daily 07:00
    { name: 'payouts.rider-batch',           cron: '0 19 * * *',      tz: 'Africa/Nairobi' },  // daily 19:00
    { name: 'inventory.low-stock-digest',    cron: '30 7 * * *',      tz: 'Africa/Nairobi' },  // daily 07:30
    { name: 'outbox.cleanup',                cron: '0 3 * * *',       tz: 'Africa/Nairobi' },  // daily 03:00
  ];

  for (const j of jobs) {
    await schedulerQueue.add(j.name, {}, {
      repeat: { pattern: j.cron, tz: j.tz },
      jobId: `scheduled:${j.name}`,
    });
  }
}

createWorker('scheduler', async job => {
  const { expireReservations, getLowStockProducts } = await import('../modules/inventory/inventory.service.js');
  const { sendLowStockAlertEmail } = await import('../modules/notifications/notifications.service.js');

  switch (job.name) {
    case 'reservations.expire': {
      const expired = await expireReservations();
      if (expired > 0) console.log(`[scheduler] Expired ${expired} reservations`);
      break;
    }
    case 'cod.reconciliation-alerts': {
      const cutoff = new Date(Date.now() - 24 * 3600_000);
      const old = await prisma.codCollection.count({ where: { status: 'OUTSTANDING', collectedAt: { lt: cutoff } } });
      if (old > 0) console.warn(`[ALERT] ${old} COD collections outstanding > 24h`);
      break;
    }
    case 'procurement.overdue-confirmations': {
      const cutoff = new Date(Date.now() - 30 * 60_000);
      const overdue = await prisma.purchaseOrder.count({ where: { status: 'SENT', sentAt: { lt: cutoff } } });
      if (overdue > 0) console.warn(`[ALERT] ${overdue} POs awaiting supplier confirmation > 30 min`);
      break;
    }
    case 'outbox.cleanup': {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
      await prisma.outboxEvent.deleteMany({ where: { publishedAt: { lt: sevenDaysAgo } } });
      break;
    }
    case 'inventory.low-stock-digest': {
      const lowStock = await getLowStockProducts();
      if (lowStock.length > 0) {
        const adminEmail = process.env.ADMIN_EMAIL || 'ops@myspares.co.ke';
        await sendLowStockAlertEmail(adminEmail, lowStock.slice(0, 20).map(p => ({
          name: p.name, available: p.available,
        })));
      }
      break;
    }
    default:
      console.log(`[scheduler] Job: ${job.name}`);
  }
}, { concurrency: 1 });

// ── Outbox relay (polling — runs alongside workers) ───────────────────────
async function runOutboxRelay() {
  const outboxQueue = createQueue(QUEUES.outbox);

  setInterval(async () => {
    try {
      const events = await prisma.$queryRaw`
        SELECT id FROM outbox_events
        WHERE published_at IS NULL AND attempts < 5
        ORDER BY created_at ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `;

      for (const ev of events) {
        await outboxQueue.add('relay', { eventId: ev.id }, { attempts: 3 });
        await prisma.outboxEvent.update({ where: { id: ev.id }, data: { attempts: { increment: 1 } } });
      }
    } catch (e) {
      console.error('[outbox-relay] Error:', e.message);
    }
  }, 500);
}

// ── Startup ────────────────────────────────────────────────────────────────
runOutboxRelay();
setupScheduledJobs().catch(e => console.error('[scheduler] Setup error:', e.message));

console.log('[workers] All BullMQ workers started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[workers] SIGTERM received — shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
