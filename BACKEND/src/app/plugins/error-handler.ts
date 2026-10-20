import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors/app-error';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    const requestId = request.id;

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
