/**
 * Cart routes — guest and authenticated cart management + delivery zones.
 */
import { Router } from 'express';
import { optionalAuth } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as cartService from './cart.service.js';

const router = Router();

function cartContext(req) {
  return {
    userId:     req.user?.id     || null,
    guestToken: req.cookies?.guestToken || req.headers['x-guest-token'] || null,
  };
}

// GET /api/v1/cart
router.get('/', optionalAuth, asyncWrap(async (req, res) => {
  const { userId, guestToken } = cartContext(req);
  if (!userId && !guestToken) {
    const newToken = (await import('uuid')).v4();
    res.cookie('guestToken', newToken, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 86400_000 });
    return res.json({ data: { items: [], guestToken: newToken } });
  }
  const cart = await cartService.getCart(userId, guestToken);
  if (!userId && cart.guestToken) {
    res.cookie('guestToken', cart.guestToken, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 86400_000 });
  }
  return res.json({ data: cart });
}));

// POST /api/v1/cart/items
router.post('/items', optionalAuth, asyncWrap(async (req, res) => {
  const { userId, guestToken } = cartContext(req);
  const item = await cartService.addToCart(userId, guestToken, req.body);
  return res.status(201).json({ data: item });
}));

// PATCH /api/v1/cart/items/:id
router.patch('/items/:id', optionalAuth, asyncWrap(async (req, res) => {
  const { userId, guestToken } = cartContext(req);
  const result = await cartService.updateCartItem(userId, guestToken, req.params.id, Number(req.body.quantity));
  return res.json({ data: result || { message: 'Item removed' } });
}));

// DELETE /api/v1/cart/items/:id
router.delete('/items/:id', optionalAuth, asyncWrap(async (req, res) => {
  const { userId, guestToken } = cartContext(req);
  await cartService.removeCartItem(userId, guestToken, req.params.id);
  return res.status(204).send();
}));

// POST /api/v1/cart/merge (called after login)
router.post('/merge', optionalAuth, asyncWrap(async (req, res) => {
  const guestToken = req.body.guestToken || req.cookies?.guestToken;
  if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
  await cartService.mergeCart(guestToken, req.user.id);
  res.clearCookie('guestToken');
  const cart = await cartService.getCart(req.user.id, null);
  return res.json({ data: cart });
}));

// GET /api/v1/delivery-zones
router.get('/delivery-zones', asyncWrap(async (req, res) => {
  const zones = await cartService.getDeliveryZones();
  return res.json({ data: zones });
}));

export default router;
