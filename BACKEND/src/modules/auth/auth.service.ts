import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { config } from '../../config/config';
import { AppError } from '../../shared/errors/app-error';
import { hashPassword, verifyPassword } from '../../shared/crypto/password';
import { generateOpaqueToken, sha256 } from '../../shared/crypto/tokens';
import { normalizePhone } from '../../shared/phone';
import type { AuthRepository } from './auth.repository';
import type { LoginBody, RegisterBody } from './auth.schemas';

export type AccessTokenPayload = {
  sub: string;
  typ: User['type'];
  roles: string[];
  perms: string[];
};

type SignFn = (payload: AccessTokenPayload) => string;
type ClientInfo = { ip?: string; userAgent?: string };

// A real hash, so "user not found" takes as long as "wrong password" (prevents user enumeration by timing).
const DUMMY_HASH_PROMISE = hashPassword('dummy-password-for-timing');

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
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

  async login(input: LoginBody, client: ClientInfo) {
    const user = await this.findByIdentifier(input.identifier);

    if (!user || !user.passwordHash) {
      await verifyPassword(await DUMMY_HASH_PROMISE, input.password);
      throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError('FORBIDDEN', 'This account is not active');
    }

    // Step 5 adds: staff/supplier must pass TOTP 2FA here before getting tokens.

    await this.repo.touchLastLogin(user.id);
    return this.issueSession(user, randomUUID(), client);
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
    const accessToken = this.sign({ sub: user.id, typ: user.type, roles: ctx.roles, perms: ctx.permissions });

    const refreshToken = generateOpaqueToken();
    const isStaffLike = user.type === 'STAFF' || user.type === 'SUPPLIER_USER';
    const ttlMs = isStaffLike
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
  };
}
