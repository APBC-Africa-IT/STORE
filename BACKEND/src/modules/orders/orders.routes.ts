import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';
import { AppError } from '../../shared/errors/app-error';
import { toPage } from '../../shared/pagination';
import { InventoryRepository } from '../inventory/inventory.repository';
import { inventoryService } from '../inventory/inventory.routes';
import { cartOwner, cartService } from '../cart/cart.routes';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import { toCustomerOrder } from './orders.serializers';
import { CancelBody, CreateOrderBody, IdempotencyKeyHeader, OrderNumberParams, QuoteBody, TrackQuery } from './orders.schemas';

export const ordersService = new OrdersService(prisma, inventoryService);
export const checkoutService = new CheckoutService(prisma, inventoryService, new InventoryRepository(prisma));

export async function orderRoutes(app: FastifyInstance) {
  const optional = { preHandler: [app.authenticateOptional] };
  const loggedIn = { preHandler: [app.authenticate] };

  // ── Checkout ──
  app.post('/checkout/quote', optional, async (req) => {
    return { data: await checkoutService.quote(QuoteBody.parse(req.body)) };
  });

  app.post('/orders', { ...optional, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const idempotencyKey = IdempotencyKeyHeader.parse(req.headers['idempotency-key']);
    const body = CreateOrderBody.parse(req.body);
    const customerId = req.user?.sub ?? null;

    const { order, replayed } = await checkoutService.createOrder(body, { idempotencyKey, customerId });
    if (!replayed && body.fromCart) {
      await cartService.clear(cartOwner(req), body.items.map((i) => i.productId));
    }
    return reply.status(replayed ? 200 : 201).send({ data: toCustomerOrder(order) });
  });

  // ── Customer's own orders ──
  app.get('/me/orders', loggedIn, async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.uuid().optional() }).parse(req.query);
    const { items, page } = toPage(await ordersService.listForCustomer(req.user.sub, q.limit, q.cursor), q.limit);
    return { data: items.map(toCustomerOrder), page };
  });

  app.get('/me/orders/:number', loggedIn, async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    const order = await ordersService.findByNumber(number);
    if (!order || order.customerId !== req.user.sub) throw new AppError('NOT_FOUND', 'Order not found');
    return { data: toCustomerOrder(order) };
  });

  app.post('/me/orders/:number/cancel', loggedIn, async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    const { reason } = CancelBody.parse(req.body ?? {});
    const order = await ordersService.cancelByCustomer(number, req.user.sub, reason);
    return { data: toCustomerOrder(order!) };
  });

  // ── Guest tracking: order number + the phone used at checkout ──
  app.get('/orders/track/:number', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    const { phone } = TrackQuery.parse(req.query);
    const order = await ordersService.findByNumber(number);
    if (!order || order.contactPhone !== phone) throw new AppError('NOT_FOUND', 'Order not found');
    return { data: toCustomerOrder(order) };
  });
}
