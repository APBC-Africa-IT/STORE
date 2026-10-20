import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';
import { inventoryService } from '../inventory/inventory.routes';
import { CartService, type CartOwner } from './cart.service';

export const cartService = new CartService(prisma, inventoryService);

const CART_TOKEN_HEADER = 'x-cart-token';
const AddBody = z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(99).default(1) });
const SetBody = z.object({ quantity: z.number().int().min(0).max(99) });
const MergeBody = z.object({ cartToken: z.string().min(10) });

/** Logged-in users are identified by their token; guests by the `x-cart-token` header. */
export function cartOwner(req: FastifyRequest): CartOwner {
  const header = req.headers[CART_TOKEN_HEADER];
  return {
    userId: req.user?.sub ?? null,
    guestToken: typeof header === 'string' && header.length > 0 ? header : null,
  };
}

export async function cartRoutes(app: FastifyInstance) {
  const optional = { preHandler: [app.authenticateOptional] };

  app.get('/cart', optional, async (req) => ({ data: await cartService.view(cartOwner(req)) }));

  app.post('/cart/items', optional, async (req, reply) => {
    const body = AddBody.parse(req.body);
    const { newToken, cart } = await cartService.addItem(cartOwner(req), body.productId, body.quantity);
    // A brand-new guest cart: the client must store this token and send it as `x-cart-token`.
    return reply.status(201).send({ data: { ...cart, ...(newToken ? { cartToken: newToken } : {}) } });
  });

  app.patch('/cart/items/:productId', optional, async (req) => {
    const { productId } = z.object({ productId: z.uuid() }).parse(req.params);
    const { quantity } = SetBody.parse(req.body);
    return { data: await cartService.setQuantity(cartOwner(req), productId, quantity) };
  });

  app.delete('/cart/items/:productId', optional, async (req) => {
    const { productId } = z.object({ productId: z.uuid() }).parse(req.params);
    return { data: await cartService.setQuantity(cartOwner(req), productId, 0) };
  });

  app.post('/cart/merge', { preHandler: [app.authenticate] }, async (req) => {
    const { cartToken } = MergeBody.parse(req.body);
    return { data: await cartService.merge(req.user.sub, cartToken) };
  });
}
