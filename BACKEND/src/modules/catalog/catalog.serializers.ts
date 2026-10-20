import { effectiveRetailPrice, isSaleActive } from './pricing.domain';
import type { ProductDetailRow, ProductRow } from './catalog.repository';
import { toVehicleDto } from '../vehicles/vehicles.service';

// IMPORTANT (BR-007 + confidentiality): public DTOs are built from an ALLOW-LIST.
// Cost, margin and supplier fields are never copied here.

function publicPrice(p: ProductRow) {
  const now = new Date();
  return {
    amountCents: effectiveRetailPrice(p, now),
    regularCents: p.retailPriceCents,
    onSale: isSaleActive(p, now),
    coreChargeCents: p.coreChargeCents,
    currency: 'KES' as const,
    vatIncluded: true,
  };
}

export function toPublicProductCard(p: ProductRow) {
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
    category: { name: p.category.name, slug: p.category.slug },
    qualityGrade: p.qualityGrade,
    origin: p.origin,
    condition: p.condition,
    price: publicPrice(p),
    partNumbers: p.partNumbers.map((pn) => ({ type: pn.type, number: pn.number })),
    // availability is added in the inventory step
  };
}

export function toPublicProductDetail(p: ProductDetailRow, fitsVehicle: boolean | null) {
  return {
    ...toPublicProductCard(p),
    description: p.description,
    specs: p.specs ?? [],
    warrantyText: p.warrantyText,
    seo: { title: p.seoTitle ?? p.name, description: p.seoDescription },
    fitsVehicle, // null when no vehicle was given
    fitments: p.fitments.map((f) => ({ vehicle: toVehicleDto(f.vehicle), notes: f.notes, position: f.position })),
  };
}

/** Staff view. Cost/margin fields only when the user has `pricing:view_cost`. */
export function toStaffProduct(p: ProductRow | ProductDetailRow, canViewCost: boolean) {
  return {
    ...toPublicProductCard(p),
    status: p.status,
    description: p.description,
    barcode: p.barcode,
    brandId: p.brandId,
    categoryId: p.categoryId,
    retailPriceCents: p.retailPriceCents,
    salePriceCents: p.salePriceCents,
    saleStartsAt: p.saleStartsAt,
    saleEndsAt: p.saleEndsAt,
    tradePriceCents: p.tradePriceCents,
    vatRateBps: p.vatRateBps,
    lowStockThreshold: p.lowStockThreshold,
    reorderPoint: p.reorderPoint,
    reorderQty: p.reorderQty,
    sourcingLeadTimeMins: p.sourcingLeadTimeMins,
    isSourceable: p.isSourceable,
    specs: p.specs,
    warrantyText: p.warrantyText,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    weightGrams: p.weightGrams,
    ...('fitments' in p ? { fitmentCount: p.fitments.length } : {}),
    ...(canViewCost
      ? { lastCostCents: p.lastCostCents, avgCostCents: p.avgCostCents, minMarginBps: p.minMarginBps }
      : {}),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
