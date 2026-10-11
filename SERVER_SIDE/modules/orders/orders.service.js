/**
 * Orders service — cart, checkout quote, order creation, lifecycle.
 */
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { emitOutboxEvent, emitOutboxEvents } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { recordAudit } from '../audit/audit.service.js';
import { orderMachine } from './order.machine.js';
import { reserveStock, releaseReservation } from '../inventory/inventory.service.js';
import { getEffectivePrice, getPriceBreakdown, getDeliveryFee } from '../pricing/pricing.service.js';
import { getAvailability } from '../catalog/catalog.service.js';
import { generateOrderNumber } from '../../shared/ids/index.js';
import { vatFromInclusive } from '../../shared/money/index.js';

// ── Cart ───────────────────────────────────────────────────────────────────
export async function getOrCreateCart(userId, guestToken) {
  if (userId) {
    return prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: { items: true },
    });
  }
  if (guestToken) {
    return prisma.cart.upsert({
      where: { guestToken },
      update: {},
      create: { guestToken },
      include: { items: true },
    });
  }
  throw new AppError('VALIDATION_FAILED', 'User or guest token required');
}

export async function addToCart(userId, guestToken, { productId, quantity, garageVehicleId }) {
  const cart = await getOrCreateCart(userId, guestToken);
  return prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { quantity: { increment: quantity } },
    create: { cartId: cart.id, productId, quantity, garageVehicleId },
  });
}

export async function updateCartItem(userId, guestToken, cartItemId, quantity) {
  const cart = await getOrCreateCart(userId, guestToken);
  return prisma.cartItem.update({
    where: { id: cartItemId, cartId: cart.id },
    data: { quantity },
  });
}

export async function removeCartItem(userId, guestToken, cartItemId) {
  const cart = await getOrCreateCart(userId, guestToken);
  return prisma.cartItem.delete({ where: { id: cartItemId, cartId: cart.id } });
}

export async function mergeCart(guestToken, userId) {
  const guest = await prisma.cart.findUnique({ where: { guestToken }, include: { items: true } });
  if (!guest) return;
  for (const item of guest.items) {
    await addToCart(userId, null, { productId: item.productId, quantity: item.quantity });
  }
  await prisma.cart.delete({ where: { guestToken } });
}

// ── Checkout quote (no side effects) ──────────────────────────────────────
export async function getCheckoutQuote({ items, deliveryMethod, zoneId, paymentMethod, promoCode, customerTier }) {
  const quotedLines = [];
  let subtotalCents = 0;
  let totalVatCents = 0;

  for (const item of items) {
    const unitPrice = await getEffectivePrice(item.productId, { customerTier });
    if (!unitPrice) throw new AppError('NOT_FOUND', `Product ${item.productId} not found`);

    const avail = await getAvailability(item.productId);
    let source = 'STOCK';
    let leadTimeMins = null;
    let readyBy = null;

    if (avail.status === 'AVAILABLE_TO_ORDER') {
      source = 'SOURCED';
      leadTimeMins = avail.leadTimeMins;
      readyBy = avail.readyBy;
    } else if (avail.status === 'RARE_PART_REQUEST') {
      throw new AppError('INSUFFICIENT_STOCK', `Product ${item.productId} is not available`);
    }

    const { lineTotal, vatCents } = getPriceBreakdown(unitPrice, 1600, item.quantity);
    subtotalCents += lineTotal;
    totalVatCents += vatCents;
    quotedLines.push({ productId: item.productId, quantity: item.quantity, unitPriceCents: unitPrice, source, leadTimeMins, readyBy });
  }

  const deliveryFeeCents = await getDeliveryFee(zoneId, subtotalCents, deliveryMethod === 'EXPRESS');
  const totalCents = subtotalCents + deliveryFeeCents;

  const hasSourcingLines = quotedLines.some(l => l.source === 'SOURCED');
  const depositPct = 3000; // 30% in bps — from settings ideally
  const depositRequiredCents = hasSourcingLines ? Math.ceil((totalCents * depositPct) / 10000 / 100) * 100 : 0;

  const codAllowed = !hasSourcingLines && totalCents <= 200000 && ['STANDARD', 'EXPRESS'].includes(deliveryMethod);

  return {
    lines: quotedLines,
    subtotalCents, vatCents: totalVatCents, deliveryFeeCents,
    totalCents, depositRequiredCents, codAllowed, hasSourcingLines,
  };
}

