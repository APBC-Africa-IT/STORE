import { Router } from 'express';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { protectRoute, optionalAuth } from '../../middleware/authMiddleware.js';
import * as svc from './payments.service.js';

const router = Router();

// Initiate payment
router.post('/orders/:id/payments', optionalAuth, asyncWrap(async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  const payment = await svc.initiatePayment({
    orderId: req.params.id,
    ...req.body,
    idempotencyKey,
  }, { userId: req.user?.id, ip: req.ip });
  res.status(201).json({ data: payment });
}));

router.get('/orders/:id/payments/:paymentId', optionalAuth, asyncWrap(async (req, res) => {
  const { prisma } = await import('../../shared/db/prisma.js');
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: req.params.paymentId } });
  res.json({ data: { state: payment.state, providerRef: payment.providerRef, succeededAt: payment.succeededAt } });
}));

// M-Pesa callback — no auth (incoming from Safaricom)
router.post(`/webhooks/mpesa/stk/:secret`, asyncWrap(async (req, res) => {
  if (req.params.secret !== process.env.MPESA_CALLBACK_SECRET) return res.status(403).end();
  await svc.handleMpesaCallback(req.body);
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}));

// Stripe webhook — raw body required
router.post('/webhooks/stripe', asyncWrap(async (req, res) => {
  await svc.handleStripeWebhook(req.rawBody || JSON.stringify(req.body), req.headers['stripe-signature']);
  res.json({ received: true });
}));

export default router;
