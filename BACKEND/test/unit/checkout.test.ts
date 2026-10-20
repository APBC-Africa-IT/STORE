import { describe, expect, it } from 'vitest';
import { buildQuote, type QuoteLineInput } from '../../src/modules/orders/checkout.domain';

const now = new Date('2026-10-20T10:00:00+03:00'); // Tuesday 10 AM EAT
const zone = { id: 'z1', customerFeeCents: 300_00, expressSurchargeCents: 200_00 };
const line = (o: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
  productId: 'p1', sku: 'SKU', name: 'Part', quantity: 1, unitPriceCents: 1_160_00, vatRateBps: 1600,
  freeStock: 10, canSource: true, sourcingLeadTimeMins: 120, ...o,
});

describe('buildQuote', () => {
  it('splits a line into stock + sourced when there is not enough on the shelf', () => {
    const q = buildQuote({ now, lines: [line({ quantity: 3, freeStock: 2 })], deliveryMethod: 'CLICK_AND_COLLECT', zone: null, paymentPlan: 'FULL' });
    expect(q.lines.map((l) => [l.source, l.quantity])).toEqual([['STOCK', 2], ['SOURCED', 1]]);
    expect(q.hasSourcedItems).toBe(true);
    expect(q.timelines.sourcedReadyBy!.getTime()).toBeGreaterThan(q.timelines.inStockReadyBy!.getTime());
  });

  it('refuses parts nobody can supply', () => {
    const q = buildQuote({ now, lines: [line({ quantity: 2, freeStock: 1, canSource: false })], deliveryMethod: 'CLICK_AND_COLLECT', zone: null, paymentPlan: 'FULL' });
    expect(q.problems).toEqual([{ code: 'NOT_AVAILABLE', productId: 'p1', requested: 2, available: 1 }]);
  });

  it('computes VAT on items and delivery (prices include VAT)', () => {
    const q = buildQuote({ now, lines: [line()], deliveryMethod: 'STANDARD', zone, paymentPlan: 'FULL' });
    expect(q.subtotalCents).toBe(1_160_00);
    expect(q.deliveryFeeCents).toBe(300_00);
    expect(q.totalCents).toBe(1_460_00);
    expect(q.vatCents).toBe(160_00 + 41_38); // 16/116 of 1,160 + 16/116 of 300
  });

  it('gives free standard delivery above KES 10,000 but still charges the express surcharge', () => {
    const big = line({ unitPriceCents: 6_000_00, quantity: 2 });
    expect(buildQuote({ now, lines: [big], deliveryMethod: 'STANDARD', zone, paymentPlan: 'FULL' }).deliveryFeeCents).toBe(0);
    expect(buildQuote({ now, lines: [big], deliveryMethod: 'EXPRESS', zone, paymentPlan: 'FULL' }).deliveryFeeCents).toBe(200_00);
  });

  it('requires a zone for delivery', () => {
    const q = buildQuote({ now, lines: [line()], deliveryMethod: 'STANDARD', zone: null, paymentPlan: 'FULL' });
    expect(q.problems).toContainEqual({ code: 'ZONE_REQUIRED' });
  });

  it('allows a 30% deposit only for expensive sourced parts (rounded up to the shilling)', () => {
    const sourced = line({ freeStock: 0, unitPriceCents: 7_777_77 });
    const q = buildQuote({ now, lines: [sourced], deliveryMethod: 'CLICK_AND_COLLECT', zone: null, paymentPlan: 'DEPOSIT' });
    expect(q.problems).toEqual([]);
    expect(q.depositRequiredCents).toBe(2_334_00); // 30% of 7,777.77 = 2,333.33 → 2,334

    const cheap = buildQuote({ now, lines: [line({ freeStock: 0 })], deliveryMethod: 'CLICK_AND_COLLECT', zone: null, paymentPlan: 'DEPOSIT' });
    expect(cheap.problems[0]?.code).toBe('DEPOSIT_NOT_ALLOWED');
  });

  it('allows cash on delivery only for in-stock delivery orders', () => {
    expect(buildQuote({ now, lines: [line()], deliveryMethod: 'STANDARD', zone, paymentPlan: 'COD' }).problems).toEqual([]);
    const sourced = buildQuote({ now, lines: [line({ freeStock: 0 })], deliveryMethod: 'STANDARD', zone, paymentPlan: 'COD' });
    expect(sourced.problems[0]?.code).toBe('COD_NOT_ALLOWED');
  });
});
