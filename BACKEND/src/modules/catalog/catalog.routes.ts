import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';
import { actorFrom, can } from '../../shared/auth/actor';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { toPublicProductCard, toPublicProductDetail, toStaffProduct } from './catalog.serializers';
import {
  AdminProductListQuery, BrandCreateBody, BrandUpdateBody, CategoryCreateBody, CategoryUpdateBody,
  FitmentsBody, PartNumbersBody, ProductCreateBody, ProductDetailQuery, ProductListQuery, ProductUpdateBody,
} from './catalog.schemas';

const IdParams = z.object({ id: z.uuid() });
const SlugParams = z.object({ slug: z.string().min(1).max(200) });

export async function catalogRoutes(app: FastifyInstance) {
  const service = new CatalogService(new CatalogRepository(prisma));

  // ═══════════════ Public storefront ═══════════════

  app.get('/categories', async () => ({ data: await service.categoryTree(true) }));

  app.get('/brands', async () => {
    const brands = await service.listBrands(true);
    return { data: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug })) };
  });

  app.get('/products', async (req) => {
    const q = ProductListQuery.parse(req.query);
    const { items, page } = await service.listProducts(q, { publicOnly: true });
    return { data: items.map(toPublicProductCard), page };
  });

  app.get('/products/:slug', async (req) => {
    const { slug } = SlugParams.parse(req.params);
    const { vehicleId } = ProductDetailQuery.parse(req.query);
    const { product, fits } = await service.getPublicProduct(slug, vehicleId);
    return { data: toPublicProductDetail(product, fits) };
  });

  app.get('/part-numbers/:number', async (req) => {
    const { number } = z.object({ number: z.string().min(1).max(64) }).parse(req.params);
    const products = await service.productsByPartNumber(number);
    return { data: products.map(toPublicProductCard) };
  });

  // ═══════════════ Admin ═══════════════

  const canWrite = { preHandler: [app.authenticate, app.requirePermission('catalog:write')] };

  // Categories
  app.get('/admin/categories', canWrite, async () => ({ data: await service.categoryTree(false) }));
  app.post('/admin/categories', canWrite, async (req, reply) => {
    const category = await service.createCategory(CategoryCreateBody.parse(req.body));
    return reply.status(201).send({ data: category });
  });
  app.patch('/admin/categories/:id', canWrite, async (req) => {
    const { id } = IdParams.parse(req.params);
    return { data: await service.updateCategory(id, CategoryUpdateBody.parse(req.body)) };
  });

  // Brands
  app.get('/admin/brands', canWrite, async () => ({ data: await service.listBrands(false) }));
  app.post('/admin/brands', canWrite, async (req, reply) => {
    const brand = await service.createBrand(BrandCreateBody.parse(req.body));
    return reply.status(201).send({ data: brand });
  });
  app.patch('/admin/brands/:id', canWrite, async (req) => {
    const { id } = IdParams.parse(req.params);
    return { data: await service.updateBrand(id, BrandUpdateBody.parse(req.body)) };
  });

  // Products
  app.get('/admin/products', canWrite, async (req) => {
    const q = AdminProductListQuery.parse(req.query);
    const { items, page } = await service.listProducts(q, { publicOnly: false, ...(q.status ? { status: q.status } : {}) });
    const showCost = can(actorFrom(req), 'pricing:view_cost');
    return { data: items.map((p) => toStaffProduct(p, showCost)), page };
  });

  app.get('/admin/products/:id', canWrite, async (req) => {
    const { id } = IdParams.parse(req.params);
    const product = await service.getProductById(id);
    return { data: toStaffProduct(product, can(actorFrom(req), 'pricing:view_cost')) };
  });

  app.post('/admin/products', canWrite, async (req, reply) => {
    const actor = actorFrom(req);
    const product = await service.createProduct(ProductCreateBody.parse(req.body), actor);
    return reply.status(201).send({ data: toStaffProduct(product, can(actor, 'pricing:view_cost')) });
  });

  app.patch('/admin/products/:id', canWrite, async (req) => {
    const { id } = IdParams.parse(req.params);
    const actor = actorFrom(req);
    const product = await service.updateProduct(id, ProductUpdateBody.parse(req.body), actor);
    return { data: toStaffProduct(product, can(actor, 'pricing:view_cost')) };
  });

  app.put('/admin/products/:id/part-numbers', canWrite, async (req) => {
    const { id } = IdParams.parse(req.params);
    const product = await service.setPartNumbers(id, PartNumbersBody.parse(req.body));
    return { data: toStaffProduct(product, can(actorFrom(req), 'pricing:view_cost')) };
  });

  app.put('/admin/products/:id/fitments', canWrite, async (req) => {
    const { id } = IdParams.parse(req.params);
    const product = await service.setFitments(id, FitmentsBody.parse(req.body));
    return { data: toStaffProduct(product, can(actorFrom(req), 'pricing:view_cost')) };
  });
}
