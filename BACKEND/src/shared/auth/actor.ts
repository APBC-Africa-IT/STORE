import type { FastifyRequest } from 'fastify';

/** Who is doing something. Services receive this instead of the HTTP request. */
export type Actor = {
  userId: string;
  roles: string[];
  perms: string[];
  ip: string | null;
  userAgent: string | null;
  requestId: string;
};

export function actorFrom(req: FastifyRequest): Actor {
  return {
    userId: req.user.sub,
    roles: req.user.roles,
    perms: req.user.perms,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    requestId: req.id,
  };
}

export const can = (actor: Actor, permission: string) => actor.perms.includes(permission);
