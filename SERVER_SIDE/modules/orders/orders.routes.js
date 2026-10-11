import { Router } from 'express';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { protectRoute, optionalAuth, requirePermission } from '../../middleware/authMiddleware.js';
import { PERMISSIONS } from '../../shared/auth/permissions.js';
import * as svc from './orders.service.js';

const router = Router();

// ── Cart ───────────────────────────────────────────────────────────────────
router.get('/cart', optionalAuth, asyncWrap(async (req, res) => {
  const cart = await svc.getOrCreateCart(req.user?.id, req.headers['x-guest-token']);
  res.json({ data: cart });
}));

router.post('/cart/items', optionalAuth, asyncWrap(async (req, res) => {
  const item = await svc.addToCart(req.user?.id, req.headers['x-guest-token'], req.body);
  res.status(201).json({ data: item });
}));

router.patch('/cart/items/:id', optionalAuth, asyncWrap(async (req, res) => {
  const item = await svc.updateCartItem(req.user?.id, req.headers['x-guest-token'], req.params.id, req.body.quantity);
  res.json({ data: item });
}));

router.delete('/cart/items/:id', optionalAuth, asyncWrap(async (req, res) => {
  await svc.removeCartItem(req.user?.id, req.headers['x-guest-token'], req.params.id);
  res.json({ data: { message: 'Removed' } });
}));

router.post('/cart/merge', protectRoute, asyncWrap(async (req, res) => {
  await svc.mergeCart(req.body.guestToken, req.user.id);
  res.json({ data: { message: 'Cart merged' } });
}));

// ── Checkout ───────────────────────────────────────────────────────────────
router.post('/checkout/quote', optionalAuth, asyncWrap(async (req, res) => {
  const quote = await svc.getCheckoutQuote(req.body);
  res.json({ data: quote });
}));

// ── Orders ─────────────────────────────────────────────────────────────────
router.post('/orders', optionalAuth, asyncWrap(async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const order = await svc.createOrder(
    { ...req.body, idempotencyKey, customerId: req.user?.id },
    { userId: req.user?.id, ip: req.ip }
  );
  res.status(201).json({ data: order });
}));

router.get('/me/orders', protectRoute, asyncWrap(async (req, res) => {
  const orders = await svc.listOrders({ customerId: req.user.id, ...req.query });
  res.json({ data: orders });
}));

router.get('/me/orders/:id', protectRoute, asyncWrap(async (req, res) => {
  const order = await svc.getOrderForCustomer(req.params.id, req.user.id);
  res.json({ data: order });
}));

router.post('/me/orders/:id/cancel', protectRoute, asyncWrap(async (req, res) => {
  await svc.cancelOrder(req.params.id, req.body.reason, { userId: req.user.id, ip: req.ip });
  res.json({ data: { message: 'Order cancelled' } });
}));

// ── Admin orders ───────────────────────────────────────────────────────────
router.get('/admin/orders', protectRoute, requirePermission(PERMISSIONS.ORDERS_READ_ALL),
  asyncWrap(async (req, res) => res.json({ data: await svc.listOrders(req.query) })));

router.get('/admin/orders/:id', protectRoute, requirePermission(PERMISSIONS.ORDERS_READ_ALL),
  asyncWrap(async (req, res) => {
    const { prisma } = await import('../../shared/db/prisma.js');
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { items: true, statusHistory: true, payments: true, notes: true },
    });
    res.json({ data: order });
  }));

router.post('/admin/orders/:id/confirm', protectRoute, requirePermission(PERMISSIONS.ORDERS_UPDATE_STATUS),
  asyncWrap(async (req, res) => {
    const order = await svc.transitionOrderStatus(req.params.id, 'CONFIRMED', { actorId: req.user.id });
    res.json({ data: order });
  }));

router.post('/admin/orders/:id/cancel', protectRoute, requirePermission(PERMISSIONS.ORDERS_CANCEL),
  asyncWrap(async (req, res) => {
    await svc.cancelOrder(req.params.id, req.body.reason, { userId: req.user.id, ip: req.ip, type: 'STAFF' });
    res.json({ data: { message: 'Order cancelled' } });
  }));

router.post('/admin/orders/:id/pick', protectRoute, requirePermission(PERMISSIONS.ORDERS_UPDATE_STATUS),
  asyncWrap(async (req, res) => {
    const order = await svc.transitionOrderStatus(req.params.id, 'PICKING', { actorId: req.user.id });
    res.json({ data: order });
  }));

router.post('/admin/orders/:id/pack', protectRoute, requirePermission(PERMISSIONS.ORDERS_UPDATE_STATUS),
  asyncWrap(async (req, res) => {
    const order = await svc.transitionOrderStatus(req.params.id, 'PACKED', { actorId: req.user.id });
    res.json({ data: order });
  }));

router.get('/admin/fulfilment/queue', protectRoute, requirePermission(PERMISSIONS.ORDERS_UPDATE_STATUS),
  asyncWrap(async (req, res) => {
    const { prisma } = await import('../../shared/db/prisma.js');
    const queue = await prisma.order.findMany({
      where: { status: 'PICKING' },
      include: { items: true },
      orderBy: { promisedBy: 'asc' },
      take: 50,
    });
    res.json({ data: queue });
  }));

router.post('/admin/orders/:id/notes', protectRoute, requirePermission(PERMISSIONS.ORDERS_READ_ALL),
  asyncWrap(async (req, res) => {
    const { prisma } = await import('../../shared/db/prisma.js');
    const note = await prisma.orderNote.create({
      data: { orderId: req.params.id, authorId: req.user.id, body: req.body.body, isInternal: req.body.isInternal ?? true },
    });
    res.status(201).json({ data: note });
  }));

export default router;
