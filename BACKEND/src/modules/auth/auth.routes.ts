import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config, isDev } from '../../config/config';
import { AppError } from '../../shared/errors/app-error';
import { prisma } from '../../shared/db/prisma';
import { redis } from '../../shared/redis';
import { AuthRepository } from './auth.repository';
import { AuthService, type ClientInfo, type Session } from './auth.service';
import { LoginBody, RefreshBody, RegisterBody, TwoFactorEnableBody, TwoFactorVerifyBody } from './auth.schemas';

const REFRESH_COOKIE = 'ms_refresh';

// Strict limit for endpoints attackers like to hammer.
const strictLimit = { rateLimit: { max: config.RATE_LIMIT_LOGIN_MAX, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(new AuthRepository(prisma), redis, (payload) => app.jwt.sign(payload));

  const clientInfo = (req: FastifyRequest): ClientInfo => ({
    ...(req.ip ? { ip: req.ip } : {}),
    ...(req.headers['user-agent'] ? { userAgent: req.headers['user-agent'] } : {}),
    requestId: req.id,
  });

  // Web browsers get the refresh token ONLY as an httpOnly cookie (JavaScript can't steal it).
  // Mobile/POS apps send header `x-client-type: app` and receive it in the body instead.
  const sendSession = (req: FastifyRequest, reply: FastifyReply, session: Session, status = 200) => {
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: !isDev,
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires: session.refreshExpiresAt,
    });
    const isApp = req.headers['x-client-type'] === 'app';
    return reply.status(status).send({
      data: {
        user: session.user,
        accessToken: session.accessToken,
        twoFactorSetupRequired: session.twoFactorSetupRequired,
        ...(isApp ? { refreshToken: session.refreshToken } : {}),
      },
    });
  };

  app.post('/auth/register', { config: strictLimit }, async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    const session = await service.register(body, clientInfo(req));
    return sendSession(req, reply, session, 201);
  });

  app.post('/auth/login', { config: strictLimit }, async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const result = await service.login(body, clientInfo(req));
    if (result.kind === 'challenge') {
      return reply.send({ data: { twoFactorRequired: true, challengeToken: result.challengeToken } });
    }
    return sendSession(req, reply, result.session);
  });

  app.post('/auth/2fa/verify', { config: strictLimit }, async (req, reply) => {
    const body = TwoFactorVerifyBody.parse(req.body);
    const session = await service.verifyTwoFactor(body, clientInfo(req));
    return sendSession(req, reply, session);
  });

  app.post('/auth/2fa/setup', { preHandler: [app.authenticate] }, async (req) => {
    return { data: await service.setupTwoFactor(req.user.sub) };
  });

  app.post('/auth/2fa/enable', { preHandler: [app.authenticate], config: strictLimit }, async (req) => {
    const body = TwoFactorEnableBody.parse(req.body);
    return { data: await service.enableTwoFactor(req.user.sub, body.code, clientInfo(req)) };
  });

  app.post('/auth/refresh', async (req, reply) => {
    const token = RefreshBody.parse(req.body)?.refreshToken ?? req.cookies[REFRESH_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'No refresh token');
    const session = await service.refresh(token, clientInfo(req));
    return sendSession(req, reply, session);
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = RefreshBody.parse(req.body)?.refreshToken ?? req.cookies[REFRESH_COOKIE];
    await service.logout(token);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return { data: await service.me(req.user.sub) };
  });

  // Temporary route to prove permissions work. Delete once real admin routes exist.
  app.get(
    '/admin/ping',
    { preHandler: [app.authenticate, app.requirePermission('users:manage')] },
    async (req) => ({ data: { pong: true, you: req.user.sub } }),
  );
}
