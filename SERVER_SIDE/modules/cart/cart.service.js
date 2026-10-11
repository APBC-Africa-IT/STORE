/**
 * Cart service — guest carts, user carts, merge, delivery zones.
 * BR-002: Cart NEVER reserves stock. Reservations only happen at order creation.
 */
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';

const MAX_CART_QTY = 99;

// ── Cart retrieval ─────────────────────────────────────────────────────────

export async function getOrCreateCart(userId, guestToken) {
  const where = userId ? { userId } : guestToken ? { guestToken } : null;
  if (!where) throw new AppError('VALIDATION_FAILED', 'userId or guestToken required');

  let cart = await prisma.cart.findFirst({
    where,
    include: { items: { include: { product: { include: { brand: true, category: true } } } } },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: userId
        ? { userId }
        : { guestToken: guestToken || uuidv4() },
      include: { items: { include: { product: { include: { brand: true, category: true } } } } },
    });
  }

  return cart;
}

export async function getCart(userId, guestToken) {
  return getOrCreateCart(userId, guestToken);
}

// ── Cart mutations ─────────────────────────────────────────────────────────

export async function addToCart(userId, guestToken, { productId, quantity, garageVehicleId }) {
  if (!productId || !quantity || quantity < 1) throw new AppError('VALIDATION_FAILED', 'productId and quantity ≥ 1 required');

  // Verify product is active
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'Product not found or not available');

  const cart = await getOrCreateCart(userId, guestToken);

  const existing = cart.items.find(i => i.productId === productId);
  if (existing) {
    const newQty = Math.min(existing.quantity + quantity, MAX_CART_QTY);
    return prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
  }

  return prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      quantity: Math.min(quantity, MAX_CART_QTY),
      garageVehicleId: garageVehicleId || null,
    },
  });
}

export async function updateCartItem(userId, guestToken, cartItemId, quantity) {
  const cart = await getOrCreateCart(userId, guestToken);
  const item = cart.items.find(i => i.id === cartItemId);
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');

  if (quantity <= 0) {
    return prisma.cartItem.delete({ where: { id: cartItemId } });
  }
  return prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity: Math.min(quantity, MAX_CART_QTY) },
  });
}

export async function removeCartItem(userId, guestToken, cartItemId) {
  const cart = await getOrCreateCart(userId, guestToken);
  const item = cart.items.find(i => i.id === cartItemId);
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');
  await prisma.cartItem.delete({ where: { id: cartItemId } });
}

export async function clearCart(cartId) {
  await prisma.cartItem.deleteMany({ where: { cartId } });
}

// ── Cart merge (guest → user on login) ────────────────────────────────────

export async function mergeCart(guestToken, userId) {
  if (!guestToken || !userId) return;

  const [guestCart, userCart] = await Promise.all([
    prisma.cart.findUnique({ where: { guestToken }, include: { items: true } }),
    prisma.cart.findUnique({ where: { userId },    include: { items: true } }),
  ]);

  if (!guestCart || guestCart.items.length === 0) return;

  if (!userCart) {
    // Assign the guest cart to the user
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId, guestToken: null } });
    return;
  }

  // Merge guest items into user cart
  await prisma.$transaction(async tx => {
    for (const gItem of guestCart.items) {
      const existing = userCart.items.find(i => i.productId === gItem.productId);
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(existing.quantity + gItem.quantity, MAX_CART_QTY) },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: userCart.id,
            productId: gItem.productId,
            quantity: gItem.quantity,
            garageVehicleId: gItem.garageVehicleId,
          },
        });
      }
    }
    // Delete the guest cart
    await tx.cart.delete({ where: { id: guestCart.id } });
  });
}

// ── Delivery zones ─────────────────────────────────────────────────────────

export async function getDeliveryZones() {
  return prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

export async function getZoneById(zoneId) {
  return prisma.deliveryZone.findUnique({ where: { id: zoneId } });
}

export async function computeDeliveryFee(zoneId, subtotalCents, isExpress, freeThresholdCents) {
  if (!zoneId) return 0;

  const zone = await getZoneById(zoneId);
  if (!zone) return 0;

  // Free delivery above threshold
  if (subtotalCents >= (freeThresholdCents || 500000)) return 0;

  let fee = zone.customerFeeCents;
  if (isExpress) fee += zone.expressSurchargeCents;
  return fee;
}
