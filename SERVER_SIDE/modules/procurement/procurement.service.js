/**
 * Procurement service — suppliers, purchase orders, sourcing queue, collection codes, GRNs.
 * §8.6 of the backend guide.
 */
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { recordAudit } from '../audit/audit.service.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { generatePoNumber, generateGrnNumber } from '../../shared/ids/index.js';
import { generateCollectionCode, hashCollectionCode } from '../../shared/crypto/index.js';
import { computeAvailability } from '../catalog/availability.domain.js';
import { computeLandedCostPerUnit, updateWeightedAvgCost } from '../pricing/pricing.domain.js';
import { postGrnLanded } from '../finance/finance.service.js';

// ── Supplier CRUD ─────────────────────────────────────────────────────────

export async function listSuppliers({ status, type, q, page = 1, pageSize = 25 }) {
  const where = {};
  if (status) where.status = status;
  if (type)   where.type   = type;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: { contacts: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supplier.count({ where }),
  ]);
  return { suppliers, total, page, pageSize };
}

export async function getSupplier(id) {
  const s = await prisma.supplier.findUnique({ where: { id }, include: { contacts: true } });
  if (!s) throw new AppError('NOT_FOUND', 'Supplier not found');
  // Never expose payout details (encrypted) in API — strip them
  const { payoutDetailsEnc, ...safe } = s;
  return safe;
}

export async function createSupplier(data, actor) {
  const { generateSupplierCode } = await import('../../shared/ids/index.js');
  const code = await generateSupplierCode();
  const supplier = await prisma.$transaction(async tx => {
    const s = await tx.supplier.create({ data: { ...data, code } });
    await recordAudit({ actor, action: 'supplier.created', entityType: 'supplier', entityId: s.id, after: { name: s.name, code: s.code } }, tx);
    return s;
  });
  const { payoutDetailsEnc, ...safe } = supplier;
  return safe;
}

export async function updateSupplier(id, data, actor) {
  const supplier = await prisma.$transaction(async tx => {
    const s = await tx.supplier.update({ where: { id }, data });
    await recordAudit({ actor, action: 'supplier.updated', entityType: 'supplier', entityId: id, after: data }, tx);
    return s;
  });
  const { payoutDetailsEnc, ...safe } = supplier;
  return safe;
}

export async function suspendSupplier(id, reason, actor) {
  await prisma.$transaction(async tx => {
    await tx.supplier.update({ where: { id }, data: { status: 'SUSPENDED', statusReason: reason } });
    await recordAudit({ actor, action: 'supplier.suspended', entityType: 'supplier', entityId: id, after: { reason } }, tx);
  });
}

export async function blacklistSupplier(id, reason, actor) {
  await prisma.$transaction(async tx => {
    await tx.supplier.update({ where: { id }, data: { status: 'BLACKLISTED', statusReason: reason } });
    await recordAudit({ actor, action: 'supplier.blacklisted', entityType: 'supplier', entityId: id, after: { reason } }, tx);
  });
}

export async function reactivateSupplier(id, actor) {
  await prisma.$transaction(async tx => {
    await tx.supplier.update({ where: { id }, data: { status: 'ACTIVE', statusReason: null } });
    await recordAudit({ actor, action: 'supplier.reactivated', entityType: 'supplier', entityId: id }, tx);
  });
}

// ── Supplier catalogue / price lists ─────────────────────────────────────

