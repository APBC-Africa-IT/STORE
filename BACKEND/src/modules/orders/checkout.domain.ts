// Pure checkout maths: splitting lines, VAT, delivery fee, deposit, COD, timelines. No I/O.

import type { DeliveryMethod, PaymentPlan } from '@prisma/client';
import { vatPortion } from '../catalog/pricing.domain';
import { estimateInStockReadyBy, estimateSourcedReadyBy } from '../inventory/availability.domain';
import { CHECKOUT_SETTINGS } from './checkout.settings';

export type QuoteLineInput = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number; // VAT-inclusive, already the effective price
  vatRateBps: number;
  freeStock: number; // on_hand - reserved right now
  canSource: boolean;
  sourcingLeadTimeMins: number | null;
};

export type QuoteInput = {
  lines: QuoteLineInput[];
  deliveryMethod: DeliveryMethod;
  zone: { id: string; customerFeeCents: number; expressSurchargeCents: number } | null;
  paymentPlan: PaymentPlan;
  now?: Date;
};

export type QuoteLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  source: 'STOCK' | 'SOURCED';
  unitPriceCents: number;
  lineTotalCents: number;
  vatRateBps: number;
  vatCents: number;
  leadTimeMins: number | null;
  readyBy: Date;
};

export type QuoteProblem =
  | { code: 'NOT_AVAILABLE'; productId: string; requested: number; available: number }
  | { code: 'ZONE_REQUIRED' }
  | { code: 'DEPOSIT_NOT_ALLOWED'; reason: string }
  | { code: 'COD_NOT_ALLOWED'; reason: string };

export type Quote = {
  lines: QuoteLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  vatCents: number;
  totalCents: number;
  hasSourcedItems: boolean;
  sourcedValueCents: number;
  depositAllowed: boolean;
  depositRequiredCents: number;
  codAllowed: boolean;
  timelines: { inStockReadyBy: Date | null; sourcedReadyBy: Date | null };
  promisedBy: Date | null;
  sourcingNotice: string | null;
  problems: QuoteProblem[];
};

const roundUpToShilling = (cents: number) => Math.ceil(cents / 100) * 100;

export function buildQuote(input: QuoteInput): Quote {
  const now = input.now ?? new Date();
  const s = CHECKOUT_SETTINGS;
  const problems: QuoteProblem[] = [];
  const lines: QuoteLine[] = [];
  const inStockReadyBy = estimateInStockReadyBy(now);

  for (const l of input.lines) {
    const fromStock = Math.min(l.quantity, Math.max(l.freeStock, 0));
    const toSource = l.quantity - fromStock;

    if (toSource > 0 && !l.canSource) {
      problems.push({ code: 'NOT_AVAILABLE', productId: l.productId, requested: l.quantity, available: fromStock });
      continue;
    }

    const make = (qty: number, source: 'STOCK' | 'SOURCED'): QuoteLine => {
      const lineTotalCents = qty * l.unitPriceCents;
      const sourced = source === 'SOURCED' ? estimateSourcedReadyBy(l.sourcingLeadTimeMins, now) : null;
      return {
        productId: l.productId, sku: l.sku, name: l.name, quantity: qty, source,
        unitPriceCents: l.unitPriceCents, lineTotalCents, vatRateBps: l.vatRateBps,
        vatCents: vatPortion(lineTotalCents, l.vatRateBps),
        leadTimeMins: sourced?.leadTimeMins ?? null,
        readyBy: sourced?.readyBy ?? inStockReadyBy,
      };
    };
    // A line can be split: e.g. 2 from the shelf + 1 sourced from a supplier.
    if (fromStock > 0) lines.push(make(fromStock, 'STOCK'));
    if (toSource > 0) lines.push(make(toSource, 'SOURCED'));
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const itemsVat = lines.reduce((sum, l) => sum + l.vatCents, 0);
  const sourcedLines = lines.filter((l) => l.source === 'SOURCED');
  const hasSourcedItems = sourcedLines.length > 0;
  const sourcedValueCents = sourcedLines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  // Delivery fee
  let deliveryFeeCents = 0;
  if (input.deliveryMethod === 'STANDARD' || input.deliveryMethod === 'EXPRESS') {
    if (!input.zone) {
      problems.push({ code: 'ZONE_REQUIRED' });
    } else {
      const base = subtotalCents >= s.freeDeliveryThresholdCents ? 0 : input.zone.customerFeeCents;
      deliveryFeeCents = base + (input.deliveryMethod === 'EXPRESS' ? input.zone.expressSurchargeCents : 0);
    }
  }

  const vatCents = itemsVat + vatPortion(deliveryFeeCents, s.deliveryVatRateBps);
  const totalCents = subtotalCents + deliveryFeeCents;

  // Payment plan rules
  const depositAllowed = hasSourcedItems && sourcedValueCents >= s.depositMinSourcedValueCents;
  const isDelivery = input.deliveryMethod === 'STANDARD' || input.deliveryMethod === 'EXPRESS';
  const codAllowed = !hasSourcedItems && totalCents <= s.codMaxOrderCents && isDelivery;

  let depositRequiredCents = totalCents;
  if (input.paymentPlan === 'DEPOSIT') {
    if (!depositAllowed) {
      problems.push({ code: 'DEPOSIT_NOT_ALLOWED', reason: `Deposits are only for sourced parts worth at least KES ${s.depositMinSourcedValueCents / 100}` });
    }
    depositRequiredCents = Math.min(totalCents, roundUpToShilling((totalCents * s.depositPercentBps) / 10_000));
  } else if (input.paymentPlan === 'COD') {
    if (!codAllowed) {
      problems.push({ code: 'COD_NOT_ALLOWED', reason: `Cash on delivery is only for in-stock delivery orders up to KES ${s.codMaxOrderCents / 100}` });
    }
    depositRequiredCents = 0;
  }

  const sourcedReadyBy = hasSourcedItems ? new Date(Math.max(...sourcedLines.map((l) => l.readyBy.getTime()))) : null;
  const stockReady = lines.some((l) => l.source === 'STOCK') ? inStockReadyBy : null;
  const promisedBy = sourcedReadyBy ?? stockReady;

  return {
    lines,
    subtotalCents,
    deliveryFeeCents,
    vatCents,
    totalCents,
    hasSourcedItems,
    sourcedValueCents,
    depositAllowed,
    depositRequiredCents,
    codAllowed,
    timelines: { inStockReadyBy: stockReady, sourcedReadyBy },
    promisedBy,
    sourcingNotice: hasSourcedItems
      ? 'Some parts will be sourced for you. By placing this order you accept the estimated sourcing + delivery time shown.'
      : null,
    problems,
  };
}
