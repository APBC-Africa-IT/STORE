import { config } from '../../config/config';
import { redis } from '../../shared/redis';
import { DarajaClient } from './mpesa.client';
import { FakeMpesaClient } from './mpesa.fake';
import type { MpesaClient } from './mpesa.types';

export const fakeMpesa = new FakeMpesaClient();

/** The M-Pesa client the app uses: real Daraja in "live" mode, the fake otherwise. */
export const mpesa: MpesaClient =
  config.INTEGRATIONS_MODE === 'live'
    ? new DarajaClient(
        {
          env: config.MPESA_ENV,
          consumerKey: config.MPESA_CONSUMER_KEY,
          consumerSecret: config.MPESA_CONSUMER_SECRET,
          shortcode: config.MPESA_SHORTCODE,
          partyB: config.MPESA_PARTY_B ?? config.MPESA_SHORTCODE,
          passkey: config.MPESA_PASSKEY,
          transactionType: config.MPESA_TRANSACTION_TYPE,
        },
        redis,
      )
    : fakeMpesa;

export type { MpesaClient } from './mpesa.types';