export async function getSupplierCatalogue(supplierId, { q, page = 1, pageSize = 50 }) {
  const where = { supplierId };
  if (q) where.OR = [
    { description: { contains: q, mode: 'insensitive' } },
    { partNumberNorm: { contains: q, mode: 'insensitive' } },
  ];
  const [items, total] = await Promise.all([
    prisma.supplierCatalogItem.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' } }),
    prisma.supplierCatalogItem.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function approveCatalogPrice(itemId, actor) {
  const item = await prisma.supplierCatalogItem.findUnique({ where: { id: itemId } });
  if (!item || !item.pendingCostCents) throw new AppError('NOT_FOUND', 'No pending price to approve');

  await prisma.$transaction(async tx => {
    await tx.supplierCatalogItem.update({
      where: { id: itemId },
      data: { costCents: item.pendingCostCents, pendingCostCents: null, lastConfirmedAt: new Date() },
    });
    await recordAudit({ actor, action: 'supplier_price.approved', entityType: 'supplier_catalog_item', entityId: itemId,
      before: { costCents: item.costCents }, after: { costCents: item.pendingCostCents } }, tx);
  });
}

// ── Sourcing queue ─────────────────────────────────────────────────────────

export async function getSourcingQueue() {
  return prisma.orderItem.findMany({
    where: { sourcingStatus: 'AWAITING_PO', source: 'SOURCED' },
    include: { order: true, product: true },
    orderBy: { order: { placedAt: 'asc' } },
  });
}

export async function getSupplierCandidates(orderItemId) {
  const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { product: true } });
  if (!item) throw new AppError('NOT_FOUND', 'Order item not found');

  // Find suppliers with matching catalogue items, ranked per guide §8.6
  const candidates = await prisma.supplierCatalogItem.findMany({
    where: {
      productId: item.productId,
      supplier: { status: 'ACTIVE' },
      costCents: { gt: 0 },
    },
    include: { supplier: { select: { id: true, name: true, code: true, type: true, typicalLeadTimeMins: true, fulfilmentRateBps: true, avgResponseMins: true, qualityPassRateBps: true } } },
    orderBy: [
      { supplier: { type: 'asc' } }, // PRIMARY first
      { costCents: 'asc' },
    ],
  });

  // Sort: type (PRIMARY > SECONDARY > SPECIALIST), then availability (IN_STOCK > LOW > UNKNOWN), then cost asc
  const typeOrder = { PRIMARY: 0, SECONDARY: 1, SPECIALIST: 2 };
  const availOrder = { IN_STOCK: 0, LOW: 1, UNKNOWN: 2, OUT: 3 };

  return candidates.sort((a, b) => {
    const tA = typeOrder[a.supplier.type] ?? 9;
    const tB = typeOrder[b.supplier.type] ?? 9;
    if (tA !== tB) return tA - tB;
    const avA = availOrder[a.availability] ?? 9;
    const avB = availOrder[b.availability] ?? 9;
    if (avA !== avB) return avA - avB;
    return a.costCents - b.costCents;
  });
}

// ── Purchase Orders ───────────────────────────────────────────────────────

export async function listPurchaseOrders({ status, supplierId, orderId, page = 1, pageSize = 25 }) {
  const where = {};
  if (status)     where.status     = status;
  if (supplierId) where.supplierId = supplierId;
  if (orderId)    where.orderId    = orderId;

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { id: true, name: true, code: true } }, items: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { purchaseOrders: pos, total, page, pageSize };
}

export async function getPurchaseOrder(id) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, items: true, grns: true },
  });
  if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found');
  return po;
}

export async function createPurchaseOrder({ supplierId, kind, orderId, items, notes }, actor) {
  // BR-003: reactive POs need an orderId; restock POs stay DRAFT for approval
  const number = await generatePoNumber();
  const status = kind === 'RESTOCK' ? 'PENDING_APPROVAL' : 'DRAFT';

  const totalCostCents = items.reduce((s, i) => s + i.unitCostCents * i.quantity, 0);

  const po = await prisma.$transaction(async tx => {
    const p = await tx.purchaseOrder.create({
      data: {
        number, supplierId, kind, status, orderId: orderId || null,
        totalCostCents, notes: notes || null,
        createdById: actor.userId,
      },
    });
    await tx.purchaseOrderItem.createMany({
      data: items.map(i => ({
        purchaseOrderId: p.id,
        productId: i.productId || null,
        partNumber: i.partNumber,
        description: i.description,
        quantity: i.quantity,
        unitCostCents: i.unitCostCents,
        orderItemId: i.orderItemId || null,
      })),
    });
    await emitOutboxEvent(EVENTS.PO_CREATED, 'purchase_order', p.id, { poId: p.id, supplierId, kind }, tx);
    await recordAudit({ actor, action: 'po.created', entityType: 'purchase_order', entityId: p.id,
      after: { number, supplierId, kind, totalCostCents } }, tx);
    return p;
  });
  return po;
}

