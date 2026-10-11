/**
 * Finance service — double-entry ledger posting.
 * Consumes domain events and posts balanced journal entries.
 * Every function is idempotent via JournalEntry.idempotencyKey.
 *
 * Chart of accounts (seeded):
 *   1000  Cash — Till          (Asset)
 *   1010  M-Pesa Clearing       (Asset)
 *   1020  Card Clearing         (Asset)
 *   1030  Bank                  (Asset)
 *   1040  COD Cash in Transit   (Asset)
 *   1100  Accounts Receivable   (Asset)
 *   1200  Inventory             (Asset)
 *   2000  Supplier Payables     (Liability)
 *   2010  Rider Payables        (Liability)
 *   2100  VAT Output            (Liability)
 *   2200  Customer Deposits     (Liability)
 *   4000  Sales Revenue         (Revenue)
 *   4010  Delivery Revenue      (Revenue)
 *   5000  Cost of Goods Sold    (Expense)
 *   5100  Delivery Logistics    (Expense)
 *   5200  Inventory Write-offs  (Expense)
 */
import { prisma } from '../../shared/db/prisma.js';

// ── Account code lookup ───────────────────────────────────────────────────

const ACCOUNTS = {
  CASH_TILL:         '1000',
  MPESA_CLEARING:    '1010',
  CARD_CLEARING:     '1020',
  BANK:              '1030',
  COD_IN_TRANSIT:    '1040',
  AR:                '1100',
  INVENTORY:         '1200',
  SUPPLIER_PAYABLES: '2000',
  RIDER_PAYABLES:    '2010',
  VAT_OUTPUT:        '2100',
  CUSTOMER_DEPOSITS: '2200',
  SALES_REVENUE:     '4000',
  DELIVERY_REVENUE:  '4010',
  COGS:              '5000',
  DELIVERY_LOGISTICS:'5100',
  INVENTORY_WRITEOFF:'5200',
};

async function getAccountId(code, tx = prisma) {
  const acc = await tx.ledgerAccount.findUnique({ where: { code } });
  if (!acc) throw new Error(`Ledger account ${code} not found. Run seed.`);
  return acc.id;
}

/**
 * Post a balanced journal entry. Idempotent via idempotencyKey.
 * @param {{ idempotencyKey:string, description:string, sourceType:string, sourceId:string, channel?:string, lines:Array<{code:string,debit:number,credit:number,partyType?:string,partyId?:string}> }} opts
 * @param {object} tx - Prisma transaction client (optional)
 */
export async function postJournalEntry({ idempotencyKey, description, sourceType, sourceId, channel, lines }, tx = prisma) {
  // Idempotency
  const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey } }).catch(() => null);
  if (existing) return existing;

  // Verify balanced
  const totalDebit  = lines.reduce((s, l) => s + (l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0) {
    throw new Error(`Journal entry not balanced: debit=${totalDebit} credit=${totalCredit} key=${idempotencyKey}`);
  }

  const entry = await tx.journalEntry.create({
    data: {
      idempotencyKey,
      description,
      sourceType,
      sourceId,
      channel: channel || null,
      occurredAt: new Date(),
    },
  });

  for (const line of lines) {
    const accountId = await getAccountId(line.code, tx);
    await tx.journalLine.create({
      data: {
        entryId: entry.id,
        accountId,
        debitCents:  line.debit  || 0,
        creditCents: line.credit || 0,
        partyType: line.partyType || null,
        partyId:   line.partyId   || null,
      },
    });
  }

  return entry;
}

// ── Posting consumers (called by BullMQ finance worker) ──────────────────

/**
 * Post revenue + COGS when order is DELIVERED or COMPLETED.
 * Debit: Customer Deposits (paid part) | Credit: Sales Rev + Delivery Rev + VAT
 * Debit: COGS | Credit: Inventory
 */
