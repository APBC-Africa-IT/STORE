import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { generateOpaqueToken, sha256 } from '../../shared/crypto/tokens';
import { effectiveRetailPrice } from '../catalog/pricing.domain';
import type { InventoryService } from '../inventory/inventory.service';
import { CHECKOUT_SETTINGS } from '../orders/checkout.settings';

export type CartOwner = { userId: string | null; guestToken: string | null };

/**
 * The cart is just a wish list with quantities. It NEVER reserves stock (BR-002) and
 * never stores prices — prices and availability are always read live.
 */
export class CartService {
  constructor(
    private readonly db: PrismaClient,
    private readonly inventory: InventoryService,
  ) {}

  private async findCart(owner: CartOwner) {
    if (owner.userId) return this.db.cart.findUnique({ where: { userId: owner.userId } });
    if (owner.guestToken) return this.db.cart.findUnique({ where: { guestTokenHash: sha256(owner.guestToken) } });
    return null;
  }

  /** Returns the cart, creating one if needed. A new guest cart comes with a fresh token. */
  private async findOrCreateCart(owner: CartOwner) {
    const existing = await this.findCart(owner);
    if (existing) return { cart: existing, newToken: null as string | null };
    if (owner.userId) return { cart: await this.db.cart.create({ data: { userId: owner.userId } }), newToken: null };
    const token = generateOpaqueToken();
    return { cart: await this.db.cart.create({ data: { guestTokenHash: sha256(token) } }), newToken: token };
  }

  async view(owner: CartOwner) {
    const cart = await this.findCart(owner);
    if (!cart) return emptyCart();
    const items = await this.db.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { createdAt: 'asc' } });
    const products = await this.db.product.findMany({
      where: { id: { in: items.map((i) => i.productId) }, status: 'ACTIVE' },
      include: { brand: { select: { name: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const availability = await this.inventory.availabilityFor(products);

    const lines = items
      .filter((i) => byId.has(i.productId)) // products that were archived simply drop out
      .map((i) => {
        const p = byId.get(i.productId)!;
        const unitPriceCents = effectiveRetailPrice(p);
        return {
          productId: p.id, slug: p.slug, sku: p.sku, name: p.name, brand: p.brand?.name ?? null,
          quantity: i.quantity, unitPriceCents, lineTotalCents: unitPriceCents * i.quantity,
          availability: availability.get(p.id) ?? null,
        };
      });
    return {
      lines,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
    };
  }

  async addItem(owner: CartOwner, productId: string, quantity: number) {
    await this.assertSellable(productId);
    const { cart, newToken } = await this.findOrCreateCart(owner);
    const existing = await this.db.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } });
    if (!existing && (await this.db.cartItem.count({ where: { cartId: cart.id } })) >= CHECKOUT_SETTINGS.maxCartLines) {
      throw new AppError('VALIDATION_FAILED', `A cart can hold at most ${CHECKOUT_SETTINGS.maxCartLines} different parts`);
    }
    const newQty = Math.min((existing?.quantity ?? 0) + quantity, CHECKOUT_SETTINGS.maxLineQuantity);
    await this.db.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      update: { quantity: newQty },
      create: { cartId: cart.id, productId, quantity: newQty },
    });
    return { newToken, cart: await this.view(newToken ? { userId: null, guestToken: newToken } : owner) };
  }

  async setQuantity(owner: CartOwner, productId: string, quantity: number) {
    const cart = await this.findCart(owner);
    if (!cart) throw new AppError('NOT_FOUND', 'Cart not found');
    if (quantity === 0) {
      await this.db.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    } else {
      const res = await this.db.cartItem.updateMany({ where: { cartId: cart.id, productId }, data: { quantity } });
      if (res.count === 0) throw new AppError('NOT_FOUND', 'That part is not in your cart');
    }
    return this.view(owner);
  }

  async clear(owner: CartOwner, productIds?: string[]) {
    const cart = await this.findCart(owner);
    if (!cart) return;
    await this.db.cartItem.deleteMany({ where: { cartId: cart.id, ...(productIds ? { productId: { in: productIds } } : {}) } });
  }

  /** After login: move the guest cart's items into the user's cart. */
  async merge(userId: string, guestToken: string) {
    const guest = await this.db.cart.findUnique({ where: { guestTokenHash: sha256(guestToken) }, include: { items: true } });
    if (!guest) return this.view({ userId, guestToken: null });
    const { cart } = await this.findOrCreateCart({ userId, guestToken: null });
    await this.db.$transaction(async (tx) => {
      for (const item of guest.items) {
        const existing = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: item.productId } } });
        const quantity = Math.min((existing?.quantity ?? 0) + item.quantity, CHECKOUT_SETTINGS.maxLineQuantity);
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
          update: { quantity },
          create: { cartId: cart.id, productId: item.productId, quantity },
        });
      }
      await tx.cart.delete({ where: { id: guest.id } });
    });
    return this.view({ userId, guestToken: null });
  }

  private async assertSellable(productId: string) {
    const product = await this.db.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'Product not found');
    // Rare parts can't be bought directly — they go through a Part Request.
    const availability = (await this.inventory.availabilityFor([product])).get(product.id);
    if (availability?.status === 'RARE_PART_REQUEST') {
      throw new AppError('VALIDATION_FAILED', 'This is a rare part. Please submit a part request instead.');
    }
  }
}

function emptyCart() {
  return { lines: [], itemCount: 0, subtotalCents: 0 };
}
