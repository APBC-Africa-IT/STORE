import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Secret, TOTP } from 'otpauth';
import { buildApp } from '../../src/app/build-app';
import { redis } from '../../src/shared/redis';
import { prisma } from '../../src/shared/db/prisma';
import { createStaffUser, randomEmail, randomPhone } from '../helpers';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await redis.flushdb(); // reset rate-limit counters and 2FA state between tests
});

const post = (url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload, headers });
const get = (url: string, token?: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function registerCustomer() {
  const phone = randomPhone();
  const res = await post('/auth/register', { firstName: 'Jane', lastName: 'Doe', phone, password: 'SuperSecret123' });
  return { res, phone, password: 'SuperSecret123' };
}

describe('register & login', () => {
  it('registers a customer and normalises the phone number', async () => {
    const { res, phone } = await registerCustomer();
    expect(res.statusCode).toBe(201);
    expect(res.json().data.user.phone).toBe(`+254${phone.slice(1)}`);
    expect(res.json().data.accessToken).toBeTypeOf('string');
    expect(res.json().data.refreshToken).toBeUndefined(); // web clients only get the cookie
    expect(res.headers['set-cookie']).toContain('HttpOnly');
  });

  it('rejects a duplicate phone number', async () => {
    const { phone } = await registerCustomer();
    const dup = await post('/auth/register', { firstName: 'J', lastName: 'D', phone, password: 'SuperSecret123' });
    expect(dup.statusCode).toBe(409);
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    const res = await post('/auth/register', { firstName: '', password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a wrong password without revealing whether the user exists', async () => {
    const { phone } = await registerCustomer();
    const wrongPw = await post('/auth/login', { identifier: phone, password: 'nope' });
    const noUser = await post('/auth/login', { identifier: randomEmail(), password: 'nope' });
    expect(wrongPw.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);
    expect(wrongPw.json().error.message).toBe(noUser.json().error.message);
  });
});

describe('permissions', () => {
  it('blocks a customer from admin routes', async () => {
    const { res } = await registerCustomer();
    const ping = await get('/admin/ping', res.json().data.accessToken);
    expect(ping.statusCode).toBe(403);
  });

  it('requires a token', async () => {
    expect((await get('/me')).statusCode).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens and kills the session when an old token is reused', async () => {
    const { phone, password } = await registerCustomer();
    const login = await post('/auth/login', { identifier: phone, password }, { 'x-client-type': 'app' });
    const rt1 = login.json().data.refreshToken as string;

    const r1 = await post('/auth/refresh', { refreshToken: rt1 }, { 'x-client-type': 'app' });
    expect(r1.statusCode).toBe(200);
    const rt2 = r1.json().data.refreshToken as string;
    expect(rt2).not.toBe(rt1);

    const reuse = await post('/auth/refresh', { refreshToken: rt1 });
    expect(reuse.statusCode).toBe(401);

    // The whole family is revoked, so even the newest token no longer works.
    const after = await post('/auth/refresh', { refreshToken: rt2 });
    expect(after.statusCode).toBe(401);
  });
});

describe('staff two-factor authentication', () => {
  it('forces staff to set up 2FA, then requires a code at login', async () => {
    const staff = await createStaffUser('SUPER_ADMIN');

    // 1. First login: setup-only token, no permissions yet.
    const first = await post('/auth/login', { identifier: staff.email, password: staff.password });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.twoFactorSetupRequired).toBe(true);
    const setupToken = first.json().data.accessToken as string;
    expect((await get('/admin/ping', setupToken)).statusCode).toBe(403);

    // 2. Setup + enable with a code from the "authenticator app".
    const setup = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/setup', headers: { authorization: `Bearer ${setupToken}` },
    });
    expect(setup.statusCode).toBe(200);
    const { secret, qrCodeDataUrl } = setup.json().data;
    expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    const totp = new TOTP({ secret: Secret.fromBase32(secret) });

    const enable = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/enable',
      headers: { authorization: `Bearer ${setupToken}` }, payload: { code: totp.generate() },
    });
    expect(enable.statusCode).toBe(200);

    // The secret is stored encrypted, never in plain text.
    const row = await prisma.user.findUnique({ where: { email: staff.email } });
    expect(row?.totpSecretEnc).toMatch(/^v1\./);
    expect(row?.totpSecretEnc).not.toContain(secret);

    // 3. Second login: password alone is not enough.
    const second = await post('/auth/login', { identifier: staff.email, password: staff.password });
    expect(second.json().data.twoFactorRequired).toBe(true);
    expect(second.json().data.accessToken).toBeUndefined();
    const challengeToken = second.json().data.challengeToken as string;

    const wrong = await post('/auth/2fa/verify', { challengeToken, code: '000000' });
    expect(wrong.statusCode).toBe(401);

    // Use the NEXT period's code (the current one was already used to enable 2FA → replay-blocked).
    const code = totp.generate({ timestamp: Date.now() + 30_000 });
    const ok = await post('/auth/2fa/verify', { challengeToken, code });
    expect(ok.statusCode).toBe(200);
    const fullToken = ok.json().data.accessToken as string;
    expect((await get('/admin/ping', fullToken)).statusCode).toBe(200);

    // 4. Audit trail recorded it.
    const audit = await get(`/admin/audit-logs?entityId=${row?.id}`, fullToken);
    const actions = (audit.json().data as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.2fa_enabled', 'auth.login']));
  });
});

describe('rate limiting', () => {
  it('blocks the 11th login attempt within a minute', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await post('/auth/login', { identifier: 'nobody@test.local', password: 'x' });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
