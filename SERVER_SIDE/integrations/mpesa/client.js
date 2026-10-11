/**
 * M-Pesa Daraja API integration.
 * Covers: STK Push, STK Query, B2C Payment.
 * Fake mode returns synthetic responses for local/CI testing.
 */
import { getConfig } from '../../shared/config/index.js';

let _tokenCache = null; // { token, expiresAt }

async function getAccessToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now()) return _tokenCache.token;

  const config = getConfig();
  const creds = Buffer.from(`${config.MPESA_CONSUMER_KEY}:${config.MPESA_CONSUMER_SECRET}`).toString('base64');
  const baseUrl = config.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!res.ok) throw new Error(`M-Pesa token error: ${res.status}`);
  const data = await res.json();
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return _tokenCache.token;
}

function buildStkPassword(config) {
  const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const raw = `${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${ts}`;
  return { password: Buffer.from(raw).toString('base64'), timestamp: ts };
}

/**
 * Initiate an STK Push (Lipa na M-Pesa Online).
 * @param {{ phone:string, amount:number, accountRef:string, description:string, callbackUrl:string }} opts
 */
export async function stkPush({ phone, amount, accountRef, description, callbackUrl }) {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') {
    return {
      CheckoutRequestID: `fake_ckrq_${Date.now()}`,
      MerchantRequestID: `fake_mrq_${Date.now()}`,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing',
    };
  }

  const token = await getAccessToken();
  const { password, timestamp } = buildStkPassword(config);
  const baseUrl = config.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const body = {
    BusinessShortCode: config.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.ceil(amount),
    PartyA: phone.replace(/^\+/, ''),
    PartyB: config.MPESA_SHORTCODE,
    PhoneNumber: phone.replace(/^\+/, ''),
    CallBackURL: callbackUrl,
    AccountReference: accountRef.slice(0, 12),
    TransactionDesc: description.slice(0, 13),
  };

  const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`STK push failed: ${res.status}`);
  return res.json();
}

/**
 * Query the status of an STK push.
 * @param {{ checkoutRequestId:string }} opts
 */
export async function stkQuery({ checkoutRequestId }) {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') {
    return { ResultCode: '0', ResultDesc: 'The service request is processed successfully.' };
  }

  const token = await getAccessToken();
  const { password, timestamp } = buildStkPassword(config);
  const baseUrl = config.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const res = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  if (!res.ok) throw new Error(`STK query failed: ${res.status}`);
  return res.json();
}

/**
 * Initiate a B2C payment (rider/supplier payout).
 * @param {{ phone:string, amount:number, remarks:string, occasion:string, resultUrl:string, timeoutUrl:string }} opts
 */
export async function b2cPayment({ phone, amount, remarks, occasion, resultUrl, timeoutUrl }) {
  const config = getConfig();
  if ((config.INTEGRATIONS_MODE || 'fake') !== 'live') {
    return {
      ConversationID: `fake_conv_${Date.now()}`,
      OriginatorConversationID: `fake_orig_${Date.now()}`,
      ResponseCode: '0',
      ResponseDescription: 'Accept the service request successfully.',
    };
  }

  const token = await getAccessToken();
  const baseUrl = config.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const res = await fetch(`${baseUrl}/mpesa/b2c/v3/paymentrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      InitiatorName: config.MPESA_B2C_INITIATOR,
      SecurityCredential: config.MPESA_B2C_SECURITY_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: Math.ceil(amount),
      PartyA: config.MPESA_SHORTCODE,
      PartyB: phone.replace(/^\+/, ''),
      Remarks: remarks.slice(0, 100),
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: (occasion || '').slice(0, 100),
    }),
  });
  if (!res.ok) throw new Error(`B2C payment failed: ${res.status}`);
  return res.json();
}
