import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/app-error.js';

interface Schemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

/**
 * Validates and replaces req.params / req.query / req.body with the parsed values.
 * The first issue's message becomes `error`; all issues go in `details`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          path: [key, ...issue.path].join('.'),
          message: issue.message,
        }));
        throw new AppError(400, details[0]?.message ?? 'Invalid request.', details);
      }
      // req.query is a getter in Express 5, so define the parsed value instead of assigning.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true, enumerable: true });
    }
    next();
  };
}
