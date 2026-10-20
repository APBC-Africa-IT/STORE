import { describe, expect, it } from 'vitest';
import { computeAvailability } from '../../src/modules/inventory/availability.domain';
import { addBusinessMinutes, formatReadyBy, isAfterCutoff } from '../../src/shared/time/business-time';

// Times are written in EAT (UTC+3). 2026-10-20 is a Tuesday.
const eat = (iso: string) => new Date(`${iso}+03:00`);

const base = { lowStockThreshold: 3, isSourceable: true, hasSourcingCandidate: true, sourcingLeadTimeMins: 120 };

describe('availability status (SRS §2.5)', () => {
  it('AVAILABLE above the low-stock threshold', () => {
    expect(computeAvailability({ ...base, available: 10 }).status).toBe('AVAILABLE');
  });

  it('LOW_STOCK for 1–3 units, with the count', () => {
    const a = computeAvailability({ ...base, available: 2 });
    expect(a).toMatchObject({ status: 'LOW_STOCK', quantityLeft: 2, label: 'Low Stock — Only 2 left' });
  });

  it('AVAILABLE_TO_ORDER when out of stock but sourceable (never a dead end)', () => {
    const a = computeAvailability({ ...base, available: 0 }, eat('2026-10-20T10:00:00'));
    expect(a.status).toBe('AVAILABLE_TO_ORDER');
    if (a.status !== 'AVAILABLE_TO_ORDER') return;
    expect(a.leadTimeMins).toBe(165); // 120 sourcing + 45 hub processing
    expect(a.readyBy).toBe(eat('2026-10-20T12:45:00').toISOString());
    expect(a.label).toBe('Available to Order — Ready today by 12:45 PM');
  });

  it('after the 2 PM cut-off, sourcing starts next business morning', () => {
    const a = computeAvailability({ ...base, available: 0 }, eat('2026-10-20T15:00:00'));
    expect(a.label).toBe('Available to Order — Ready tomorrow by 10:45 AM');
  });

  it('skips Sunday (closed)', () => {
    const a = computeAvailability({ ...base, available: 0 }, eat('2026-10-24T17:00:00')); // Saturday evening
    expect(a.label).toBe('Available to Order — Ready Mon by 10:45 AM');
  });

  it('RARE_PART_REQUEST when nobody can supply it', () => {
    expect(computeAvailability({ ...base, available: 0, isSourceable: false }).status).toBe('RARE_PART_REQUEST');
  });

  it('PRE_ORDER when a restock is on the way', () => {
    const a = computeAvailability({ ...base, available: 0, expectedRestockAt: eat('2026-10-22T12:00:00') }, eat('2026-10-20T10:00:00'));
    expect(a.status).toBe('PRE_ORDER');
  });
});

describe('business time (EAT, Mon–Sat 08:00–18:00)', () => {
  it('rolls work past closing into the next morning', () => {
    // 13:00 + 345 working minutes = 18:00 (300 min) + 45 min next day → Wed 08:45
    expect(addBusinessMinutes(eat('2026-10-20T13:00:00'), 345)).toEqual(eat('2026-10-21T08:45:00'));
  });

  it('starts at opening time when called before opening', () => {
    expect(addBusinessMinutes(eat('2026-10-20T06:00:00'), 30)).toEqual(eat('2026-10-20T08:30:00'));
  });

  it('detects the cut-off', () => {
    expect(isAfterCutoff(eat('2026-10-20T13:59:00'), '14:00')).toBe(false);
    expect(isAfterCutoff(eat('2026-10-20T14:00:00'), '14:00')).toBe(true);
  });

  it('formats relative days', () => {
    const now = eat('2026-10-20T09:00:00');
    expect(formatReadyBy(eat('2026-10-20T16:30:00'), now)).toBe('today by 4:30 PM');
    expect(formatReadyBy(eat('2026-10-21T09:00:00'), now)).toBe('tomorrow by 9:00 AM');
  });
});
