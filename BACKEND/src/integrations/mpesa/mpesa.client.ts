import type { Redis } from 'ioredis';
import { AppError } from '../../shared/errors/app-error';
import { darajaPassword, darajaTimestamp, toDarajaPhone } from './mpesa.helpers';
import type { MpesaClient, StkPushRequest, StkPushResponse, StkQueryResult } from './mpesa.types';

type DarajaConfig = {
  env: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  partyB: string;
  passkey: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
};

const TOKEN_CACHE_KEY = 'mpesa:oauth-token';

/** Real Safaricom Daraja client. */
export class DarajaClient implements MpesaClient {
  private readonly baseUrl: string;

  constructor(private readonly cfg: DarajaConfig, private readonly redis: Redis) {
    this.baseUrl = cfg.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  }

  /** OAuth token, cached in Redis (shared by all API instances) until just before it expires. */
  private async token(): Promise<string> {
    const cached = await this.redis.get(TOKEN_CACHE_KEY);
    if (cached) return cached;
    const basic = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new AppError('INTEGRATION_UNAVAILABLE', `M-Pesa auth failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    const ttl = Math.max(Number(body.expires_in) - 60, 60);
    await this.redis.set(TOKEN_CACHE_KEY, body.access_token, 'EX', ttl);
    return body.access_token;
  }

  private async post<T>(path: string, payload: object): Promise<{ ok: boolean; status: number; body: T }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, body };
  }

  async stkPush(req: StkPushRequest): Promise<StkPushResponse> {
    const timestamp = darajaTimestamp();
    const phone = toDarajaPhone(req.phone);
    const { ok, status, body } = await this.post<Record<string, string>>('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: this.cfg.shortcode,
      Password: darajaPassword(this.cfg.shortcode, this.cfg.passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: this.cfg.transactionType,
      Amount: req.amountShillings,
      PartyA: phone,
      PartyB: this.cfg.partyB,
      PhoneNumber: phone,
      CallBackURL: req.callbackUrl,
      AccountReference: req.accountReference,
      TransactionDesc: req.description.slice(0, 13),
    });
    if (!ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
      throw new AppError('PAYMENT_FAILED', body.errorMessage ?? body.ResponseDescription ?? `M-Pesa request failed (${status})`);
    }
    return {
      merchantRequestId: body.MerchantRequestID ?? '',
      checkoutRequestId: body.CheckoutRequestID,
      customerMessage: body.CustomerMessage ?? 'Check your phone to complete payment',
    };
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const timestamp = darajaTimestamp();
    const { body } = await this.post<Record<string, string>>('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: this.cfg.shortcode,
      Password: darajaPassword(this.cfg.shortcode, this.cfg.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    });
    // While the customer is still entering their PIN, Daraja answers with an error like 500.001.1001.
    if (body.errorCode) {
      if (body.errorCode.startsWith('500.001')) return { status: 'PROCESSING' };
      throw new AppError('INTEGRATION_UNAVAILABLE', `M-Pesa query failed: ${body.errorMessage ?? body.errorCode}`);
    }
    if (body.ResultCode === undefined) return { status: 'PROCESSING' };
    return { status: 'DONE', resultCode: String(body.ResultCode), resultDesc: body.ResultDesc ?? '' };
  }
}
