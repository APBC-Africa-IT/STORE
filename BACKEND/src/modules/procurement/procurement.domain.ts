// Pure procurement rules: PO status machine, supplier ranking, landed cost, average cost.

import type { PurchaseOrderStatus, SupplierAvailability, SupplierType } from '@prisma/client';
import { defineMachine } from '../../shared/state-machine/state-machine';

export const poMachine = defineMachine<PurchaseOrderStatus>('Purchase order', {
  DRAFT: ['SENT', 'PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SENT', 'CANCELLED'],
  SENT: ['CONFIRMED_BY_SUPPLIER', 'PARTIALLY_CONFIRMED', 'REJECTED_BY_SUPPLIER', 'CANCELLED'],
  CONFIRMED_BY_SUPPLIER: ['RIDER_ASSIGNED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_CONFIRMED: ['RIDER_ASSIGNED', 'RECEIVED', 'CANCELLED'],
  RIDER_ASSIGNED: ['COLLECTED', 'CONFIRMED_BY_SUPPLIER', 'RECEIVED'],
  COLLECTED: ['RECEIVED'],
  REJECTED_BY_SUPPLIER: [],
  RECEIVED: [],
  CANCELLED: [],
});

/** POs that can still receive goods. */
export const RECEIVABLE_PO_STATUSES: PurchaseOrderStatus[] = ['CONFIRMED_BY_SUPPLIER', 'PARTIALLY_CONFIRMED', 'RIDER_ASSIGNED', 'COLLECTED'];

export type Candidate = {
  supplierId: string;
  supplierType: SupplierType;
  availability: SupplierAvailability;
  costCents: number;
  leadTimeMins: number;
};

const TYPE_RANK: Record<SupplierType, number> = { PRIMARY: 0, SECONDARY: 1, SPECIALIST: 2 };
const AVAILABILITY_RANK: Record<SupplierAvailability, number> = { IN_STOCK: 0, LOW: 1, UNKNOWN: 2, OUT: 9 };

/** Best supplier first: primary > in stock > cheapest > fastest. Suppliers marked OUT are dropped. */
export function rankCandidates<T extends Candidate>(candidates: T[]): T[] {
  return candidates
    .filter((c) => c.availability !== 'OUT')
    .sort(
      (a, b) =>
        TYPE_RANK[a.supplierType] - TYPE_RANK[b.supplierType] ||
        AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability] ||
        a.costCents - b.costCents ||
        a.leadTimeMins - b.leadTimeMins,
    );
}

/**
 * Landed cost = supplier price + a fair share of the extra costs (boda boda collection, duties…).
 * Extras are shared by line value. Rounded so the shares add up exactly to the extras.
 */
export function landedUnitCosts(lines: Array<{ unitCostCents: number; acceptedQty: number }>, extraCents: number): number[] {
  const totalValue = lines.reduce((s, l) => s + l.unitCostCents * l.acceptedQty, 0);
  if (extraCents === 0 || totalValue === 0) return lines.map((l) => l.unitCostCents);
  let allocated = 0;
  return lines.map((l, i) => {
    if (l.acceptedQty === 0) return l.unitCostCents;
    const isLast = i === lines.length - 1 || lines.slice(i + 1).every((x) => x.acceptedQty === 0);
    const share = isLast ? extraCents - allocated : Math.round((extraCents * l.unitCostCents * l.acceptedQty) / totalValue);
    allocated += share;
    return l.unitCostCents + Math.round(share / l.acceptedQty);
  });
}

/** Weighted average cost after receiving `qty` units at `unitCost` on top of `onHandBefore` units at `avgBefore`. */
export function weightedAverageCost(onHandBefore: number, avgBefore: number | null, qty: number, unitCost: number): number {
  if (onHandBefore <= 0 || avgBefore == null) return unitCost;
  return Math.round((avgBefore * onHandBefore + unitCost * qty) / (onHandBefore + qty));
}
