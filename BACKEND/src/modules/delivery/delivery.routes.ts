import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';
import { slugify } from '../../shared/text';

const ZoneBody = z.object({
  name: z.string().trim().min(2).max(60),
  customerFeeCents: z.number().int().min(0),
  riderFeeCents: z.number().int().min(0),
  expressSurchargeCents: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function deliveryRoutes(app: FastifyInstance) {
  // Public: zones and what delivery costs the customer (rider pay is NOT shown).
  app.get('/delivery-zones', async () => {
    const zones = await prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return {
      data: zones.map((z) => ({
        id: z.id, name: z.name, slug: z.slug, feeCents: z.customerFeeCents, expressSurchargeCents: z.expressSurchargeCents,
      })),
    };
  });

  const canManage = { preHandler: [app.authenticate, app.requirePermission('settings:manage')] };

  app.get('/admin/delivery-zones', canManage, async () => ({
    data: await prisma.deliveryZone.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  }));

  app.post('/admin/delivery-zones', canManage, async (req, reply) => {
    const body = ZoneBody.parse(req.body);
    const zone = await prisma.deliveryZone.create({ data: { ...body, slug: slugify(body.name) } });
    return reply.status(201).send({ data: zone });
  });

  app.patch('/admin/delivery-zones/:id', canManage, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const body = ZoneBody.partial().parse(req.body);
    return { data: await prisma.deliveryZone.update({ where: { id }, data: body }) };
  });
}
