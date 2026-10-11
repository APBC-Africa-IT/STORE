/**
 * POS service — registers, shifts, product lookup, sales (split tender), manager overrides,
 * void/refund, receipts, end-of-day report.
 * §8.8 of the backend guide. Target: POS sale p95 < 3 s.
 */
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/db/prisma.js';
import { redis } from '../../shared/db/redis.js';
import { AppError } from '../../shared/errors/codes.js';
import { recordAudit } from '../audit/audit.service.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { computeEffectivePrice, computeOrderTotals } from '../pricing/pricing.domain.js';
import { getSetting } from '../settings/settings.service.js';
import { randomToken, sha256 } from '../../shared/crypto/index.js';
import { generateOrderNumber } from '../../shared/ids/index.js';

// ── Shifts ────────────────────────────────────────────────────────────────

export async function openShift({ registerId, openingFloatCents }, actor) {
  // Enforce: one open shift per register
  const existing = await prisma.shift.findFirst({
    where: { registerId, status: 'OPEN' },
  });
  if (existing) throw new AppError('CONFLICT', 'Register already has an open shift');

  const register = await prisma.register.findUnique({ where: { id: registerId } });
  if (!register || !register.isActive) throw new AppError('NOT_FOUND', 'Register not found or inactive');

  return prisma.$transaction(async tx => {
    const shift = await tx.shift.create({
      data: { registerId, openedById: actor.userId, openingFloatCents, status: 'OPEN' },
    });
    await recordAudit({ actor, action: 'shift.opened', entityType: 'shift', entityId: shift.id,
      after: { registerId, openingFloatCents } }, tx);
    return shift;
  });
}

export async function getCurrentShift(registerId, staffId) {
  return prisma.shift.findFirst({
    where: { registerId, status: 'OPEN' },
    include: { register: true },
  });
}

export async function closeShift(shiftId, { countedCashCents }, actor) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.status !== 'OPEN') throw new AppError('CONFLICT', 'Shift not open');

  // Compute expected cash
  const movements = await prisma.cashMovement.findMany({
    where: { shiftId },
    select: { type: true, amountCents: true },
  });
  const expectedCash = shift.openingFloatCents + movements.reduce((s, m) => s + m.amountCents, 0);
  const varianceCents = countedCashCents - expectedCash;
  const varianceAlert = await getSetting('pos.varianceAlertCents') || 50000;

  await prisma.$transaction(async tx => {
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        closedById: actor.userId,
        closedAt: new Date(),
        expectedCashCents: expectedCash,
        countedCashCents,
        varianceCents,
      },
    });

    if (Math.abs(varianceCents) > varianceAlert) {
      await emitOutboxEvent(EVENTS.ALERT_RAISED, 'shift', shiftId,
        { type: 'SHIFT_VARIANCE', shiftId, varianceCents }, tx);
    }
    await emitOutboxEvent(EVENTS.POS_SHIFT_CLOSED, 'shift', shiftId, { shiftId }, tx);
    await recordAudit({ actor, action: 'shift.closed', entityType: 'shift', entityId: shiftId,
      after: { expectedCash, countedCashCents, varianceCents } }, tx);
  });

  return { expectedCash, countedCashCents, varianceCents };
}

export async function addCashMovement(shiftId, { type, amountCents, referenceId, note }, actor) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.status !== 'OPEN') throw new AppError('CONFLICT', 'Shift is not open');

  // Signed amount: SALE/PAY_IN/COD_HANDOVER are positive; REFUND/PAY_OUT are negative
  const signedAmount = ['REFUND', 'PAY_OUT'].includes(type) ? -Math.abs(amountCents) : Math.abs(amountCents);

  return prisma.cashMovement.create({
    data: { shiftId, type, amountCents: signedAmount, referenceId: referenceId || null, actorId: actor.userId, note: note || null },
  });
}

// ── Product lookup ────────────────────────────────────────────────────────

