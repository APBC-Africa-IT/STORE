import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { config } from '../../config/config';
import { AppError } from '../../shared/errors/app-error';
import type { Permission } from '../../shared/auth/permissions';
import type { AccessTokenPayload } from '../../modules/auth/auth.service';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateOptional: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: Permission) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance) {
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: { expiresIn: config.JWT_ACCESS_TTL },
  });

  // Use as: { preHandler: [app.authenticate] }
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Missing or invalid access token');
    }
  });

  // For routes guests AND logged-in users can call (cart, checkout).
  // No Authorization header → guest. A header that is present but invalid → 401.
  app.decorate('authenticateOptional', async (request: FastifyRequest) => {
    if (!request.headers.authorization) return;
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Missing or invalid access token');
    }
  });

  // Use as: { preHandler: [app.authenticate, app.requirePermission('orders:read_all')] }
  app.decorate('requirePermission', (permission: Permission) => async (request: FastifyRequest) => {
    if (!request.user?.perms.includes(permission)) {
      throw new AppError('FORBIDDEN', `Missing permission: ${permission}`);
    }
  });
}
