/**
 * Stripe integration.
 * Fake mode returns synthetic PaymentIntent objects for local/CI testing.
 */
import { getConfig } from '../../shared/config/index.js';

function getStripe() {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') return null;
  const Stripe = require('stripe');
  return Stripe(config.STRIPE_SECRET_KEY);
}

/**
 * Create a Stripe PaymentIntent.
 * @param {{ amountCents:number, orderId:string, paymentId:string, idempotencyKey:string }} opts
 * @returns {Promise<{id:string, clientSecret:string}>}
 */
export async function createPaymentIntent({ amountCents, orderId, paymentId, idempotencyKey }) {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') {
    return {
      id: `pi_fake_${Date.now()}`,
      clientSecret: `pi_fake_${Date.now()}_secret_fake`,
    };
  }

  const Stripe = (await import('stripe')).default;
  const stripe = Stripe(config.STRIPE_SECRET_KEY);
  const pi = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'kes',
      metadata: { orderId, paymentId },
    },
    { idempotencyKey }
  );
  return { id: pi.id, clientSecret: pi.client_secret };
}

/**
 * Verify a Stripe webhook signature and parse the event.
 * @param {Buffer} rawBody
 * @param {string} signature
 */
export async function constructWebhookEvent(rawBody, signature) {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') {
    return JSON.parse(rawBody.toString());
  }
  const Stripe = (await import('stripe')).default;
  const stripe = Stripe(config.STRIPE_SECRET_KEY);
  return stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
}

/**
 * Create a refund.
 * @param {{ paymentIntentId:string, amountCents:number, reason:string }} opts
 */
export async function createRefund({ paymentIntentId, amountCents, reason }) {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') {
    return { id: `re_fake_${Date.now()}`, status: 'succeeded' };
  }
  const Stripe = (await import('stripe')).default;
  const stripe = Stripe(config.STRIPE_SECRET_KEY);
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents,
    reason: reason || 'requested_by_customer',
  });
}
