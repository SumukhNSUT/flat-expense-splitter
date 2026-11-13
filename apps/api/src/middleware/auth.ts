import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../errors/ApiError.js';

const uuidSchema = z.string().uuid();

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawUserId = req.headers['x-user-id'];

    if (!rawUserId || typeof rawUserId !== 'string') {
      throw ApiError.unauthorized('Missing X-User-Id header. Please provide a valid user UUID.');
    }

    const parseResult = uuidSchema.safeParse(rawUserId.trim());
    if (!parseResult.success) {
      throw ApiError.unauthorized('Invalid X-User-Id format. Expected a valid UUID.');
    }

    const userId = parseResult.data;

    // Verify user exists in the database
    const result = await pool.query<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE id = $1',
      [userId]
    );

    if (result.rowCount === 0) {
      throw ApiError.unauthorized(`User with ID ${userId} does not exist in the database.`);
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