// ── Create order (idempotent) ──────────────────────────────────────────────
export async function createOrder({
  idempotencyKey, customerId, guestEmail, guestPhone,
  channel = 'ONLINE', deliveryMethod, zoneId, deliveryAddress,
  isCod, acceptSourcingLeadTime, expectedTotalCents,
  promoCode, createdById, shiftId,
}, actor) {
  // Idempotency check
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  const cart = customerId
    ? await prisma.cart.findUnique({ where: { userId: customerId }, include: { items: true } })
    : null;

  const items = cart?.items || [];
  if (items.length === 0) throw new AppError('VALIDATION_FAILED', 'Cart is empty');

  const customerTier = 'RETAIL';
  const quote = await getCheckoutQuote({
    items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
    deliveryMethod, zoneId, channel, customerTier,
  });

  // Reject if total changed vs client expectation
  if (expectedTotalCents && Math.abs(quote.totalCents - expectedTotalCents) > 1) {
    throw new AppError('CONFLICT', 'Order total has changed', { newTotal: quote.totalCents });
  }

  if (quote.hasSourcingLines && !acceptSourcingLeadTime) {
    throw new AppError('VALIDATION_FAILED', 'You must accept the sourcing lead time');
  }

  const orderNumber = await generateOrderNumber();

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        number: orderNumber,
        channel,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        customerId:          customerId || null,
        guestEmail:          guestEmail || null,
        guestPhone:          guestPhone || null,
        deliveryMethod,
        deliveryZoneId:      zoneId || null,
        deliveryAddress:     deliveryAddress || null,
        isCod:               isCod || false,
        hasSourcedItems:     quote.hasSourcingLines,
        sourcingAcceptedAt:  quote.hasSourcingLines ? new Date() : null,
        subtotalCents:       quote.subtotalCents,
        discountCents:       0,
        deliveryFeeCents:    quote.deliveryFeeCents,
        vatCents:            quote.vatCents,
        totalCents:          quote.totalCents,
        depositRequiredCents: quote.depositRequiredCents,
        amountPaidCents:     0,
        promoCode:           promoCode || null,
        createdById:         createdById || null,
        shiftId:             shiftId || null,
        idempotencyKey:      idempotencyKey || null,
      },
    });

    // Create order items
    const defaultLocationId = (await tx.location.findFirst({ where: { isDefault: true } }))?.id;

    for (const line of quote.lines) {
      const product = await tx.product.findUnique({ where: { id: line.productId } });
      const item = await tx.orderItem.create({
        data: {
          orderId:       order.id,
          productId:     line.productId,
          sku:           product.sku,
          name:          product.name,
          quantity:      line.quantity,
          unitPriceCents: line.unitPriceCents,
          vatRateBps:    product.vatRateBps ?? 1600,
          source:        line.source,
          sourcingStatus: line.source === 'STOCK' ? 'NOT_REQUIRED' : 'AWAITING_PO',
          leadTimeMins:  line.leadTimeMins || null,
        },
      });

      // Reserve stock for STOCK lines
      if (line.source === 'STOCK' && defaultLocationId) {
        const reserveTtlMins = 30;
        const expiresAt = new Date(Date.now() + reserveTtlMins * 60 * 1000);
        await reserveStock({
          productId: line.productId,
          locationId: defaultLocationId,
          orderItemId: item.id,
          quantity: line.quantity,
          expiresAt,
        });
      }
    }

    // Clear cart
    if (cart) await tx.cart.update({ where: { id: cart.id }, data: { items: { deleteMany: {} } } });

    // Status history
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, toStatus: 'PENDING_PAYMENT', actorId: createdById || null },
    });

    await emitOutboxEvent(EVENTS.ORDER_CREATED, 'order', order.id, { orderId: order.id, number: order.number }, tx);
    await recordAudit({ actor, action: 'order.created', entityType: 'order', entityId: order.id, after: { number: orderNumber, totalCents: quote.totalCents } }, tx);

    return order;
  });
}

