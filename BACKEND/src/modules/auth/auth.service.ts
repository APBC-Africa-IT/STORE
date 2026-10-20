import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import type { Redis } from 'ioredis';
import QRCode from 'qrcode';
import { config } from '../../config/config';
import { AppError } from '../../shared/errors/app-error';
import { hashPassword, verifyPassword } from '../../shared/crypto/password';
import { generateOpaqueToken, sha256 } from '../../shared/crypto/tokens';
import { decrypt, encrypt } from '../../shared/crypto/encryption';
import { generateTotpSecret, totpUri, verifyTotp } from '../../shared/crypto/totp';
import { normalizePhone } from '../../shared/phone';
import { recordAudit } from '../audit/audit.service';
import type { AuthRepository } from './auth.repository';
import type { LoginBody, RegisterBody, TwoFactorVerifyBody } from './auth.schemas';

export type AccessTokenPayload = {
  sub: string;
  typ: User['type'];
  roles: string[];
  perms: string[];
  mfa?: 'setup_required';
};

type SignFn = (payload: AccessTokenPayload) => string;
export type ClientInfo = { ip?: string; userAgent?: string; requestId?: string };
export type Session = Awaited<ReturnType<AuthService['issueSession']>>;
export type LoginResult = { kind: 'session'; session: Session } | { kind: 'challenge'; challengeToken: string };

const CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_CHALLENGE_ATTEMPTS = 5;

// A real hash, so "user not found" takes as long as "wrong password" (prevents user enumeration by timing).
const DUMMY_HASH_PROMISE = hashPassword('dummy-password-for-timing');