export async function lookupProduct({ q, barcode, vehicleId }) {
  if (barcode) {
    const product = await prisma.product.findFirst({
      where: { barcode, status: 'ACTIVE' },
      include: {
        brand: true, category: true,
        inventory: { include: { location: true } },
        partNumbers: true,
      },
    });
    return product ? [product] : [];
  }

  const where = { status: 'ACTIVE' };
  if (q) {
    where.OR = [
      { name:    { contains: q, mode: 'insensitive' } },
      { sku:     { contains: q, mode: 'insensitive' } },
      { partNumbers: { some: { normalized: { contains: q.replace(/[\s\-]/g, '').toUpperCase() } } } },
    ];
  }
  if (vehicleId) {
    where.fitments = { some: { vehicleId } };
  }

  return prisma.product.findMany({
    where,
    include: {
      brand: true, category: true,
      inventory: { include: { location: true } },
      partNumbers: true,
    },
    take: 20,
  });
}

// ── POS Quote ─────────────────────────────────────────────────────────────

export async function posQuote({ items, discountBps = 0, zoneId, isExpress }) {
  const lines = await Promise.all(items.map(async item => {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new AppError('NOT_FOUND', `Product ${item.productId} not found`);

    const priceCtx = computeEffectivePrice({ product, quantity: item.quantity });
    const unitPrice = priceCtx.priceCents;
    const lineTotalCents = unitPrice * item.quantity;

    // Check availability
    const inv = await prisma.inventoryLevel.findFirst({ where: { productId: item.productId } });
    const available = inv ? inv.onHand - inv.reserved : 0;
    const sourcingOption = available < item.quantity && product.isSourceable
      ? { message: 'Can be sourced from supplier', leadTimeMins: product.sourcingLeadTimeMins }
      : null;

    return { productId: item.productId, productName: product.name, quantity: item.quantity,
             unitPriceCents: unitPrice, vatRateBps: product.vatRateBps,
             lineTotalCents, available, sourcingOption };
  }));

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const discountCents = Math.round(subtotalCents * (discountBps || 0) / 10000);
  const { vatCents, totalCents } = computeOrderTotals(lines, { discountCents });

  return { lines, subtotalCents, discountCents, vatCents, totalCents };
}

// ── POS Sale ──────────────────────────────────────────────────────────────