export async function postOrderRevenue(orderId, tx = prisma) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  const key = `order.revenue:${orderId}`;
  const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: key } }).catch(() => null);
  if (existing) return;

  // Net sales (excl. VAT)
  const netSales = order.totalCents - order.vatCents - order.deliveryFeeCents;
  const netDelivery = order.deliveryFeeCents; // simplified: no VAT split on delivery for now

  // COGS = sum of unit_cost * qty on all items
  const totalCogs = order.items.reduce((s, i) => s + (i.unitCostCents || 0) * i.quantity, 0);

  // Debit account depends on payment method used
  const debitAccount = order.isCod ? ACCOUNTS.COD_IN_TRANSIT : ACCOUNTS.CUSTOMER_DEPOSITS;

  const lines = [
    { code: debitAccount,           debit: order.totalCents, credit: 0 },
    { code: ACCOUNTS.SALES_REVENUE, debit: 0, credit: netSales },
    { code: ACCOUNTS.DELIVERY_REVENUE, debit: 0, credit: netDelivery },
    { code: ACCOUNTS.VAT_OUTPUT,    debit: 0, credit: order.vatCents },
  ];

  if (totalCogs > 0) {
    lines.push({ code: ACCOUNTS.COGS,      debit: totalCogs, credit: 0 });
    lines.push({ code: ACCOUNTS.INVENTORY, debit: 0, credit: totalCogs });
  }

  await postJournalEntry({
    idempotencyKey: key,
    description: `Revenue recognition — Order ${order.number}`,
    sourceType: 'ORDER',
    sourceId: orderId,
    channel: order.channel,
    lines,
  }, tx);
}

/**
 * Post payment capture (before delivery — money moves to Customer Deposits).
 * Debit: M-Pesa/Cash/Card | Credit: Customer Deposits
 */
export async function postPaymentCaptured(paymentId, tx = prisma) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) return;

  const key = `payment.captured:${paymentId}`;

  const debitCode = {
    MPESA_STK: ACCOUNTS.MPESA_CLEARING,
    MPESA_PAYBILL: ACCOUNTS.MPESA_CLEARING,
    CARD_STRIPE: ACCOUNTS.CARD_CLEARING,
    CARD_POS_TERMINAL: ACCOUNTS.CARD_CLEARING,
    CASH: ACCOUNTS.CASH_TILL,
    BANK_TRANSFER: ACCOUNTS.BANK,
    COD: ACCOUNTS.COD_IN_TRANSIT,
    TRADE_CREDIT: ACCOUNTS.AR,
  }[payment.method] || ACCOUNTS.MPESA_CLEARING;

  await postJournalEntry({
    idempotencyKey: key,
    description: `Payment captured — ${payment.method} ${payment.order?.number || ''}`,
    sourceType: 'PAYMENT',
    sourceId: paymentId,
    channel: payment.order?.channel || null,
    lines: [
      { code: debitCode,                  debit: payment.amountCents, credit: 0 },
      { code: ACCOUNTS.CUSTOMER_DEPOSITS, debit: 0, credit: payment.amountCents },
    ],
  }, tx);
}

/**
 * Post GRN — inventory in, supplier payable + rider payable created.
 * Debit: Inventory | Credit: Supplier Payables + Rider Payables
 */
export async function postGrnLanded(grnId, tx = prisma) {
  const grn = await tx.grn.findUnique({
    where: { id: grnId },
    include: { purchaseOrder: true, lines: { include: { purchaseOrderItem: true } } },
  });
  if (!grn) return;

  const key = `grn.landed:${grnId}`;
  const po = grn.purchaseOrder;

  const totalLandedCost = grn.lines.reduce((s, l) => {
    const poItem = l.purchaseOrderItem;
    const unitCost = poItem?.unitCostCents || 0;
    const landedPerUnit = unitCost; // collection fee allocated separately below
    return s + landedPerUnit * l.acceptedQty;
  }, 0);

  if (totalLandedCost === 0) return;

  await postJournalEntry({
    idempotencyKey: key,
    description: `GRN ${grn.number} — inventory receipt`,
    sourceType: 'GRN',
    sourceId: grnId,
    lines: [
      { code: ACCOUNTS.INVENTORY,         debit: totalLandedCost + po.collectionFeeCents, credit: 0 },
      { code: ACCOUNTS.SUPPLIER_PAYABLES, debit: 0, credit: totalLandedCost, partyType: 'SUPPLIER', partyId: po.supplierId },
      { code: ACCOUNTS.RIDER_PAYABLES,    debit: 0, credit: po.collectionFeeCents },
    ].filter(l => (l.debit || l.credit) > 0),
  }, tx);
}

/**
 * Post COD handover (cash moves from COD in transit to Cash Till).
 */
