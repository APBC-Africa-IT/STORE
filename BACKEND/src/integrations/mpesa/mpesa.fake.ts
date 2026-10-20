import { randomUUID } from 'node:crypto';
import type { MpesaClient, StkPushRequest, StkPushResponse, StkQueryResult } from './mpesa.types';

/**
 * Fake M-Pesa for local development and tests: no Safaricom account needed.
 * Records every push and lets you decide what "Safaricom" answers.
 */
export class FakeMpesaClient implements MpesaClient {
  pushes: Array<StkPushRequest & { checkoutRequestId: string }> = [];
  /** What stkQuery answers, per CheckoutRequestID (default: paid). */
  queryResults = new Map<string, StkQueryResult>();
  failNextPush: string | null = null;

  async stkPush(req: StkPushRequest): Promise<StkPushResponse> {
    if (this.failNextPush) {
      const msg = this.failNextPush;
      this.failNextPush = null;
      throw new Error(msg);
    }
    const checkoutRequestId = `ws_CO_${Date.now()}_${randomUUID().slice(0, 8)}`;
    this.pushes.push({ ...req, checkoutRequestId });
    return { merchantRequestId: `fake-${randomUUID().slice(0, 8)}`, checkoutRequestId, customerMessage: 'Success. Request accepted for processing' };
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    return this.queryResults.get(checkoutRequestId) ?? { status: 'DONE', resultCode: '0', resultDesc: 'The service request is processed successfully.' };
  }

  /** Builds the exact JSON Safaricom would POST to our callback URL. */
  static callbackBody(checkoutRequestId: string, opts: { resultCode?: number; amount?: number; receipt?: string; phone?: string } = {}) {
    const resultCode = opts.resultCode ?? 0;
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: 'fake-merchant',
          CheckoutRequestID: checkoutRequestId,
          ResultCode: resultCode,
          ResultDesc: resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user',
          ...(resultCode === 0
            ? {
                CallbackMetadata: {
                  Item: [
                    { Name: 'Amount', Value: opts.amount ?? 1 },
                    { Name: 'MpesaReceiptNumber', Value: opts.receipt ?? `FAKE${Date.now().toString(36).toUpperCase()}` },
                    { Name: 'TransactionDate', Value: 20261020120000 },
                    { Name: 'PhoneNumber', Value: Number((opts.phone ?? '+254712345678').replace(/\D/g, '')) },
                  ],
                },
              }
            : {}),
        },
      },
    };
  }
}
