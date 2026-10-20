import { describe, expect, it } from 'vitest';
import {
  accountReference, centsToShillings, darajaPassword, darajaTimestamp, parseStkCallback, stkFailureReason, toDarajaPhone,
} from '../../src/integrations/mpesa/mpesa.helpers';
import { FakeMpesaClient } from '../../src/integrations/mpesa/mpesa.fake';

describe('Daraja helpers', () => {
  it('timestamps in Kenyan time', () => {
    expect(darajaTimestamp(new Date('2026-10-20T09:05:07Z'))).toBe('20261020120507');
  });

  it('builds the password as base64(shortcode + passkey + timestamp)', () => {
    expect(Buffer.from(darajaPassword('174379', 'KEY', '20261020120507'), 'base64').toString()).toBe('174379KEY20261020120507');
  });

  it('formats phones and references the way Daraja wants', () => {
    expect(toDarajaPhone('+254712345678')).toBe('254712345678');
    expect(() => toDarajaPhone('+15551234567')).toThrow();
    expect(accountReference('ORD-261020-00042')).toBe('26102000042');
  });

  it('never under-collects when converting cents to shillings', () => {
    expect(centsToShillings(450_000)).toBe(4500);
    expect(centsToShillings(450_001)).toBe(4501);
  });

  it('parses a success callback', () => {
    const cb = parseStkCallback(FakeMpesaClient.callbackBody('ws_CO_1', { amount: 4500, receipt: 'SJK3XYZ123' }));
    expect(cb).toMatchObject({ checkoutRequestId: 'ws_CO_1', resultCode: '0', amount: 4500, receipt: 'SJK3XYZ123', phone: '254712345678' });
  });

  it('parses a cancelled callback and explains it', () => {
    const cb = parseStkCallback(FakeMpesaClient.callbackBody('ws_CO_2', { resultCode: 1032 }));
    expect(cb.resultCode).toBe('1032');
    expect(cb.receipt).toBeNull();
    expect(stkFailureReason('1032', '')).toBe('Payment cancelled on the phone');
  });

  it('rejects garbage', () => {
    expect(() => parseStkCallback({ hello: 'world' })).toThrow();
  });
});
