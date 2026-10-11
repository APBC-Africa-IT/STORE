/**
 * Fulfilment service — pick/pack queue, packing slip PDF, label PDF.
 * §8.5 of the backend guide.
 */
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { recordAudit } from '../audit/audit.service.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import pdfmake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
pdfmake.vfs = pdfFonts.pdfMake.vfs;

// ── Fulfilment queue ───────────────────────────────────────────────────────

export async function getFulfilmentQueue() {
  return prisma.order.findMany({
    where: {
      status: { in: ['PICKING', 'CONFIRMED'] },
      channel: { in: ['ONLINE', 'WALK_IN'] },
    },
    include: {
      items: {
        include: {
          product: {
            include: { inventory: { include: { bin: true, location: true } } },
          },
        },
      },
    },
    orderBy: { promisedBy: 'asc' },
    take: 100,
  });
}

// ── Pick ───────────────────────────────────────────────────────────────────

export async function pickOrder(orderId, actor) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  if (!['CONFIRMED', 'PICKING'].includes(order.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', `Order cannot be picked from status ${order.status}`);
  }

  await prisma.$transaction(async tx => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'PICKING', version: { increment: 1 } } });
    await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.status, toStatus: 'PICKING', actorId: actor.userId } });
    await recordAudit({ actor, action: 'order.picking', entityType: 'order', entityId: orderId }, tx);
  });
}

// ── Pack ───────────────────────────────────────────────────────────────────

export async function packOrder(orderId, { qcConfirmed }, actor) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PICKING') throw new AppError('INVALID_STATE_TRANSITION', 'Order must be in PICKING to pack');
  if (!qcConfirmed) throw new AppError('VALIDATION_FAILED', 'QC confirmation required to pack');

  await prisma.$transaction(async tx => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'PACKED', version: { increment: 1 } } });
    await tx.orderStatusEvent.create({
      data: { orderId, fromStatus: 'PICKING', toStatus: 'PACKED', actorId: actor.userId,
              customerVisibleText: 'Your order is packed and will be dispatched shortly' },
    });
    await emitOutboxEvent(EVENTS.ORDER_STATUS_CHANGED, 'order', orderId, { orderId, toStatus: 'PACKED' }, tx);
    await recordAudit({ actor, action: 'order.packed', entityType: 'order', entityId: orderId }, tx);
  });
}

// ── Ready for collection ───────────────────────────────────────────────────

export async function markReadyForCollection(orderId, actor) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PACKED') throw new AppError('INVALID_STATE_TRANSITION', 'Order must be PACKED');

  await prisma.$transaction(async tx => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'READY_FOR_COLLECTION', version: { increment: 1 } } });
    await tx.orderStatusEvent.create({
      data: { orderId, fromStatus: 'PACKED', toStatus: 'READY_FOR_COLLECTION', actorId: actor.userId,
              customerVisibleText: 'Your order is ready for collection at our hub' },
    });
    await emitOutboxEvent(EVENTS.ORDER_STATUS_CHANGED, 'order', orderId, { orderId, toStatus: 'READY_FOR_COLLECTION' }, tx);
    await recordAudit({ actor, action: 'order.ready_for_collection', entityType: 'order', entityId: orderId }, tx);
  });
}

// ── Packing slip PDF ───────────────────────────────────────────────────────

export async function generatePackingSlip(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { include: { brand: true } } } },
    },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');

  // BR-007: packing slip NEVER shows supplier names, costs, or margins
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      { text: 'MySpares', style: 'header' },
      { text: 'PACKING SLIP', style: 'subheader' },
      { text: `Order: ${order.number}`, margin: [0, 0, 0, 4] },
      { text: `Date: ${order.createdAt.toLocaleDateString('en-KE')}`, margin: [0, 0, 0, 16] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Part', bold: true },
              { text: 'Brand', bold: true },
              { text: 'Quality', bold: true },
              { text: 'Qty', bold: true },
            ],
            ...order.items.map(i => [
              `${i.name}\n${i.sku}`,
              i.product?.brand?.name || 'N/A',
              i.product?.qualityGrade || 'STANDARD',
              String(i.quantity),
            ]),
          ],
        },
      },
      { text: '\nPacked by MySpares — Quality checked for your peace of mind.', italics: true, margin: [0, 24, 0, 0] },
    ],
    styles: {
      header:    { fontSize: 20, bold: true },
      subheader: { fontSize: 14, bold: true, margin: [0, 0, 0, 16] },
    },
  };

  return new Promise((resolve, reject) => {
    pdfmake.createPdf(docDefinition).getBuffer((buf, pages) => resolve(buf));
  });
}

// ── Label PDF ─────────────────────────────────────────────────────────────

export async function generatePackageLabel(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');

  const address = order.deliveryAddress || {};

  const docDefinition = {
    pageSize: { width: 283, height: 170 }, // 10 × 6 cm
    pageMargins: [10, 10, 10, 10],
    content: [
      { text: 'MySpares', bold: true, fontSize: 12 },
      { text: order.number, fontSize: 10, margin: [0, 0, 0, 4] },
      { text: `To: ${address.recipientName || 'Customer'}`, fontSize: 9 },
      { text: address.line1 || '', fontSize: 8 },
      { text: `${address.area || ''}, ${address.city || 'Nairobi'}`, fontSize: 8 },
      { text: address.phone || '', fontSize: 8, margin: [0, 4, 0, 0] },
      { text: `Items: ${order.items.length} | Packed by MySpares`, fontSize: 7, italics: true, margin: [0, 8, 0, 0] },
    ],
  };

  return new Promise((resolve, reject) => {
    pdfmake.createPdf(docDefinition).getBuffer(resolve);
  });
}
