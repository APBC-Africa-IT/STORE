// Checkout business rules. These move into the `settings` table (editable by admins) in a later step.
export const CHECKOUT_SETTINGS = {
  paymentWindowMins: 30, // unpaid orders release their stock after this (SRS §2.3)
  freeDeliveryThresholdCents: 10_000_00, // KES 10,000
  deliveryVatRateBps: 1600,
  depositPercentBps: 3000, // 30%
  depositMinSourcedValueCents: 5_000_00, // deposit only for sourced parts worth ≥ KES 5,000
  codMaxOrderCents: 20_000_00, // cash on delivery only up to KES 20,000
  maxCartLines: 50,
  maxLineQuantity: 99,
} as const;
