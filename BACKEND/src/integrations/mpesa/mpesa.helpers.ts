// Pure helpers for Safaricom Daraja (M-Pesa Express / STK Push). Unit-tested.

/** Daraja wants the timestamp in Kenyan time: YYYYMMDDHHmmss */
export function darajaTimestamp(date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** Password = base64(Shortcode + Passkey + Timestamp) */
export function darajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/** "+254712345678" → "254712345678" (Daraja format) */
export function toDarajaPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (!/^254[17]\d{8}$/.test(digits)) throw new Error(`Not a Kenyan mobile number: ${e164}`);
  return digits;
}

/** AccountReference max 12 chars → digits of the order number, e.g. ORD-261020-00042 → "26102000042" */
export function accountReference(orderNumber: string): string {
  return orderNumber.replace(/\D/g, '').slice(-12);
}

/** M-Pesa only takes whole shillings. We always round UP so we never under-collect. */
export function centsToShillings(cents: number): number {
  return Math.ceil(cents / 100);
}

export type StkCallback = {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: string;
  resultDesc: string;
  amount: number | null;
  receipt: string | null;
  phone: string | null;
  transactionDate: string | null;
};

/** Parse Safaricom's callback body. Throws if it isn't an STK callback. */
export function parseStkCallback(body: unknown): StkCallback {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string') throw new Error('Not an STK callback');
  const items = ((cb.CallbackMetadata as { Item?: Array<{ Name: string; Value?: unknown }> })?.Item ?? []);
  const get = (name: string) => items.find((i) => i.Name === name)?.Value;
  return {
    merchantRequestId: String(cb.MerchantRequestID ?? ''),
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: String(cb.ResultCode),
    resultDesc: String(cb.ResultDesc ?? ''),
    amount: get('Amount') != null ? Number(get('Amount')) : null,
    receipt: get('MpesaReceiptNumber') != null ? String(get('MpesaReceiptNumber')) : null,
    phone: get('PhoneNumber') != null ? String(get('PhoneNumber')) : null,
    transactionDate: get('TransactionDate') != null ? String(get('TransactionDate')) : null,
  };
}

/** Friendly reasons for common STK result codes. */
export const STK_RESULT_MESSAGES: Record<string, string> = {
  '0': 'Paid',
  '1': 'Insufficient M-Pesa balance',
  '1032': 'Payment cancelled on the phone',
  '1037': 'The phone could not be reached (timeout)',
  '2001': 'Wrong M-Pesa PIN',
  '1001': 'Another M-Pesa transaction is in progress on this phone',
  '1025': 'M-Pesa could not send the prompt, try again',
  '1019': 'The payment request expired',
};

export function stkFailureReason(code: string, desc: string): string {
  return STK_RESULT_MESSAGES[code] ?? desc ?? `M-Pesa error ${code}`;
}