export async function createPosSale({ items, payments, shiftId, customerId, discountBps = 0, approvalToken, note, idempotencyKey }, actor) {
  // Idempotency
  if (idempotencyKey) {
    const cached = await redis.get(`pos:idem:${idempotencyKey}`).catch(() => null);
    if (cached) return JSON.parse(cached);
  }

  // Validate approval token if discount exceeds threshold
  const discountThresholdBps = await getSetting('pos.discountApprovalThresholdBps') || 1000;
  if (discountBps > discountThresholdBps) {
    if (!approvalToken) throw new AppError('APPROVAL_REQUIRED', 'Manager approval required for this discount');
    const isValid = await validateApprovalToken(approvalToken, { type: 'DISCOUNT', discountBps });
    if (!isValid) throw new AppError('FORBIDDEN', 'Invalid or expired approval token');
  }

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.status !== 'OPEN') throw new AppError('CONFLICT', 'No open shift for this register');

  const orderNumber = await generateOrderNumber();

  const result = await prisma.$transaction(async tx => {
    // Compute prices server-side (never trust client)
    const orderItems = [];
    let subtotalCents = 0;

    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.status !== 'ACTIVE') throw new AppError('NOT_FOUND', `Product ${item.productId} not available`);

      const priceCtx = computeEffectivePrice({ product, quantity: item.quantity });
      const unitPriceCents = priceCtx.priceCents;
      const lineCents = unitPriceCents * item.quantity;
      subtotalCents += lineCents;

      // Atomic reserve + commit (POS: no pending state — commit immediately)
      const reserved = await tx.$executeRaw`
        UPDATE inventory_levels
        SET on_hand = on_hand - ${item.quantity},
            version = version + 1,
            updated_at = now()
        WHERE product_id = ${item.productId}::uuid
          AND on_hand - reserved >= ${item.quantity}
        RETURNING on_hand
      `;
      if (!reserved || reserved === 0) throw new AppError('INSUFFICIENT_STOCK', `Insufficient stock for ${product.name}`);

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          locationId: shift.registerId, // approximate — use actual location in prod
          quantity: -item.quantity,
          reason: 'SALE',
          unitCostCents: product.avgCostCents || null,
          referenceType: 'ORDER',
          actorId: actor.userId,
        },
      });

      orderItems.push({ productId: item.productId, sku: product.sku, name: product.name,
                        quantity: item.quantity, unitPriceCents, vatRateBps: product.vatRateBps,
                        source: 'STOCK' });
    }

    const discountCents = Math.round(subtotalCents * discountBps / 10000);
    const totals = computeOrderTotals(orderItems, { discountCents });

    // Create order
    const order = await tx.order.create({
      data: {
        number: orderNumber,
        channel: 'WALK_IN',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        customerId: customerId || null,
        deliveryMethod: 'COUNTER',
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        deliveryFeeCents: 0,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        amountPaidCents: totals.totalCents,
        placedAt: new Date(),
        createdById: actor.userId,
        shiftId,
        idempotencyKey: idempotencyKey || null,
      },
    });

    await tx.orderItem.createMany({ data: orderItems.map(i => ({ ...i, orderId: order.id })) });

    // Record payments
    let totalPaidCents = 0;
    for (const pmt of payments) {
      totalPaidCents += pmt.amountCents;
      await tx.payment.create({
        data: {
          orderId: order.id,
          method: pmt.method,
          kind: 'FULL',
          state: pmt.method === 'MPESA_STK' ? 'PENDING' : 'SUCCEEDED',
          amountCents: pmt.amountCents,
          shiftId,
          receivedById: actor.userId,
          idempotencyKey: `${idempotencyKey || order.id}:${pmt.method}`,
        },
      });

      // Record cash movement for cash payments
      if (pmt.method === 'CASH') {
        await tx.cashMovement.create({
          data: { shiftId, type: 'SALE', amountCents: pmt.amountCents, referenceId: order.id, actorId: actor.userId },
        });
      }
    }

    await tx.orderStatusEvent.create({ data: { orderId: order.id, toStatus: 'COMPLETED', actorId: actor.userId } });
    await emitOutboxEvent(EVENTS.POS_SALE_COMPLETED, 'order', order.id, { orderId: order.id, totalCents: totals.totalCents }, tx);
    await recordAudit({ actor, action: 'pos.sale', entityType: 'order', entityId: order.id,
      after: { number: orderNumber, totalCents: totals.totalCents } }, tx);

    return { order, orderItems };
  });

  // Cache for idempotency
  if (idempotencyKey) {
    await redis.setex(`pos:idem:${idempotencyKey}`, 86400, JSON.stringify(result)).catch(() => {});
  }

  return result;
}

// ── Manager override token ─────────────────────────────────────────────────

export async function requestApprovalToken({ type, context, managerId, managerPin }, actor) {
  // Verify manager PIN / TOTP
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!manager) throw new AppError('NOT_FOUND', 'Manager not found');

  const hasPermission = manager.roles.some(ur =>
    ur.role.permissions.some(rp => rp.permission.key === 'pos:approve_override')
  );
  if (!hasPermission) throw new AppError('FORBIDDEN', 'User does not have approval permission');
  if (manager.id === actor.userId) throw new AppError('FORBIDDEN', 'Approver cannot be the requester');

  // Verify PIN (simplified — in production use TOTP)
  const { verifyPassword } = await import('../auth/auth.service.js');
  if (managerPin && manager.passwordHash) {
    const valid = await verifyPassword(managerPin, manager.passwordHash);
    if (!valid) throw new AppError('UNAUTHENTICATED', 'Invalid manager PIN');
  }

  // Issue single-use token
  const token = randomToken(16);
  const tokenHash = sha256(token);
  const contextHash = sha256(JSON.stringify(context));
  await redis.setex(`approval:${tokenHash}`, 300, JSON.stringify({ type, context, contextHash, managerId, used: false }));

  // Record approval
  await prisma.approval.create({
    data: {
      type,
      requestedById: actor.userId,
      approvedById: managerId,
      entityType: type,
      context,
    },
  });

  return { approvalToken: token };
}

export async function validateApprovalToken(token, contextToVerify) {
  const hash = sha256(token);
  const data = await redis.get(`approval:${hash}`).catch(() => null);
  if (!data) return false;

  const parsed = JSON.parse(data);
  if (parsed.used) return false;

  // Mark as used
  await redis.setex(`approval:${hash}`, 60, JSON.stringify({ ...parsed, used: true }));
  return true;
}

