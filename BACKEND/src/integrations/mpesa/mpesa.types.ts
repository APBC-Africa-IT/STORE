export type StkPushRequest = {
  amountShillings: number;
  phone: string; // E.164
  accountReference: string;
  description: string;
  callbackUrl: string;
};

export type StkPushResponse = { merchantRequestId: string; checkoutRequestId: string; customerMessage: string };

/**
 * Result of asking Daraja "what happened to this STK push?".
 * - DONE: final answer (resultCode "0" = paid)
 * - PROCESSING: customer hasn't finished yet — ask again later
 */
export type StkQueryResult =
  | { status: 'DONE'; resultCode: string; resultDesc: string }
  | { status: 'PROCESSING' };

export interface MpesaClient {
  stkPush(req: StkPushRequest): Promise<StkPushResponse>;
  stkQuery(checkoutRequestId: string): Promise<StkQueryResult>;
}
