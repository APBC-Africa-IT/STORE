import { describe, expect, it } from 'vitest';
import { orderMargin, routeAfterConfirm } from '../../src/modules/orders/order.domain';
import { orderMachine } from '../../src/modules/orders/order.machine';

describe('routing after confirmation', () => {
  it('all in stock → picking', () => {
    expect(routeAfterConfirm([{ source: 'STOCK', sourcingStatus: 'NOT_REQUIRED' }])).toBe('PICKING');
  });
  it('anything still with a supplier → sourcing', () => {
    expect(routeAfterConfirm([{ source: 'STOCK', sourcingStatus: 'NOT_REQUIRED' }, { source: 'SOURCED', sourcingStatus: 'PO_SENT' }])).toBe('SOURCING');
  });
  it('sourced parts already received → picking', () => {
    expect(routeAfterConfirm([{ source: 'SOURCED', sourcingStatus: 'RECEIVED' }])).toBe('PICKING');
  });
});

describe('order state machine', () => {
  it('allows the normal flow and blocks shortcuts', () => {
    expect(orderMachine.canTransition('PICKING', 'PACKED')).toBe(true);
    expect(orderMachine.canTransition('PENDING_PAYMENT', 'PACKED')).toBe(false);
    expect(orderMachine.canTransition('DISPATCHED', 'CANCELLED')).toBe(false); // must go through returns
    expect(() => orderMachine.assertTransition('COMPLETED', 'PICKING')).toThrow(/cannot go from COMPLETED to PICKING/);
  });
});

describe('order margin', () => {
  it('is computed on ex-VAT revenue', () => {
    const m = orderMargin([{ quantity: 2, lineTotalCents: 11_600, vatCents: 1_600, unitCostCents: 3_000 }]);
    expect(m).toEqual({ netRevenueCents: 10_000, costCents: 6_000, marginCents: 4_000, marginBps: 4_000 });
  });
  it('is unknown until every line has a cost', () => {
    expect(orderMargin([{ quantity: 1, lineTotalCents: 100, vatCents: 14, unitCostCents: null }])).toBeNull();
  });
});
