// Pure availability rules (SRS §2.5). The customer NEVER sees a dead-end "Out of stock".

import {
  addBusinessMinutes, DEFAULT_BUSINESS_HOURS, formatReadyBy, isAfterCutoff, nextBusinessDayOpen, type BusinessHours,
} from '../../shared/time/business-time';

export type AvailabilityStatus = 'AVAILABLE' | 'LOW_STOCK' | 'AVAILABLE_TO_ORDER' | 'PRE_ORDER' | 'RARE_PART_REQUEST';

export type Availability =
  | { status: 'AVAILABLE'; label: string }
  | { status: 'LOW_STOCK'; label: string; quantityLeft: number }
  | { status: 'AVAILABLE_TO_ORDER'; label: string; leadTimeMins: number; readyBy: string }
  | { status: 'PRE_ORDER'; label: string; expectedAt: string }
  | { status: 'RARE_PART_REQUEST'; label: string };

export type AvailabilityInput = {
  available: number; // on_hand - reserved across sellable locations
  lowStockThreshold: number;
  isSourceable: boolean;
  hasSourcingCandidate: boolean; // a supplier can supply it (supplier step makes this smarter)
  sourcingLeadTimeMins: number | null;
  expectedRestockAt?: Date | null; // open restock PO (procurement step)
};

export type AvailabilitySettings = {
  defaultSourcingMins: number;
  hubProcessingMins: number;
  sameDayCutoff: string; // "14:00"
  hours: BusinessHours;
};

export const DEFAULT_AVAILABILITY_SETTINGS: AvailabilitySettings = {
  defaultSourcingMins: 180,
  hubProcessingMins: 45,
  sameDayCutoff: '14:00',
  hours: DEFAULT_BUSINESS_HOURS,
};

export function computeAvailability(
  input: AvailabilityInput,
  now = new Date(),
  settings: AvailabilitySettings = DEFAULT_AVAILABILITY_SETTINGS,
): Availability {
  if (input.available > input.lowStockThreshold) {
    return { status: 'AVAILABLE', label: 'Available — Order Now' };
  }
  if (input.available >= 1) {
    return { status: 'LOW_STOCK', label: `Low Stock — Only ${input.available} left`, quantityLeft: input.available };
  }
  if (input.expectedRestockAt) {
    return { status: 'PRE_ORDER', label: `Pre-Order — Expected ${formatReadyBy(input.expectedRestockAt, now)}`, expectedAt: input.expectedRestockAt.toISOString() };
  }
  if (input.isSourceable && input.hasSourcingCandidate) {
    const { leadTimeMins, readyBy } = estimateSourcedReadyBy(input.sourcingLeadTimeMins, now, settings);
    return {
      status: 'AVAILABLE_TO_ORDER',
      label: `Available to Order — Ready ${formatReadyBy(readyBy, now)}`,
      leadTimeMins,
      readyBy: readyBy.toISOString(),
    };
  }
  return { status: 'RARE_PART_REQUEST', label: 'Rare Part — Submit a Request' };
}

/** When a part we must source from a supplier will be packed and ready (respects the same-day cut-off). */
export function estimateSourcedReadyBy(
  sourcingLeadTimeMins: number | null,
  now = new Date(),
  settings: AvailabilitySettings = DEFAULT_AVAILABILITY_SETTINGS,
) {
  const leadTimeMins = (sourcingLeadTimeMins ?? settings.defaultSourcingMins) + settings.hubProcessingMins;
  // After the same-day cut-off, sourcing starts at the next business opening.
  const start = isAfterCutoff(now, settings.sameDayCutoff) ? nextBusinessDayOpen(now, settings.hours) : now;
  return { leadTimeMins, readyBy: addBusinessMinutes(start, leadTimeMins, settings.hours) };
}

/** When an in-stock part will be picked, packed and ready. */
export function estimateInStockReadyBy(now = new Date(), settings: AvailabilitySettings = DEFAULT_AVAILABILITY_SETTINGS) {
  return addBusinessMinutes(now, settings.hubProcessingMins, settings.hours);
}
