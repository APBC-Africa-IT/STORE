import { z } from 'zod';
import { PartCondition, PartNumberType, PartOrigin, ProductStatus, QualityGrade } from '@prisma/client';
import { cursorQuery } from '../../shared/pagination';

const cents = z.number().int().min(0);
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');

// ── Categories & brands ──
export const CategoryCreateBody = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  parentId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export const CategoryUpdateBody = CategoryCreateBody.partial();

export const BrandCreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slug.optional(),
  isActive: z.boolean().default(true),
});
export const BrandUpdateBody = BrandCreateBody.partial();

// ── Products ──
const productFields = {
  sku: z.string().trim().min(2).max(64).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2).max(200),
  slug: slug.optional(),
  description: z.string().max(10_000).nullable().optional(),
  brandId: z.uuid().nullable().optional(),
  categoryId: z.uuid(),
  status: z.enum(ProductStatus),
  qualityGrade: z.enum(QualityGrade),
  origin: z.enum(PartOrigin),
  condition: z.enum(PartCondition),
  barcode: z.string().trim().max(64).nullable().optional(),
  retailPriceCents: cents,
  salePriceCents: cents.nullable().optional(),
  saleStartsAt: z.coerce.date().nullable().optional(),
  saleEndsAt: z.coerce.date().nullable().optional(),
  tradePriceCents: cents.nullable().optional(),
  coreChargeCents: cents,
  vatRateBps: z.number().int().min(0).max(10_000),
  // staff-only cost fields (need pricing:view_cost)
  lastCostCents: cents.nullable().optional(),
  minMarginBps: z.number().int().min(0).max(10_000).nullable().optional(),
  // inventory policy
  lowStockThreshold: z.number().int().min(0),
  reorderPoint: z.number().int().min(0),
  reorderQty: z.number().int().min(0),
  sourcingLeadTimeMins: z.number().int().min(0).nullable().optional(),
  isSourceable: z.boolean(),
  // content
  specs: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).nullable().optional(),
  warrantyText: z.string().max(2000).nullable().optional(),
  seoTitle: z.string().max(70).nullable().optional(),
  seoDescription: z.string().max(160).nullable().optional(),
  weightGrams: z.number().int().min(0).nullable().optional(),
  // set true to save a price that is below the margin floor (but still above cost)
  acknowledgeMarginWarning: z.boolean().optional(),
};

export const ProductCreateBody = z.object({
  ...productFields,
  status: productFields.status.default('DRAFT'),
  qualityGrade: productFields.qualityGrade.default('STANDARD'),
  origin: productFields.origin.default('AFTERMARKET'),
  condition: productFields.condition.default('NEW'),
  coreChargeCents: productFields.coreChargeCents.default(0),
  vatRateBps: productFields.vatRateBps.default(1600),
  lowStockThreshold: productFields.lowStockThreshold.default(3),
  reorderPoint: productFields.reorderPoint.default(0),
  reorderQty: productFields.reorderQty.default(0),
  isSourceable: productFields.isSourceable.default(true),
});
export type ProductCreateBody = z.infer<typeof ProductCreateBody>;

export const ProductUpdateBody = z.object(productFields).partial();
export type ProductUpdateBody = z.infer<typeof ProductUpdateBody>;

export const PartNumbersBody = z.object({
  partNumbers: z
    .array(
      z.object({
        type: z.enum(PartNumberType),
        number: z.string().trim().min(2).max(64),
        manufacturer: z.string().trim().max(80).optional(),
      }),
    )
    .max(100),
});

export const FitmentsBody = z.object({
  fitments: z
    .array(
      z.object({
        vehicleId: z.uuid(),
        notes: z.string().max(500).optional(),
        position: z.string().max(40).optional(),
        verified: z.boolean().default(false),
      }),
    )
    .max(2000),
});

export const ProductListQuery = z.object({
  q: z.string().trim().min(2).max(100).optional(),
  category: z.string().optional(), // category slug (includes sub-categories)
  brand: z.string().optional(), // brand slug
  vehicleId: z.uuid().optional(), // only parts that fit this vehicle
  minPrice: z.coerce.number().int().min(0).optional(), // cents
  maxPrice: z.coerce.number().int().min(0).optional(), // cents
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  ...cursorQuery,
});
export type ProductListQuery = z.infer<typeof ProductListQuery>;

export const AdminProductListQuery = ProductListQuery.extend({
  status: z.enum(ProductStatus).optional(),
});

export const ProductDetailQuery = z.object({ vehicleId: z.uuid().optional() });