export async function sendPurchaseOrder(id, channel, actor) {
  const po = await getPurchaseOrder(id);
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', `PO in status ${po.status} cannot be sent`);
  }
  // BR-003: restock PO requires approval before send
  if (po.kind === 'RESTOCK' && po.status === 'PENDING_APPROVAL' && po.approvedById === null) {
    throw new AppError('APPROVAL_REQUIRED', 'Restock PO requires approval before sending');
  }

  const collectionCode = generateCollectionCode();
  const collectionCodeHash = hashCollectionCode(collectionCode);
  const codeExpiry = new Date(Date.now() + 72 * 3600_000); // 72h

  await prisma.$transaction(async tx => {
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: 'SENT',
        sentVia: channel,
        sentAt: new Date(),
        collectionCodeHash,
        collectionCodeExpiresAt: codeExpiry,
      },
    });
    // Mark linked order items as PO_SENT
    const itemIds = po.items.map(i => i.orderItemId).filter(Boolean);
    if (itemIds.length > 0) {
      await tx.orderItem.updateMany({ where: { id: { in: itemIds } }, data: { sourcingStatus: 'PO_SENT' } });
    }
    await emitOutboxEvent(EVENTS.PO_SENT, 'purchase_order', id, { poId: id, channel, collectionCode }, tx);
    await recordAudit({ actor, action: 'po.sent', entityType: 'purchase_order', entityId: id, after: { channel } }, tx);
  });

  return { collectionCode }; // Caller sends this to the supplier and rider
}

export async function logSupplierResponse(id, { response, confirmedQty, supplierReadyAt, rejectionReason, notes }, actor) {
  const po = await getPurchaseOrder(id);
  if (po.status !== 'SENT') throw new AppError('INVALID_STATE_TRANSITION', `PO is not in SENT status`);

  const newStatus = {
    CONFIRM:  'CONFIRMED_BY_SUPPLIER',
    PARTIAL:  'PARTIALLY_CONFIRMED',
    REJECT:   'REJECTED_BY_SUPPLIER',
  }[response];
  if (!newStatus) throw new AppError('VALIDATION_FAILED', 'response must be CONFIRM, PARTIAL, or REJECT');

  await prisma.$transaction(async tx => {
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        confirmedAt: new Date(),
        supplierReadyAt: supplierReadyAt ? new Date(supplierReadyAt) : null,
        rejectionReason: rejectionReason || null,
        notes: notes || po.notes,
      },
    });
    // Update order item sourcing statuses
    const itemIds = po.items.map(i => i.orderItemId).filter(Boolean);
    if (itemIds.length > 0) {
      const sourcingStatus = newStatus === 'CONFIRMED_BY_SUPPLIER' ? 'SUPPLIER_CONFIRMED' : 'AWAITING_PO';
      await tx.orderItem.updateMany({ where: { id: { in: itemIds } }, data: { sourcingStatus } });
    }
    const eventKey = response === 'REJECT' ? EVENTS.PO_REJECTED : EVENTS.PO_CONFIRMED;
    await emitOutboxEvent(eventKey, 'purchase_order', id, { poId: id, status: newStatus }, tx);
    await recordAudit({ actor, action: 'po.supplier_response', entityType: 'purchase_order', entityId: id,
      after: { response, newStatus } }, tx);
  });
}

export async function approveRestockPo(id, actor) {
  const po = await getPurchaseOrder(id);
  if (po.status !== 'PENDING_APPROVAL') throw new AppError('INVALID_STATE_TRANSITION', 'PO not awaiting approval');

  await prisma.$transaction(async tx => {
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'DRAFT', approvedById: actor.userId } });
    await recordAudit({ actor, action: 'po.approved', entityType: 'purchase_order', entityId: id }, tx);
  });
}