export async function postCodHandover(codCollectionId, tx = prisma) {
  const cod = await tx.codCollection.findUnique({ where: { id: codCollectionId } });
  if (!cod || !cod.handedOverCents) return;

  const key = `cod.handover:${codCollectionId}`;
  await postJournalEntry({
    idempotencyKey: key,
    description: `COD handover — job ${cod.jobId}`,
    sourceType: 'COD',
    sourceId: codCollectionId,
    lines: [
      { code: ACCOUNTS.CASH_TILL,      debit: cod.handedOverCents, credit: 0 },
      { code: ACCOUNTS.COD_IN_TRANSIT, debit: 0, credit: cod.handedOverCents },
    ],
  }, tx);
}

/**
 * Post rider payout.
 * Debit: Rider Payables | Credit: M-Pesa Clearing
 */
export async function postRiderPayout(payoutId, tx = prisma) {
  const payout = await tx.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return;

  const key = `payout.rider:${payoutId}`;
  await postJournalEntry({
    idempotencyKey: key,
    description: `Rider payout`,
    sourceType: 'PAYOUT',
    sourceId: payoutId,
    lines: [
      { code: ACCOUNTS.RIDER_PAYABLES, debit: payout.amountCents, credit: 0, partyType: 'RIDER', partyId: payout.payeeId },
      { code: ACCOUNTS.MPESA_CLEARING, debit: 0, credit: payout.amountCents },
    ],
  }, tx);
}

/**
 * Post stock write-off (adjustment).
 * Debit: Inventory Write-offs | Credit: Inventory
 */
export async function postStockWriteOff(adjustmentId, amountCents, tx = prisma) {
  const key = `adjustment.writeoff:${adjustmentId}`;
  await postJournalEntry({
    idempotencyKey: key,
    description: `Stock write-off`,
    sourceType: 'ADJUSTMENT',
    sourceId: adjustmentId,
    lines: [
      { code: ACCOUNTS.INVENTORY_WRITEOFF, debit: amountCents, credit: 0 },
      { code: ACCOUNTS.INVENTORY,          debit: 0, credit: amountCents },
    ],
  }, tx);
}

// ── Reporting queries ─────────────────────────────────────────────────────

export async function getRevenueReport({ from, to, channel }) {
  const where = {
    sourceType: 'ORDER',
    occurredAt: { gte: from, lte: to },
  };
  if (channel) where.channel = channel;

  const entries = await prisma.journalEntry.findMany({
    where,
    include: { lines: { include: { account: true } } },
  });

  let totalRevenue = 0, totalDelivery = 0, totalVat = 0, totalCogs = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      if (l.account.code === ACCOUNTS.SALES_REVENUE)    totalRevenue  += l.creditCents;
      if (l.account.code === ACCOUNTS.DELIVERY_REVENUE) totalDelivery += l.creditCents;
      if (l.account.code === ACCOUNTS.VAT_OUTPUT)       totalVat      += l.creditCents;
      if (l.account.code === ACCOUNTS.COGS)             totalCogs     += l.debitCents;
    }
  }

  return {
    totalRevenueCents: totalRevenue,
    totalDeliveryCents: totalDelivery,
    totalVatCents: totalVat,
    totalCogsCents: totalCogs,
    grossMarginCents: totalRevenue - totalCogs,
    marginBps: totalRevenue > 0 ? Math.round((totalRevenue - totalCogs) / totalRevenue * 10000) : 0,
  };
}

export async function getVatReport({ from, to }) {
  const lines = await prisma.journalLine.findMany({
    where: {
      account: { code: ACCOUNTS.VAT_OUTPUT },
      entry: { occurredAt: { gte: from, lte: to } },
    },
    include: { entry: true },
  });
  const total = lines.reduce((s, l) => s + l.creditCents, 0);
  return { vatOutputCents: total, entries: lines.length };
}

export async function getSupplierPayablesReport() {
  const lines = await prisma.journalLine.findMany({
    where: { account: { code: ACCOUNTS.SUPPLIER_PAYABLES } },
    include: { entry: true },
  });

  const bySupplier = {};
  for (const l of lines) {
    const sid = l.partyId || 'unknown';
    bySupplier[sid] = (bySupplier[sid] || 0) + l.creditCents - l.debitCents;
  }
  return Object.entries(bySupplier).map(([supplierId, balanceCents]) => ({ supplierId, balanceCents }));
}
