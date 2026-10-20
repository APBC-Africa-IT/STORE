import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import { sha256 } from '../../shared/crypto/tokens';
import { nextOrderNumber } from '../../shared/ids/numbers';
import { effectiveRetailPrice } from '../catalog/pricing.domain';
import type { InventoryRepository } from '../inventory/inventory.repository';
import type { InventoryService } from '../inventory/inventory.service';
import { buildQuote, type Quote } from './checkout.domain';
import { CHECKOUT_SETTINGS } from './checkout.settings';
import { CUSTOMER_STATUS_TEXT } from './order.machine';
import { orderInclude, type OrderWithItems, type OrdersService } from './orders.service';
import type { CreateOrderBody, QuoteBody } from './orders.schemas';

export class CheckoutService {
  constructor(
    private readonly db: PrismaClient,
    private readonly inventory: InventoryService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly orders: OrdersService,
  ) {}

  /** Price everything from the DATABASE (never trust prices sent by the client). No side effects. */
  async quote(input: QuoteBody, now = new Date()): Promise<Quote> {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    if (ids.length !== input.items.length) throw new AppError('VALIDATION_FAILED', 'Each product may appear only once');

    const products = await this.db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' } });
    if (products.length !== ids.length) throw new AppError('VALIDATION_FAILED', 'One or more products are not available');
    const byId = new Map(products.map((p) => [p.id, p]));
    const levels = await this.inventoryRepo.availableByProduct(ids);

    const zone = input.deliveryZoneId
      ? await this.db.deliveryZone.findFirst({ where: { id: input.deliveryZoneId, isActive: true } })
      : null;
    if (input.deliveryZoneId && !zone) throw new AppError('VALIDATION_FAILED', 'Unknown delivery zone');

    return buildQuote({
      now,
      deliveryMethod: input.deliveryMethod,
      paymentPlan: input.paymentPlan,
      zone,
      lines: input.items.map((i) => {
        const p = byId.get(i.productId)!;
        const level = levels.get(p.id);
        return {
          productId: p.id, sku: p.sku, name: p.name, quantity: i.quantity,
          unitPriceCents: effectiveRetailPrice(p, now), vatRateBps: p.vatRateBps,
          freeStock: level ? level.onHand - level.reserved : 0,
          canSource: p.isSourceable, sourcingLeadTimeMins: p.sourcingLeadTimeMins,
        };
      }),
    });
  }

