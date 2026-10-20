import { describe, expect, it } from 'vitest';
import { codOutcome, jobMachine, last4, riderFeeFor } from '../../src/modules/logistics/logistics.domain';

describe('job state machine', () => {
  it('a rider must be assigned and leave before anything is delivered', () => {
    expect(jobMachine.canTransition('CREATED', 'DELIVERED')).toBe(false);
    expect(jobMachine.canTransition('ASSIGNED', 'DELIVERED')).toBe(false);
    expect(jobMachine.canTransition('EN_ROUTE', 'DELIVERED')).toBe(true);
  });
  it('a trip in progress cannot be cancelled — it either succeeds or fails', () => {
    expect(jobMachine.canTransition('EN_ROUTE', 'CANCELLED')).toBe(false);
    expect(jobMachine.canTransition('FAILED', 'RETURNED')).toBe(true);
  });
});

describe('rider fee', () => {
  const zones = [{ name: 'Westlands', riderFeeCents: 200_00 }, { name: 'Karen', riderFeeCents: 350_00 }];
  it('uses the zone with the same name (any case)', () => {
    expect(riderFeeFor(' karen ', zones, 150_00)).toBe(350_00);
  });
  it('falls back to the default fee', () => {
    expect(riderFeeFor('Industrial Area', zones, 150_00)).toBe(150_00);
  });
});

describe('COD count', () => {
  it('matches or reports the shortfall', () => {
    expect(codOutcome(5_000_00, 5_000_00)).toEqual({ status: 'RECONCILED', shortCents: 0 });
    expect(codOutcome(5_000_00, 4_500_00)).toEqual({ status: 'DISCREPANCY', shortCents: 500_00 });
  });
});

it('shows only the last 4 digits of an ID', () => {
  expect(last4('12 345 678')).toBe('5678');
});
