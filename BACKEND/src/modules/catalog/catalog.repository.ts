import type { Prisma, PrismaClient } from '@prisma/client';

/** What every product query loads, so serializers always have what they need. */
export const productInclude = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  partNumbers: { select: { type: true, number: true, normalized: true, manufacturer: true } },
} satisfies Prisma.ProductInclude;

export const productDetailInclude = {
  ...productInclude,
  fitments: {
    include: { vehicle: { include: { model: { include: { make: true } } } } },
    take: 500,
  },
} satisfies Prisma.ProductInclude;

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export class CatalogRepository {
  constructor(readonly db: PrismaClient) {}

  // ── categories ──
  allCategories() {
    return this.db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }
  createCategory(data: Prisma.CategoryUncheckedCreateInput) {
    return this.db.category.create({ data });
  }
  updateCategory(id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return this.db.category.update({ where: { id }, data });
  }

  // ── brands ──
  listBrands(onlyActive: boolean) {
    return this.db.brand.findMany({ where: onlyActive ? { isActive: true } : {}, orderBy: { name: 'asc' } });
  }
  findBrandBySlug(slug: string) {
    return this.db.brand.findUnique({ where: { slug } });
  }
  createBrand(data: Prisma.BrandCreateInput) {
    return this.db.brand.create({ data });
  }
  updateBrand(id: string, data: Prisma.BrandUpdateInput) {
    return this.db.brand.update({ where: { id }, data });
  }

  // ── products ──
  findProductById(id: string) {
    return this.db.product.findUnique({ where: { id }, include: productDetailInclude });
  }
  findProductBySlug(slug: string) {
    return this.db.product.findUnique({ where: { slug }, include: productDetailInclude });
  }
  listProducts(args: { where: Prisma.ProductWhereInput; orderBy: Prisma.ProductOrderByWithRelationInput[]; take: number; cursor?: string }) {
    return this.db.product.findMany({
      where: args.where,
      orderBy: args.orderBy,
      take: args.take,
      include: productInclude,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    });
  }
  createProduct(data: Prisma.ProductUncheckedCreateInput) {
    return this.db.product.create({ data, include: productDetailInclude });
  }
  updateProduct(id: string, data: Prisma.ProductUncheckedUpdateInput) {
    return this.db.product.update({ where: { id }, data, include: productDetailInclude });
  }
  slugExists(slug: string) {
    return this.db.product.count({ where: { slug } }).then((n) => n > 0);
  }
  productsByPartNumber(normalized: string) {
    return this.db.product.findMany({
      where: { status: 'ACTIVE', partNumbers: { some: { normalized } } },
      include: productInclude,
      take: 50,
    });
  }
  fitsVehicle(productId: string, vehicleId: string) {
    return this.db.productFitment.count({ where: { productId, vehicleId } }).then((n) => n > 0);
  }
}