  /**
   * Creates the order. Safe to retry: the same Idempotency-Key always returns the same order,
   * so a customer double-clicking "Place order" (or a flaky network retry) never creates two orders.
   */
  async createOrder(input: CreateOrderBody, opts: { idempotencyKey: string; customerId: string | null }) {
    const requestHash = sha256(JSON.stringify({ input, customerId: opts.customerId }));

    const existing = await this.db.order.findUnique({ where: { idempotencyKey: opts.idempotencyKey }, include: orderInclude });
    if (existing) return this.replay(existing, requestHash);

    // Price + check everything BEFORE opening the transaction: keep transactions short, and
    // never use `this.db` inside a transaction (that grabs a second connection → pool deadlock).
    const quote = await this.quote(input);
    this.validate(input, quote);

    try {
      return await this.db.$transaction((tx) => this.createInTx(tx, input, quote, opts, requestHash), { timeout: 15_000, maxWait: 10_000 });
    } catch (err) {
      // Two identical requests raced: the loser hits the unique index → return the winner's order.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.db.order.findUnique({ where: { idempotencyKey: opts.idempotencyKey }, include: orderInclude });
        if (winner) return this.replay(winner, requestHash);
      }
      throw err;
    }
  }

  private replay(order: OrderWithItems, requestHash: string) {
    if (order.requestHash !== requestHash) {
      throw new AppError('IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used for a different order');
    }
    return { order, replayed: true };
  }

  private validate(input: CreateOrderBody, quote: Quote) {
    const notAvailable = quote.problems.filter((p) => p.code === 'NOT_AVAILABLE');
    if (notAvailable.length) throw new AppError('INSUFFICIENT_STOCK', 'Some parts are no longer available', { problems: notAvailable });
    if (quote.problems.length) throw new AppError('VALIDATION_FAILED', 'This order cannot be placed as requested', { problems: quote.problems });
    if (quote.totalCents !== input.expectedTotalCents) {
      throw new AppError('CONFLICT', 'Prices or availability changed. Please review the new total.', { quote });
    }
    if (quote.hasSourcedItems && !input.acceptSourcingLeadTime) {
      throw new AppError('VALIDATION_FAILED', 'Please accept the sourcing lead time for parts we will source for you', { sourcingNotice: quote.sourcingNotice });
    }
    const needsAddress = input.deliveryMethod === 'STANDARD' || input.deliveryMethod === 'EXPRESS';
    if (needsAddress && !input.address) throw new AppError('VALIDATION_FAILED', 'A delivery address is required');
  }

  private async createInTx(
    tx: Prisma.TransactionClient,
    input: CreateOrderBody,
    quote: Quote,
    opts: { idempotencyKey: string; customerId: string | null },
    requestHash: string,
  ) {
    const now = new Date();
    const needsAddress = input.deliveryMethod === 'STANDARD' || input.deliveryMethod === 'EXPRESS';

    // ── create ──
    const isCod = input.paymentPlan === 'COD';
    const paymentDueBy = isCod ? null : new Date(now.getTime() + CHECKOUT_SETTINGS.paymentWindowMins * 60_000);
    const order = await tx.order.create({
      data: {
        number: await nextOrderNumber(tx),
        channel: 'ONLINE',
        status: isCod ? 'PLACED' : 'PENDING_PAYMENT', // BR-001: COD acceptance counts as confirmation
        paymentStatus: isCod ? 'COD_PENDING' : 'UNPAID',
        paymentPlan: input.paymentPlan,
        customerId: opts.customerId,
        contactName: input.contact.name,
        contactPhone: input.contact.phone,
        contactEmail: input.contact.email ?? null,
        deliveryMethod: input.deliveryMethod,
        deliveryAddress: needsAddress ? (input.address as Prisma.InputJsonValue) : Prisma.JsonNull,
        deliveryZoneId: needsAddress ? (input.deliveryZoneId ?? null) : null,
        hasSourcedItems: quote.hasSourcedItems,
        sourcingAcceptedAt: quote.hasSourcedItems ? now : null,
        promisedBy: quote.promisedBy,
        subtotalCents: quote.subtotalCents,
        deliveryFeeCents: quote.deliveryFeeCents,
        vatCents: quote.vatCents,
        totalCents: quote.totalCents,
        depositRequiredCents: quote.depositRequiredCents,
        paymentDueBy,
        placedAt: isCod ? now : null,
        idempotencyKey: opts.idempotencyKey,
        requestHash,
        items: {
          create: quote.lines.map((l) => ({
            productId: l.productId, sku: l.sku, name: l.name, quantity: l.quantity,
            unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents,
            vatRateBps: l.vatRateBps, vatCents: l.vatCents, source: l.source,
            sourcingStatus: l.source === 'SOURCED' ? 'AWAITING_PO' : 'NOT_REQUIRED',
            leadTimeMins: l.leadTimeMins, readyBy: l.readyBy,
          })),
        },
        statusHistory: {
          create: { toStatus: isCod ? 'PLACED' : 'PENDING_PAYMENT', actorId: opts.customerId, customerVisibleText: CUSTOMER_STATUS_TEXT[isCod ? 'PLACED' : 'PENDING_PAYMENT'] ?? null },
        },
      },
      include: { items: true },
    });

    // Hold the in-stock units (sorted by product to avoid deadlocks between concurrent orders).
    const stockItems = order.items.filter((i) => i.source === 'STOCK').sort((a, b) => a.productId.localeCompare(b.productId));
    for (const item of stockItems) {
      await this.inventory.reserve(tx, { productId: item.productId, quantity: item.quantity, orderItemId: item.id, expiresAt: paymentDueBy });
    }

    if (isCod) await this.orders.confirmAndRoute(tx, order.id, opts.customerId);

    await emitEvent(tx, {
      type: isCod ? 'order.placed' : 'order.created',
      aggregateType: 'order',
      aggregateId: order.id,
      payload: { orderId: order.id, number: order.number, totalCents: order.totalCents, paymentPlan: order.paymentPlan },
    });

    const full = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    return { order: full, replayed: false };
  }
}