const isStaffLike = (user: Pick<User, 'type'>) => user.type === 'STAFF' || user.type === 'SUPPLIER_USER';

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly redis: Redis,
    private readonly sign: SignFn,
  ) {}

  async register(input: RegisterBody, client: ClientInfo) {
    if (input.email && (await this.repo.findUserByEmail(input.email))) {
      throw new AppError('CONFLICT', 'An account with this email already exists');
    }
    if (input.phone && (await this.repo.findUserByPhone(input.phone))) {
      throw new AppError('CONFLICT', 'An account with this phone number already exists');
    }

    const user = await this.repo.createUserWithRole(
      {
        type: 'CUSTOMER',
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
      },
      'CUSTOMER',
    );

    return this.issueSession(user, randomUUID(), client);
  }

  /** Step 1 of login. Returns tokens, or a 2FA challenge if the user has 2FA enabled. */
  async login(input: LoginBody, client: ClientInfo): Promise<LoginResult> {
    const user = await this.findByIdentifier(input.identifier);

    if (!user || !user.passwordHash) {
      await verifyPassword(await DUMMY_HASH_PROMISE, input.password);
      throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      if (isStaffLike(user)) {
        await recordAudit(this.repo.client, {
          actorId: user.id, action: 'auth.login_failed', entityType: 'user', entityId: user.id,
          ip: client.ip ?? null, userAgent: client.userAgent ?? null, requestId: client.requestId ?? null,
        });
      }
      throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError('FORBIDDEN', 'This account is not active');
    }

    if (user.totpEnabledAt) {
      const challengeToken = generateOpaqueToken();
      await this.redis.set(
        `2fa:challenge:${sha256(challengeToken)}`,
        JSON.stringify({ userId: user.id, attempts: 0 }),
        'EX',
        CHALLENGE_TTL_SECONDS,
      );
      return { kind: 'challenge', challengeToken };
    }

    return { kind: 'session', session: await this.completeLogin(user, client) };
  }

  /** Step 2 of login for users with 2FA. */
  async verifyTwoFactor(input: TwoFactorVerifyBody, client: ClientInfo) {
    const key = `2fa:challenge:${sha256(input.challengeToken)}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new AppError('UNAUTHENTICATED', 'Login expired, please sign in again');

    const challenge = JSON.parse(raw) as { userId: string; attempts: number };
    if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
      await this.redis.del(key);
      throw new AppError('UNAUTHENTICATED', 'Too many wrong codes, please sign in again');
    }

    const user = await this.repo.findUserById(challenge.userId);
    if (!user || !user.totpSecretEnc || !user.totpEnabledAt || user.status !== 'ACTIVE') {
      await this.redis.del(key);
      throw new AppError('UNAUTHENTICATED', 'Login expired, please sign in again');
    }

    if (!(await this.checkTotp(user.id, user.totpSecretEnc, input.code))) {
      challenge.attempts += 1;
      await this.redis.set(key, JSON.stringify(challenge), 'KEEPTTL');
      throw new AppError('UNAUTHENTICATED', 'Invalid or already used code');
    }

    await this.redis.del(key);
    return this.completeLogin(user, client);
  }

  /** Generates a new secret (not active until confirmed with /2fa/enable). */
  async setupTwoFactor(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    if (user.totpEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is already enabled');

    const secret = generateTotpSecret();
    await this.repo.setPendingTotpSecret(user.id, encrypt(secret));

    const otpauthUrl = totpUri(secret, user.email ?? user.phone ?? user.id);
    return {
      secret, // for typing into the app manually
      otpauthUrl,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl), // show as <img src="...">
    };
  }

  async enableTwoFactor(userId: string, code: string, client: ClientInfo) {
    const user = await this.repo.findUserById(userId);
    if (!user || !user.totpSecretEnc) throw new AppError('CONFLICT', 'Start setup first (POST /auth/2fa/setup)');
    if (user.totpEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is already enabled');

    if (!(await this.checkTotp(user.id, user.totpSecretEnc, code))) {
      throw new AppError('UNAUTHENTICATED', 'Invalid code, check the time on your phone and try again');
    }

    await this.repo.client.$transaction(async (tx) => {
      await this.repo.enableTotp(tx, user.id);
      await recordAudit(tx, {
        actorId: user.id, action: 'auth.2fa_enabled', entityType: 'user', entityId: user.id,
        ip: client.ip ?? null, userAgent: client.userAgent ?? null, requestId: client.requestId ?? null,
      });
    });
    return { enabled: true };
  }

  /** Rotate a refresh token. Reusing an old token kills the whole session family (theft detection). */
  async refresh(refreshToken: string, client: ClientInfo) {
    const record = await this.repo.findRefreshToken(sha256(refreshToken));
    if (!record) throw new AppError('UNAUTHENTICATED', 'Invalid session');

    if (record.revokedAt) {
      await this.repo.revokeFamily(record.familyId);
      throw new AppError('UNAUTHENTICATED', 'Session expired, please log in again');
    }
    if (record.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Session expired, please log in again');
    if (record.user.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'This account is not active');

    return this.repo.client.$transaction(async (tx) => {
      const session = await this.issueSession(record.user, record.familyId, client, tx);
      const rotated = await this.repo.markRotated(tx, record.id, session.refreshTokenId);
      if (!rotated) {
        // Two refreshes raced with the same token → treat as reuse.
        throw new AppError('UNAUTHENTICATED', 'Session expired, please log in again');
      }
      return session;
    });
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    const record = await this.repo.findRefreshToken(sha256(refreshToken));
    if (record) await this.repo.revokeFamily(record.familyId);
  }

  async me(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const ctx = await this.repo.getAuthContext(user.id);
    return { user: toUserDto(user), roles: ctx.roles, permissions: ctx.permissions };
  }

  // ── helpers ──

  private async completeLogin(user: User, client: ClientInfo) {
    await this.repo.touchLastLogin(user.id);
    if (isStaffLike(user)) {
      await recordAudit(this.repo.client, {
        actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id,
        ip: client.ip ?? null, userAgent: client.userAgent ?? null, requestId: client.requestId ?? null,
      });
    }
    return this.issueSession(user, randomUUID(), client);
  }

  /** Verifies a TOTP code and blocks reusing the same code (replay protection). */
  private async checkTotp(userId: string, secretEnc: string, code: string) {
    if (!verifyTotp(decrypt(secretEnc), code)) return false;
    const firstUse = await this.redis.set(`2fa:used:${userId}:${code}`, '1', 'EX', 90, 'NX');
    return firstUse === 'OK';
  }

  private async findByIdentifier(identifier: string) {
    if (identifier.includes('@')) return this.repo.findUserByEmail(identifier.toLowerCase());
    const phone = normalizePhone(identifier);
    return phone ? this.repo.findUserByPhone(phone) : null;
  }

  private async issueSession(
    user: User,
    familyId: string,
    client: ClientInfo,
    tx?: Parameters<AuthRepository['createRefreshToken']>[0],
  ) {
    const ctx = await this.repo.getAuthContext(user.id);

    // Staff without 2FA get a "setup-only" token: no permissions until 2FA is enabled.
    const mustSetup2fa = config.REQUIRE_STAFF_2FA && isStaffLike(user) && !user.totpEnabledAt;
    const accessToken = this.sign({
      sub: user.id,
      typ: user.type,
      roles: ctx.roles,
      perms: mustSetup2fa ? [] : ctx.permissions,
      ...(mustSetup2fa ? { mfa: 'setup_required' as const } : {}),
    });

    const refreshToken = generateOpaqueToken();
    const ttlMs = isStaffLike(user)
      ? config.REFRESH_TTL_HOURS_STAFF * 60 * 60 * 1000
      : config.REFRESH_TTL_DAYS_CUSTOMER * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const saved = await this.repo.createRefreshToken(tx ?? this.repo.client, {
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt,
      ...(client.ip ? { ip: client.ip } : {}),
      ...(client.userAgent ? { userAgent: client.userAgent } : {}),
    });

    return {
      user: toUserDto(user),
      accessToken,
      refreshToken,
      refreshTokenId: saved.id,
      refreshExpiresAt: expiresAt,
      twoFactorSetupRequired: mustSetup2fa,
    };
  }
}

/** Only these fields ever leave the API. Never send passwordHash or totp secrets. */
export function toUserDto(user: User) {
  return {
    id: user.id,
    type: user.type,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    twoFactorEnabled: Boolean(user.totpEnabledAt),
  };
}
