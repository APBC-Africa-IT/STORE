import { describe, expect, it } from 'vitest';
import { checkPriceFloor, effectiveRetailPrice, isSaleActive, netOfVat, vatPortion } from '../../src/modules/catalog/pricing.domain';
import { normalizePartNumber, slugify } from '../../src/shared/text';

const base = { retailPriceCents: 10_000, salePriceCents: null, saleStartsAt: null, saleEndsAt: null };

describe('sale price', () => {
  it('uses retail when there is no sale', () => {
    expect(effectiveRetailPrice(base)).toBe(10_000);
  });
  it('uses the sale price inside the window only', () => {
    const p = { ...base, salePriceCents: 8_000, saleStartsAt: new Date('2026-01-01'), saleEndsAt: new Date('2026-01-31') };
    expect(isSaleActive(p, new Date('2026-01-15'))).toBe(true);
    expect(effectiveRetailPrice(p, new Date('2026-01-15'))).toBe(8_000);
    expect(effectiveRetailPrice(p, new Date('2026-02-01'))).toBe(10_000);
  });
});

describe('VAT (16%, prices include VAT)', () => {
  it('extracts VAT from a gross price', () => {
    expect(vatPortion(11_600, 1600)).toBe(1_600);
    expect(netOfVat(11_600, 1600)).toBe(10_000);
  });
});

describe('price floor (BR-004)', () => {
  it('blocks a price below cost', () => {
    expect(checkPriceFloor({ sellingPriceCents: 11_000, vatRateBps: 1600, costCents: 10_000 })).toBe('BLOCK_BELOW_COST');
  });
  it('warns below the 15% margin floor', () => {
    // net 10_000, cost 9_000 → 10% margin
    expect(checkPriceFloor({ sellingPriceCents: 11_600, vatRateBps: 1600, costCents: 9_000 })).toBe('WARN_BELOW_MARGIN');
  });
  it('accepts a healthy margin', () => {
    expect(checkPriceFloor({ sellingPriceCents: 11_600, vatRateBps: 1600, costCents: 6_000 })).toBe('OK');
  });
  it('is OK when cost is unknown', () => {
    expect(checkPriceFloor({ sellingPriceCents: 100, vatRateBps: 1600, costCents: null })).toBe('OK');
  });
});

describe('text helpers', () => {
  it('slugifies names', () => {
    expect(slugify('Front Brake Pad Set — Toyota Corolla')).toBe('front-brake-pad-set-toyota-corolla');
  });
  it('normalises part numbers', () => {
    expect(normalizePartNumber('04465-02220')).toBe('0446502220');
    expect(normalizePartNumber('p 83 152')).toBe('P83152');
  });
});
