/**
 * Catalog serializers — audience-specific DTOs.
 * BR-007: Customer/public responses MUST NEVER contain supplier names, IDs,
 * cost prices, landed costs, or margins. Allow-list approach — add fields explicitly.
 *
 * Audiences: public (anonymous), customer (logged-in), staff (has pricing:view_cost perm)
 */

// ── Product serializers ────────────────────────────────────────────────────

/**
 * Public / customer-facing product DTO — NO cost, supplier, or margin fields.
 * @param {object} product - Prisma product row with optional relations
 * @param {{ effectivePriceCents?:number, availability?:object, vatBreakdown?:object }} pricingCtx
 */
export function serializeProductPublic(product, pricingCtx = {}) {
  const media = (product.media || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(m => ({ id: m.id, fileId: m.fileId, kind: m.kind, isPrimary: m.isPrimary, sortOrder: m.sortOrder }));

  return {
    id:              product.id,
    sku:             product.sku,
    slug:            product.slug,
    name:            product.name,
    description:     product.description || null,
    status:          product.status,
    qualityGrade:    product.qualityGrade,
    origin:          product.origin,
    condition:       product.condition,
    brand:           product.brand ? { id: product.brand.id, name: product.brand.name, slug: product.brand.slug } : null,
    category:        product.category ? { id: product.category.id, name: product.category.name, slug: product.category.slug } : null,
    retailPriceCents: product.retailPriceCents,
    salePriceCents:   product.salePriceCents || null,
    saleStartsAt:     product.saleStartsAt  || null,
    saleEndsAt:       product.saleEndsAt    || null,
    coreChargeCents:  product.coreChargeCents,
    vatRateBps:       product.vatRateBps,
    // Pricing context (injected by the route, not from raw DB row)
    effectivePriceCents: pricingCtx.effectivePriceCents || product.retailPriceCents,
    vatCents:            pricingCtx.vatBreakdown?.vatCents || null,
    availability:        pricingCtx.availability        || null,
    // Content
    specs:            product.specs    || null,
    warrantyText:     product.warrantyText || null,
    seoTitle:         product.seoTitle || null,
    seoDescription:   product.seoDescription || null,
    weightGrams:      product.weightGrams || null,
    barcode:          product.barcode  || null,
    // Fitment
    partNumbers:      (product.partNumbers || []).map(pn => ({
      type: pn.type, number: pn.number, normalized: pn.normalized, manufacturer: pn.manufacturer,
    })),
    fitments:         (product.fitments || []).map(f => ({
      vehicleId: f.vehicleId, position: f.position, notes: f.notes, verified: f.verified,
    })),
    media,
    // Inventory-level hint (no location detail, no bin)
    lowStockThreshold: product.lowStockThreshold,
    reorderPoint:      product.reorderPoint,
    createdAt:         product.createdAt,
    updatedAt:         product.updatedAt,
  };
}

/**
 * Staff product DTO — includes cost/margin fields when actor has pricing:view_cost.
 */
export function serializeProductStaff(product, pricingCtx = {}, canViewCost = false) {
  const base = serializeProductPublic(product, pricingCtx);
  if (!canViewCost) return base;

  return {
    ...base,
    // Cost fields — only for staff with pricing:view_cost
    lastCostCents:  product.lastCostCents  || null,
    avgCostCents:   product.avgCostCents   || null,
    tradePriceCents: product.tradePriceCents || null,
    minMarginBps:   product.minMarginBps   || null,
    marginBps:      (product.avgCostCents && product.retailPriceCents)
      ? Math.round((product.retailPriceCents - product.avgCostCents) / product.retailPriceCents * 10000)
      : null,
    isSourceable:   product.isSourceable,
    sourcingLeadTimeMins: product.sourcingLeadTimeMins || null,
    reorderQty:     product.reorderQty,
  };
}

// ── Category serializer ────────────────────────────────────────────────────

export function serializeCategory(cat) {
  return {
    id:        cat.id,
    name:      cat.name,
    slug:      cat.slug,
    parentId:  cat.parentId || null,
    sortOrder: cat.sortOrder,
    children:  (cat.children || []).map(serializeCategory),
  };
}

// ── Brand serializer ───────────────────────────────────────────────────────

export function serializeBrand(brand) {
  return { id: brand.id, name: brand.name, slug: brand.slug, logoFileId: brand.logoFileId || null };
}

// ── Part number serializer ─────────────────────────────────────────────────

export function serializePartNumber(pn) {
  return { id: pn.id, type: pn.type, number: pn.number, normalized: pn.normalized, manufacturer: pn.manufacturer || null };
}
