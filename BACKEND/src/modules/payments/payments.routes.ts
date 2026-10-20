import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config, isDev } from '../../config/config';
import { prisma } from '../../shared/db/prisma';
import { AppError } from '../../shared/errors/app-error';
import { normalizePhone } from '../../shared/phone';
import { fakeMpesa, mpesa } from '../../integrations/mpesa';
import { FakeMpesaClient } from '../../integrations/mpesa/mpesa.fake';
import { centsToShillings } from '../../integrations/mpesa/mpesa.helpers';
import { ordersService } from '../orders/orders.routes';
import { IdempotencyKeyHeader, OrderNumberParams } from '../orders/orders.schemas';
import { PaymentsService } from './payments.service';

export const paymentsService = new PaymentsService(prisma, ordersService, mpesa);

const phone = z.string().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
    return z.NEVER;
  }
  return n;
});
const StartMpesaBody = z.object({
  phone, // the M-Pesa number that will receive the PIN prompt
  contactPhone: phone.optional(), // guests: the phone used at checkout (proves it's their order)
});

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function paymentRoutes(app: FastifyInstance) {
  // ── Customer: pay with M-Pesa ──
  app.post(
    '/orders/:number/payments/mpesa',
    { preHandler: [app.authenticateOptional], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { number } = OrderNumberParams.parse(req.params);
      const idempotencyKey = IdempotencyKeyHeader.parse(req.headers['idempotency-key']);
      const body = StartMpesaBody.parse(req.body);
      const { payment, alreadyInProgress } = await paymentsService.startMpesa({
        orderNumber: number,
        phone: body.phone,
        idempotencyKey,
        requester: { userId: req.user?.sub ?? null, contactPhone: body.contactPhone ?? null },
      });
      return reply.status(alreadyInProgress ? 200 : 201).send({
        data: {
          paymentId: payment.id,
          state: payment.state,
          amountCents: payment.amountCents,
          message: 'Check your phone and enter your M-Pesa PIN to complete payment.',
        },
      });
    },
  );

  // ── Checkout page polls this every ~3 seconds ──
  app.get('/payments/:id', async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return { data: await paymentsService.status(id) };
  });

  // ── Safaricom → us. The secret in the URL stops random people calling it. ──
  app.post('/webhooks/mpesa/stk/:secret', { config: { rateLimit: false } }, async (req, reply) => {
    const { secret } = z.object({ secret: z.string() }).parse(req.params);
    if (!safeEqual(secret, config.MPESA_CALLBACK_SECRET)) throw new AppError('NOT_FOUND', 'Not found');
    if (config.MPESA_ALLOWED_IPS.length && !config.MPESA_ALLOWED_IPS.includes(req.ip)) {
      req.log.warn({ ip: req.ip }, 'M-Pesa callback from unexpected IP');
      throw new AppError('NOT_FOUND', 'Not found');
    }
    try {
      await paymentsService.handleMpesaCallback(req.body);
    } catch (err) {
      req.log.error({ err }, 'Bad M-Pesa callback');
    }
    // Always acknowledge quickly; our own reconcile job is the safety net.
    return reply.send({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  // ── DEV ONLY: pretend to be Safaricom (fake mode, never in production) ──
  if (isDev && config.INTEGRATIONS_MODE === 'fake') {
    app.post('/dev/mpesa/simulate/:paymentId', async (req) => {
      const { paymentId } = z.object({ paymentId: z.uuid() }).parse(req.params);
      const { resultCode } = z.object({ resultCode: z.number().int().default(0) }).parse(req.body ?? {});
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (!payment.providerRequestId) throw new AppError('CONFLICT', 'Payment was never sent to M-Pesa');
      fakeMpesa.queryResults.set(payment.providerRequestId, { status: 'DONE', resultCode: String(resultCode), resultDesc: 'simulated' });
      await paymentsService.handleMpesaCallback(
        FakeMpesaClient.callbackBody(payment.providerRequestId, { resultCode, amount: centsToShillings(payment.amountCents), phone: payment.phone ?? undefined }),
      );
      return { data: await paymentsService.status(paymentId) };
    });
  }
}
