import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';

export const notFound: RequestHandler = (req) => {
  throw new AppError(404, `Not found: ${req.method} ${req.path}`);
};

function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return typeof error === 'object' && error !== null && 'type' in error && 'status' in error;
}

function isDuplicateKey(error: unknown): error is { code: 11000; keyValue?: Record<string, unknown> } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json(error.details === undefined ? { error: error.message } : { error: error.message, details: error.details });
    return;
  }
  if (isBodyParserError(error)) {
    const message = error.type === 'entity.parse.failed' ? 'Invalid JSON body.' : 'Invalid request body.';
    res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? 'Request body is too large.' : message });
    return;
  }
  if (isDuplicateKey(error)) {
    const field = Object.keys(error.keyValue ?? {})[0];
    res.status(409).json({ error: field ? `A record with this ${field} already exists.` : 'This record already exists.' });
    return;
  }
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: `Invalid ${error.path}.` });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const first = Object.values(error.errors)[0];
    res.status(400).json({ error: first?.message ?? 'Invalid data.' });
    return;
  }
  logger.error('Unhandled error', error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
