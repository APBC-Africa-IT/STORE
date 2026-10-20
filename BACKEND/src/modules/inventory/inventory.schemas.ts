import { z } from 'zod';
import { cursorQuery } from '../../shared/pagination';

const INCREASE_REASONS = ['OPENING_BALANCE', 'ADJUSTMENT_FOUND', 'ADJUSTMENT_COUNTED', 'CUSTOMER_RETURN'] as const;
const DECREASE_REASONS = ['ADJUSTMENT_DAMAGED', 'ADJUSTMENT_STOLEN', 'ADJUSTMENT_PROMO_WRITE_OFF', 'ADJUSTMENT_COUNTED'] as const;

export const AdjustmentBody = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().refine((q) => q !== 0, 'Quantity cannot be zero'), // +in / -out
    reason: z.enum([...new Set([...INCREASE_REASONS, ...DECREASE_REASONS])] as [string, ...string[]]),
    note: z.string().trim().min(3, 'Explain the adjustment').max(500),
    unitCostCents: z.number().int().min(0).optional(),
  })
  .refine(
    (b) =>
      b.quantity > 0
        ? (INCREASE_REASONS as readonly string[]).includes(b.reason)
        : (DECREASE_REASONS as readonly string[]).includes(b.reason),
    { message: 'This reason does not match the direction of the adjustment', path: ['reason'] },
  );
export type AdjustmentBody = z.infer<typeof AdjustmentBody>;

export const BinCreateBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, 'Use a code like A-03-B2'),
});

export const SetBinBody = z.object({ binId: z.uuid().nullable() });

export const MovementsQuery = z.object({
  productId: z.uuid().optional(),
  reason: z.string().optional(),
  ...cursorQuery,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
