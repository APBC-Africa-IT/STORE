/**
 * Central error code registry.
 * Every AppError must use one of these codes.
 * Never throw raw Error objects from business logic.
 */
export const ErrorCodes = {
  VALIDATION_FAILED:          { status: 400, message: "Validation failed" },
  UNAUTHENTICATED:            { status: 401, message: "Authentication required" },
  TWO_FACTOR_REQUIRED:        { status: 401, message: "Two-factor authentication required" },
  FORBIDDEN:                  { status: 403, message: "Access denied" },
  NOT_FOUND:                  { status: 404, message: "Resource not found" },
  CONFLICT:                   { status: 409, message: "Conflict" },
  INVALID_STATE_TRANSITION:   { status: 409, message: "Invalid state transition" },
  INSUFFICIENT_STOCK:         { status: 409, message: "Insufficient stock" },
  RESERVATION_EXPIRED:        { status: 409, message: "Reservation expired" },
  PRICE_BELOW_MARGIN_FLOOR:   { status: 422, message: "Price below margin floor" },
  APPROVAL_REQUIRED:          { status: 422, message: "Approval required" },
  PAYMENT_FAILED:             { status: 402, message: "Payment failed" },
  IDEMPOTENCY_CONFLICT:       { status: 409, message: "Idempotency key conflict" },
  RATE_LIMITED:               { status: 429, message: "Too many requests" },
  INTEGRATION_UNAVAILABLE:    { status: 503, message: "Integration unavailable" },
  INTERNAL:                   { status: 500, message: "Internal server error" },
};

export class AppError extends Error {
  constructor(code, message, details = null) {
    const def = ErrorCodes[code] ?? ErrorCodes.INTERNAL;
    super(message ?? def.message);
    this.code = code;
    this.status = def.status;
    this.details = details;
    this.isAppError = true;
  }
}
