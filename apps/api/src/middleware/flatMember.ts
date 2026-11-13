import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../errors/ApiError.js';

const uuidSchema = z.string().uuid();

export async function requireActiveFlatMember(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { flatId } = req.params;

    if (!flatId) {
      throw ApiError.badRequest('flatId parameter is required.');
    }

    const parseResult = uuidSchema.safeParse(flatId);
    if (!parseResult.success) {
      throw ApiError.badRequest('Invalid flatId format. Expected a valid UUID.');
    }

    const callerId = req.user?.id;
    if (!callerId) {
      throw ApiError.unauthorized();
    }

    // Check membership and flat existence
    const result = await pool.query<{
      flat_id: string;
      flat_name: string;
      joined_at: Date;
      left_at: Date | null;
    }>(
      `SELECT fm.flat_id, f.name AS flat_name, fm.joined_at, fm.left_at
       FROM flat_memberships fm
       JOIN flats f ON f.id = fm.flat_id
       WHERE fm.flat_id = $1 AND fm.user_id = $2`,
      [flatId, callerId]
    );

    if (result.rowCount === 0) {
      // User is not a member of this flat (or flat doesn't exist)
      throw ApiError.forbidden('You do not belong to this flat.');
    }

    const membership = result.rows[0];

    if (membership.left_at !== null) {
      throw ApiError.forbidden('You have left this flat and cannot access its resources.');
    }

    req.flatMembership = {
      flatId: membership.flat_id,
      flatName: membership.flat_name,
      joinedAt: membership.joined_at,
    };

    next();
  } catch (err) {
    next(err);
  }
}
