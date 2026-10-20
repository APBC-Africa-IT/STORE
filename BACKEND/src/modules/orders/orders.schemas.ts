import { z } from 'zod';
import { DeliveryMethod, PaymentPlan } from '@prisma/client';
import { normalizePhone } from '../../shared/phone';
import { CHECKOUT_SETTINGS } from './checkout.settings';

const phone = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
    return z.NEVER;
  }
  return normalized;
});

const CheckoutItems = z
  .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(CHECKOUT_SETTINGS.maxLineQuantity) }))
  .min(1, 'Your order is empty')
  .max(CHECKOUT_SETTINGS.maxCartLines);

export const QuoteBody = z.object({
  items: CheckoutItems,
  deliveryMethod: z.enum([DeliveryMethod.STANDARD, DeliveryMethod.EXPRESS, DeliveryMethod.CLICK_AND_COLLECT]),
  deliveryZoneId: z.uuid().optional(),
  paymentPlan: z.enum(PaymentPlan).default('FULL'),
});
export type QuoteBody = z.infer<typeof QuoteBody>;

export const CreateOrderBody = QuoteBody.extend({
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    phone,
    email: z.email().toLowerCase().optional(),
  }),
  address: z
    .object({
      line1: z.string().trim().min(3).max(200),
      line2: z.string().trim().max(200).optional(),
      area: z.string().trim().min(2).max(100),
      landmark: z.string().trim().max(200).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .optional(),
  acceptSourcingLeadTime: z.boolean().default(false),
  expectedTotalCents: z.number().int().min(0), // what the customer saw; protects against silent price changes
  fromCart: z.boolean().default(false),
});
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

export const IdempotencyKeyHeader = z
  .string({ error: 'Idempotency-Key header is required' })
  .min(16, 'Idempotency-Key must be at least 16 characters (use a UUID)')
  .max(100);

export const OrderNumberParams = z.object({ number: z.string().regex(/^ORD-\d{6}-\d{5,}$/, 'Invalid order number') });
export const TrackQuery = z.object({ phone });
export const CancelBody = z.object({ reason: z.string().trim().min(3).max(300).default('Cancelled by customer') });