// ── Transition order status ───────────────────────────────────────────────
export async function transitionOrderStatus(orderId, toStatus, { actorId, note, customerVisibleText, ctx = {} } = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    orderMachine.assertTransition(order.status, toStatus, {
      ...ctx,
      amountPaidCents:       order.amountPaidCents,
      depositRequiredCents:  order.depositRequiredCents,
      totalCents:            order.totalCents,
      isCod:                 order.isCod,
    });

    // Compare-and-set for optimistic concurrency
    const result = await tx.$executeRaw`
      UPDATE orders SET status = ${toStatus}::text::"OrderStatus", version = version + 1,
        updated_at = NOW()
      WHERE id = ${orderId} AND status = ${order.status}::text::"OrderStatus" AND version = ${order.version}
    `;
    if (result === 0) throw new AppError('CONFLICT', 'Order was modified concurrently');

    await tx.orderStatusEvent.create({
      data: { orderId, fromStatus: order.status, toStatus, actorId: actorId || null, note: note || null, customerVisibleText: customerVisibleText || null },
    });

    await emitOutboxEvent(EVENTS.ORDER_STATUS_CHANGED, 'order', orderId, {
      orderId, fromStatus: order.status, toStatus,
    }, tx);

    return { ...order, status: toStatus, version: order.version + 1 };
  });
}

// ── Cancel order ──────────────────────────────────────────────────────────
export async function cancelOrder(orderId, reason, actor) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });

    orderMachine.assertTransition(order.status, 'CANCELLED', {});

    // Check no PO is SENT for sourced items
    const sentPOs = await tx.purchaseOrder.findMany({
      where: { orderId, status: { in: ['SENT', 'CONFIRMED_BY_SUPPLIER', 'RIDER_ASSIGNED', 'COLLECTED'] } },
    });
    if (sentPOs.length > 0 && actor?.type !== 'STAFF') {
      throw new AppError('FORBIDDEN', 'Cannot cancel — supplier PO already sent. Contact support.');
    }

    // Release all active reservations
    const reservations = await tx.stockReservation.findMany({
      where: { orderItemId: { in: order.items.map(i => i.id) }, status: 'ACTIVE' },
    });
    for (const r of reservations) await releaseReservation(r.id);

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledReason: reason, version: { increment: 1 } },
    });

    await tx.orderStatusEvent.create({
      data: { orderId, fromStatus: order.status, toStatus: 'CANCELLED', actorId: actor?.userId || null, note: reason },
    });

    await emitOutboxEvent(EVENTS.ORDER_CANCELLED, 'order', orderId, { orderId, reason }, tx);
    await recordAudit({ actor, action: 'order.cancelled', entityType: 'order', entityId: orderId, reason }, tx);
  });
}

// ── Get order (customer) ──────────────────────────────────────────────────
export async function getOrderForCustomer(orderId, customerId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } }, payments: { select: { id: true, method: true, state: true, amountCents: true } } },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  if (order.customerId !== customerId) throw new AppError('NOT_FOUND', 'Order not found');
  // Strip staff-only fields
  return order;
}

// ── Admin order list ──────────────────────────────────────────────────────
export async function listOrders({ status, channel, paymentStatus, page = 1, pageSize = 25 }) {
  const where = {};
  if (status)        where.status        = status;
  if (channel)       where.channel       = channel;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: { select: { id: true, name: true, quantity: true, source: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
