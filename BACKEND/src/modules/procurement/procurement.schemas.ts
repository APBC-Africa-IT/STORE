import { z } from 'zod';
import { PaymentTerms, PoChannel, SupplierAvailability, SupplierStatus, SupplierType } from '@prisma/client';
import { normalizePhone } from '../../shared/phone';
import { cursorQuery } from '../../shared/pagination';

const phone = z.string().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
    return z.NEVER;
  }
  return n;
});
const cents = z.number().int().min(0);
const checks = z.object({ correctPart: z.boolean(), correctQty: z.boolean(), noDamage: z.boolean() });

// ── Suppliers ──
export const SupplierBody = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(SupplierType),
  contactName: z.string().trim().max(120).optional(),
  phone,
  email: z.email().optional(),
  whatsapp: phone.optional(),
  addressLine: z.string().trim().min(3).max(200),
  area: z.string().trim().min(2).max(100),
  categories: z.array(z.string().trim().min(1)).max(30).default([]),
  paymentTerms: z.enum(PaymentTerms).default('ON_COLLECTION'),
  typicalLeadTimeMins: z.number().int().min(15).max(7 * 24 * 60).default(120),
  notes: z.string().max(2000).optional(),
});
export const SupplierUpdateBody = SupplierBody.partial();
export const SupplierStatusBody = z.object({ status: z.enum(SupplierStatus), reason: z.string().trim().min(3).max(300) });

export const CatalogBody = z.object({
  items: z
    .array(
      z.object({
        partNumber: z.string().trim().min(2).max(64),
        description: z.string().trim().min(2).max(200),
        costCents: cents,
        availability: z.enum(SupplierAvailability).default('UNKNOWN'),
        productId: z.uuid().optional(), // optional: we auto-match by part number
      }),
    )
    .min(1)
    .max(1000),
});

export const CandidatesQuery = z.object({ productId: z.uuid() });

// ── Purchase orders ──
export const ReactivePoBody = z.object({
  supplierId: z.uuid(),
  orderItemIds: z.array(z.uuid()).min(1).max(50),
  unitCosts: z.record(z.string(), cents).optional(), // orderItemId → cost override (else the supplier's catalog price)
  acknowledgeMarginWarning: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export const RestockPoBody = z.object({
  supplierId: z.uuid(),
  lines: z.array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(10_000), unitCostCents: cents })).min(1).max(200),
  notes: z.string().max(1000).optional(),
});

export const SendPoBody = z.object({ channel: z.enum(PoChannel), note: z.string().max(500).optional() });

export const SupplierResponseBody = z.discriminatedUnion('response', [
  z.object({ response: z.literal('CONFIRMED'), readyAt: z.coerce.date().optional() }),
  z.object({
    response: z.literal('PARTIAL'),
    lines: z.array(z.object({ itemId: z.uuid(), confirmedQty: z.number().int().min(0) })).min(1),
    readyAt: z.coerce.date().optional(),
  }),
  z.object({ response: z.literal('REJECTED'), reason: z.string().trim().min(3).max(300) }),
]);

export const CancelPoBody = z.object({ reason: z.string().trim().min(3).max(300) });

export const PoListQuery = z.object({
  status: z.string().optional(),
  supplierId: z.uuid().optional(),
  ...cursorQuery,
});

// ── Goods received ──
export const GrnBody = z.object({
  purchaseOrderNumber: z.string().regex(/^PO-\d{4}-\d{5,}$/),
  collectionFeeCents: cents.optional(), // boda boda cost → landed cost. Omit to use the collection job's rider fee
  otherCostsCents: cents.default(0),
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z
        .object({
          purchaseOrderItemId: z.uuid(),
          receivedQty: z.number().int().min(0),
          acceptedQty: z.number().int().min(0),
          checks,
          rejectionReason: z.string().trim().min(3).max(300).optional(),
        })
        .refine((l) => l.acceptedQty <= l.receivedQty, { message: 'Accepted cannot exceed received', path: ['acceptedQty'] })
        .refine((l) => l.acceptedQty === l.receivedQty || l.rejectionReason, { message: 'Say why parts were rejected', path: ['rejectionReason'] })
        .refine((l) => l.acceptedQty === 0 || (l.checks.correctPart && l.checks.correctQty && l.checks.noDamage), {
          message: 'Parts can only be accepted if every quality check passed',
          path: ['checks'],
        }),
    )
    .min(1),
});
export type GrnBody = z.infer<typeof GrnBody>;
