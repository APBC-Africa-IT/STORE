/**
 * Inventory handlers — HTTP/request layer for the inventory module.
 */
import * as inventoryService from './inventory.service.js';
import bwipjs from 'bwip-js';
import pdfmake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
pdfmake.vfs = pdfFonts.pdfMake.vfs;

// ── Stock levels ───────────────────────────────────────────────────────────

export async function getLevels(req, res) {
  const levels = await inventoryService.getLevels(req.params.productId);
  return res.json({ data: levels });
}

export async function getDashboard(req, res) {
  const lowStock = await inventoryService.getLowStockProducts();
  return res.json({ data: { lowStockCount: lowStock.length, items: lowStock.slice(0, 20) } });
}

// ── Adjustments ────────────────────────────────────────────────────────────

export async function createAdjustment(req, res) {
  const { productId, locationId, delta, reason, note } = req.body;
  if (!productId || !locationId || delta === undefined || !reason || !note) {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'productId, locationId, delta, reason, note all required' } });
  }
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await inventoryService.adjustStock({ productId, locationId, delta: Number(delta), reason, note, actor });
  return res.status(201).json({ data: result });
}

// ── Locations ──────────────────────────────────────────────────────────────

export async function listLocations(req, res) {
  const { prisma } = await import('../../shared/db/prisma.js');
  const locations = await prisma.location.findMany({ include: { bins: true }, orderBy: { code: 'asc' } });
  return res.json({ data: locations });
}

export async function createLocation(req, res) {
  const { prisma } = await import('../../shared/db/prisma.js');
  const loc = await prisma.location.create({ data: req.body });
  return res.status(201).json({ data: loc });
}

export async function listBins(req, res) {
  const { prisma } = await import('../../shared/db/prisma.js');
  const bins = await prisma.bin.findMany({
    where: req.query.locationId ? { locationId: req.query.locationId } : {},
    include: { location: true },
    orderBy: [{ locationId: 'asc' }, { code: 'asc' }],
  });
  return res.json({ data: bins });
}

export async function createBin(req, res) {
  const { prisma } = await import('../../shared/db/prisma.js');
  const bin = await prisma.bin.create({ data: req.body });
  return res.status(201).json({ data: bin });
}

// ── Low stock / reorder report ─────────────────────────────────────────────

export async function getLowStock(req, res) {
  const products = await inventoryService.getLowStockProducts();
  return res.json({ data: products });
}

export async function getReorderReport(req, res) {
  const { prisma } = await import('../../shared/db/prisma.js');
  const { getSetting } = await import('../settings/settings.service.js');
  const daysOfCover = await getSetting('inventory.daysOfCover') || 14;

  // Products at or below reorder point with 30-day velocity
  const rows = await prisma.$queryRaw`
    SELECT
      p.id, p.sku, p.name, p.reorder_point, p.reorder_qty,
      COALESCE(il.on_hand - il.reserved, 0) AS available,
      COALESCE(
        (SELECT SUM(ABS(sm.quantity))
         FROM stock_movements sm
         WHERE sm.product_id = p.id
           AND sm.reason = 'SALE'
           AND sm.created_at >= NOW() - INTERVAL '30 days') / 30.0,
        0
      ) AS daily_velocity
    FROM products p
    LEFT JOIN inventory_levels il ON il.product_id = p.id
    WHERE p.status = 'ACTIVE'
      AND (il.on_hand - il.reserved) <= p.reorder_point
    ORDER BY daily_velocity DESC
    LIMIT 100
  `;

  const report = rows.map(r => ({
    productId:     r.id,
    sku:           r.sku,
    name:          r.name,
    available:     Number(r.available),
    reorderPoint:  r.reorder_point,
    reorderQty:    r.reorder_qty,
    dailyVelocity: Number(r.daily_velocity),
    suggestedQty:  Math.max(
      r.reorder_qty,
      Math.ceil(Number(r.daily_velocity) * daysOfCover) - Number(r.available)
    ),
  }));

  return res.json({ data: report });
}

// ── Stocktake ──────────────────────────────────────────────────────────────

export async function openStocktake(req, res) {
  const result = await inventoryService.openStocktake({
    locationId: req.body.locationId,
    scope: req.body.scope || 'FULL',
    startedById: req.user.id,
  });
  return res.status(201).json({ data: result });
}

export async function submitCount(req, res) {
  const result = await inventoryService.submitStocktakeCount({
    stocktakeId: req.params.id,
    productId: req.body.productId,
    binId: req.body.binId,
    countedQty: Number(req.body.countedQty),
    countedById: req.user.id,
  });
  return res.json({ data: result });
}

export async function approveStocktake(req, res) {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await inventoryService.approveStocktake(req.params.id, actor);
  return res.json({ data: result });
}

export async function getStocktakeDiscrepancies(req, res) {
  const { prisma } = await import('../../shared/db/prisma.js');
  const lines = await prisma.stocktakeLine.findMany({
    where: { stocktakeId: req.params.id, variance: { not: 0 } },
    include: { stocktake: true },
  });
  return res.json({ data: lines });
}

// ── Barcode labels PDF ─────────────────────────────────────────────────────

export async function generateBarcodeLabels(req, res) {
  const { productIds } = req.body;
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'productIds array required' } });
  }

  const { prisma } = await import('../../shared/db/prisma.js');
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, barcode: true },
  });

  // Build pdfmake content
  const docDefinition = {
    pageSize: { width: 200, height: 100 },
    pageMargins: [5, 5, 5, 5],
    content: [],
  };

  for (const p of products) {
    const code = p.barcode || p.sku;
    let barcodeDataUrl = null;
    try {
      const png = await new Promise((resolve, reject) =>
        bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 2, height: 10 }, (err, buf) =>
          err ? reject(err) : resolve(buf)
        )
      );
      barcodeDataUrl = `data:image/png;base64,${png.toString('base64')}`;
    } catch { /* barcode generation failed — skip image */ }

    docDefinition.content.push({
      stack: [
        { text: p.name.slice(0, 40), fontSize: 7, bold: true },
        { text: p.sku, fontSize: 6 },
        barcodeDataUrl ? { image: barcodeDataUrl, width: 180, height: 40 } : { text: code, fontSize: 8 },
      ],
      pageBreak: products.indexOf(p) < products.length - 1 ? 'after' : undefined,
    });
  }

  const pdfDoc = pdfmake.createPdf(docDefinition);
  pdfDoc.getBuffer(buffer => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="barcode-labels.pdf"');
    res.send(buffer);
  });
}
