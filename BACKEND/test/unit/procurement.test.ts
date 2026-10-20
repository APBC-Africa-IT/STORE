import { describe, expect, it } from 'vitest';
import { landedUnitCosts, poMachine, rankCandidates, weightedAverageCost } from '../../src/modules/procurement/procurement.domain';

describe('supplier ranking', () => {
  it('primary first, then in stock, then cheapest; drops suppliers who are out', () => {
    const ranked = rankCandidates([
      { supplierId: 'cheap-secondary', supplierType: 'SECONDARY', availability: 'IN_STOCK', costCents: 100, leadTimeMins: 60 },
      { supplierId: 'primary-low', supplierType: 'PRIMARY', availability: 'LOW', costCents: 300, leadTimeMins: 60 },
      { supplierId: 'primary-in', supplierType: 'PRIMARY', availability: 'IN_STOCK', costCents: 500, leadTimeMins: 60 },
      { supplierId: 'primary-out', supplierType: 'PRIMARY', availability: 'OUT', costCents: 1, leadTimeMins: 1 },
    ]);
    expect(ranked.map((c) => c.supplierId)).toEqual(['primary-in', 'primary-low', 'cheap-secondary']);
  });
});

describe('landed cost', () => {
  it('shares the boda boda fee by line value and adds up exactly', () => {
    const costs = landedUnitCosts([{ unitCostCents: 3_000, acceptedQty: 2 }, { unitCostCents: 4_000, acceptedQty: 1 }], 1_000);
    // values 6,000 + 4,000 → extras 600 + 400 → per unit +300 and +400
    expect(costs).toEqual([3_300, 4_400]);
  });
  it('ignores rejected-only lines', () => {
    expect(landedUnitCosts([{ unitCostCents: 3_000, acceptedQty: 0 }, { unitCostCents: 2_000, acceptedQty: 2 }], 200)).toEqual([3_000, 2_100]);
  });
});

describe('weighted average cost', () => {
  it('blends old and new stock', () => {
    expect(weightedAverageCost(10, 1_000, 10, 2_000)).toBe(1_500);
  });
  it('uses the new cost when the shelf was empty', () => {
    expect(weightedAverageCost(0, 1_000, 5, 2_000)).toBe(2_000);
  });
});

describe('PO state machine', () => {
  it('cannot receive goods before the supplier confirms', () => {
    expect(poMachine.canTransition('SENT', 'RECEIVED')).toBe(false);
    expect(poMachine.canTransition('CONFIRMED_BY_SUPPLIER', 'RECEIVED')).toBe(true);
  });
});