export async function cancelPurchaseOrder(id, reason, actor) {
  await prisma.$transaction(async tx => {
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ actor, action: 'po.cancelled', entityType: 'purchase_order', entityId: id, after: { reason } }, tx);
  });
}

// ── GRN (Goods Received Note) ─────────────────────────────────────────────

export async function createGrn({ purchaseOrderId, logisticsJobId, notes }, actor) {
  const po = await getPurchaseOrder(purchaseOrderId);
  if (!['CONFIRMED_BY_SUPPLIER', 'PARTIALLY_CONFIRMED', 'RIDER_ASSIGNED', 'COLLECTED'].includes(po.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', 'PO must be confirmed before a GRN can be created');
  }

  const number = await generateGrnNumber();
  const grn = await prisma.$transaction(async tx => {
    const g = await tx.grn.create({
      data: { number, purchaseOrderId, status: 'PENDING', receivedById: actor.userId, logisticsJobId: logisticsJobId || null, notes: notes || null },
    });
    await recordAudit({ actor, action: 'grn.created', entityType: 'grn', entityId: g.id, after: { number, purchaseOrderId } }, tx);
    return g;
  });
  return grn;
}

export async function updateGrnLine(grnId, lineId, { purchaseOrderItemId, receivedQty, acceptedQty, rejectedQty, checks, rejectionReason }, actor) {
  const grn = await prisma.grn.findUnique({ where: { id: grnId } });
  if (!grn || grn.status !== 'PENDING') throw new AppError('CONFLICT', 'GRN is not open for editing');

  const line = lineId
    ? await prisma.grnLine.findUnique({ where: { id: lineId } })
    : null;

  if (line) {
    return prisma.grnLine.update({ where: { id: lineId }, data: { receivedQty, acceptedQty, rejectedQty, checks, rejectionReason } });
  }
  return prisma.grnLine.create({
    data: { grnId, purchaseOrderItemId, receivedQty, acceptedQty, rejectedQty, checks, rejectionReason: rejectionReason || null },
  });
}

export async function completeGrn(grnId, actor) {
  const grn = await prisma.grn.findUnique({
    where: { id: grnId },
    include: { lines: { include: { purchaseOrderItem: { include: { purchaseOrder: true } } } }, purchaseOrder: { include: { items: true } } },
  });
  if (!grn) throw new AppError('NOT_FOUND', 'GRN not found');
  if (grn.status !== 'PENDING') throw new AppError('CONFLICT', 'GRN already completed');

  const po = grn.purchaseOrder;
  const totalAccepted = grn.lines.reduce((s, l) => s + l.acceptedQty, 0);
  const totalReceived = grn.lines.reduce((s, l) => s + l.receivedQty, 0);

  const grnStatus =
    totalAccepted === 0   ? 'FAILED' :
    totalAccepted < totalReceived ? 'PARTIAL_PASS' : 'PASSED';

  // Compute po-level totals for landed cost allocation
  const poTotalCents = po.items.reduce((s, i) => s + i.unitCostCents * i.quantity, 0);

  await prisma.$transaction(async tx => {
    // For each accepted line: receive stock, update costs, reserve for order item
    for (const line of grn.lines) {
      if (line.acceptedQty === 0) continue;
      const poItem = line.purchaseOrderItem;
      const lineValueCents = poItem.unitCostCents * poItem.quantity;

      const landedCost = computeLandedCostPerUnit({
        unitCostCents:      poItem.unitCostCents,
        acceptedQty:        line.acceptedQty,
        lineValueCents,
        poTotalCents,
        collectionFeeCents: po.collectionFeeCents,
        otherCostsCents:    po.otherCostsCents,
      });

      // Get current inventory
      const product = await tx.product.findUnique({ where: { id: poItem.productId } });
      const defaultLocationId = await getDefaultLocationId(tx);
      const invLevel = await tx.inventoryLevel.findFirst({ where: { productId: poItem.productId, locationId: defaultLocationId } });

      const newAvgCost = updateWeightedAvgCost({
        currentAvgCostCents: invLevel?.avgCostCents || landedCost,
        currentOnHand:       invLevel?.onHand       || 0,
        landedCostPerUnit:   landedCost,
        receivedQty:         line.acceptedQty,
      });

      // Receive stock (upsert inventory_level)
      await tx.$executeRaw`
        INSERT INTO inventory_levels (product_id, location_id, on_hand, reserved, version, updated_at)
        VALUES (${poItem.productId}::uuid, ${defaultLocationId}::uuid, ${line.acceptedQty}, 0, 1, now())
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET
          on_hand   = inventory_levels.on_hand + ${line.acceptedQty},
          version   = inventory_levels.version + 1,
          updated_at = now()
      `;

      // Stock movement
      await tx.stockMovement.create({
        data: {
          productId: poItem.productId,
          locationId: defaultLocationId,
          quantity: line.acceptedQty,
          reason: 'GRN_RECEIPT',
          unitCostCents: landedCost,
          referenceType: 'GRN',
          referenceId: grnId,
          actorId: actor.userId,
        },
      });

      // Update product costs
      await tx.product.update({
        where: { id: poItem.productId },
        data: { lastCostCents: landedCost, avgCostCents: newAvgCost },
      });

      // BR-012: for reactive lines, immediately reserve against the linked order item
      if (poItem.orderItemId) {
        const orderItem = await tx.orderItem.findUnique({ where: { id: poItem.orderItemId }, include: { order: true } });
        if (orderItem) {
          // Create reservation for the order item
          await tx.stockReservation.create({
            data: {
              productId: poItem.productId,
              locationId: defaultLocationId,
              orderItemId: poItem.orderItemId,
              quantity: line.acceptedQty,
              status: 'ACTIVE',
              expiresAt: null, // already paid
            },
          });
          await tx.$executeRaw`
            UPDATE inventory_levels
            SET reserved = reserved + ${line.acceptedQty}, version = version + 1
            WHERE product_id = ${poItem.productId}::uuid AND location_id = ${defaultLocationId}::uuid
          `;
          // Mark order item as RECEIVED
          await tx.orderItem.update({
            where: { id: poItem.orderItemId },
            data: { sourcingStatus: 'RECEIVED', unitCostCents: landedCost },
          });
          await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { receivedQty: { increment: line.acceptedQty } } });
        }
      }
    }

    // Handle rejected lines — send back to sourcing queue
    for (const line of grn.lines) {
      if (line.rejectedQty > 0 && line.purchaseOrderItem?.orderItemId) {
        await tx.orderItem.update({
          where: { id: line.purchaseOrderItem.orderItemId },
          data: { sourcingStatus: 'FAILED' },
        });
      }
    }

    // Complete GRN
    await tx.grn.update({ where: { id: grnId }, data: { status: grnStatus, completedAt: new Date() } });

    // Update PO status
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED' } });

    // Finance posting
    await postGrnLanded(grnId, tx);

    await emitOutboxEvent(grnStatus === 'FAILED' ? EVENTS.GRN_FAILED : EVENTS.GRN_COMPLETED, 'grn', grnId,
      { grnId, poId: po.id, status: grnStatus }, tx);
    await recordAudit({ actor, action: 'grn.completed', entityType: 'grn', entityId: grnId,
      after: { status: grnStatus, totalAccepted } }, tx);
  });

  return prisma.grn.findUnique({ where: { id: grnId }, include: { lines: true } });
}

async function getDefaultLocationId(tx = prisma) {
  const loc = await tx.location.findFirst({ where: { isDefault: true } });
  if (!loc) {
    // Use first available location as fallback
    const first = await tx.location.findFirst({ orderBy: { code: 'asc' } });
    if (!first) throw new AppError('INTERNAL', 'No inventory location configured. Please create a location first.');
    return first.id;
  }
  return loc.id;
}
