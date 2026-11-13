import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/ApiError.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const details = err.errors.reduce((acc, curr) => {
      const field = curr.path.join('.') || 'request';
      acc[field] = curr.message;
      return acc;
    }, {} as Record<string, string>);

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted data.',
        details,
      },
    });
    return;
  }

  // 2. Explicit Application Errors
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? {},
      },
    });
    return;
  }

  // 3. PostgreSQL or unexpected runtime errors
  console.error('Unhandled internal error:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred. Please try again later.',
      details: {},
    },
  });
}
