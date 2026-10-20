import type { FastifyError, FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors/app-error';

type AnyError = FastifyError | AppError | ZodError | Prisma.PrismaClientKnownRequestError;

/** Turn common database errors into clean API errors. */
function fromPrisma(error: Prisma.PrismaClientKnownRequestError): AppError | null {
  switch (error.code) {
    case 'P2002': {
      const target = (error.meta?.target as string[] | string | undefined) ?? 'field';
      return new AppError('CONFLICT', `A record with this ${Array.isArray(target) ? target.join(', ') : target} already exists`);
    }
    case 'P2025':
      return new AppError('NOT_FOUND', 'Record not found');
    case 'P2003':
      return new AppError('VALIDATION_FAILED', 'A referenced record does not exist');
    default:
      return null;
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((rawError: AnyError, request, reply) => {
    const requestId = request.id;
    const error = rawError instanceof Prisma.PrismaClientKnownRequestError ? (fromPrisma(rawError) ?? rawError) : rawError;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, requestId },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid request', details: error.issues, requestId },
      });
    }

    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: error.message, details: error.validation, requestId },
      });
    }

    // Unknown error: log everything, reveal nothing.
    request.log.error({ err: error }, 'Unhandled error');
    const status = 'statusCode' in error && error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.status(status).send({
      error: {
        code: status === 500 ? 'INTERNAL' : 'BAD_REQUEST',
        message: status === 500 ? 'Something went wrong' : error.message,
        requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found`, requestId: request.id },
    });
  });
}