// ── Void / Refund ─────────────────────────────────────────────────────────

export async function voidSale(orderId, { reason, approvalToken }, actor) {
  if (!approvalToken) throw new AppError('APPROVAL_REQUIRED', 'Manager approval required to void a sale');
  await validateApprovalToken(approvalToken, { type: 'VOID', orderId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, payments: true },
  });
  if (!order || order.channel !== 'WALK_IN') throw new AppError('NOT_FOUND', 'Walk-in order not found');
  if (order.status === 'CANCELLED') throw new AppError('CONFLICT', 'Order already voided');

  await prisma.$transaction(async tx => {
    // Return stock
    for (const item of order.items) {
      await tx.$executeRaw`
        UPDATE inventory_levels
        SET on_hand = on_hand + ${item.quantity}, version = version + 1
        WHERE product_id = ${item.productId}::uuid
      `;
      await tx.stockMovement.create({
        data: { productId: item.productId, locationId: order.shiftId, quantity: item.quantity,
                reason: 'CUSTOMER_RETURN', referenceType: 'ORDER', referenceId: orderId, actorId: actor.userId },
      });
    }

    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledReason: reason } });

    // Cash movement (reversal)
    const cashPmt = order.payments.find(p => p.method === 'CASH' && p.state === 'SUCCEEDED');
    if (cashPmt && order.shiftId) {
      await tx.cashMovement.create({
        data: { shiftId: order.shiftId, type: 'REFUND', amountCents: -cashPmt.amountCents,
                referenceId: orderId, actorId: actor.userId },
      });
    }

    await recordAudit({ actor, action: 'pos.void', entityType: 'order', entityId: orderId,
      after: { reason } }, tx);
  });
}

// ── Receipt ────────────────────────────────────────────────────────────────

export async function getReceipt(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { name: true, sku: true, barcode: true } } } },
      payments: { where: { state: 'SUCCEEDED' } },
      shift: { include: { register: true } },
    },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');

  return {
    receiptNumber:  order.number,
    orderDate:      order.createdAt,
    register:       order.shift?.register?.code || 'N/A',
    items:          order.items.map(i => ({
      name: i.name, sku: i.sku, quantity: i.quantity,
      unitPriceCents: i.unitPriceCents, lineTotalCents: i.unitPriceCents * i.quantity,
    })),
    subtotalCents:  order.subtotalCents,
    discountCents:  order.discountCents,
    vatCents:       order.vatCents,
    totalCents:     order.totalCents,
    payments:       order.payments.map(p => ({ method: p.method, amountCents: p.amountCents })),
    businessName:   'MySpares',
    tagline:        'Quality Parts, Delivered Fast',
  };
}

// ── End-of-day report ─────────────────────────────────────────────────────

export async function endOfDayReport(registerId, date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);

  const shifts = await prisma.shift.findMany({
    where: { registerId, openedAt: { gte: start, lte: end } },
    include: { cashMovements: true },
  });

  const orders = await prisma.order.findMany({
    where: {
      channel: 'WALK_IN',
      shiftId: { in: shifts.map(s => s.id) },
      status: { not: 'CANCELLED' },
    },
    include: { payments: { where: { state: 'SUCCEEDED' } } },
  });

  const byMethod = {};
  let totalSales = 0, voidCount = 0, discountTotal = 0;

  for (const o of orders) {
    totalSales += o.totalCents;
    discountTotal += o.discountCents;
    for (const p of o.payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amountCents;
    }
  }

  const cancelledOrders = await prisma.order.count({
    where: { channel: 'WALK_IN', shiftId: { in: shifts.map(s => s.id) }, status: 'CANCELLED' },
  });

  return {
    date, registerId,
    salesCount: orders.length,
    voidCount: cancelledOrders,
    totalSalesCents: totalSales,
    discountCents: discountTotal,
    paymentsByMethod: byMethod,
    shifts: shifts.map(s => ({
      id: s.id, openedAt: s.openedAt, closedAt: s.closedAt,
      openingFloat: s.openingFloatCents, countedCash: s.countedCashCents, variance: s.varianceCents,
    })),
  };
}
