import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveFlatMember } from '../middleware/flatMember.js';
import { ApiError } from '../errors/ApiError.js';

const router = Router();

// GET /api/flats - List all flats and indicate user membership status
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const query = `
      SELECT 
        f.id,
        f.name,
        f.created_at AS "createdAt",
        (fm.user_id IS NOT NULL) AS "isMember",
        (fm.left_at IS NOT NULL) AS "hasLeft",
        fm.joined_at AS "joinedAt",
        fm.left_at AS "leftAt"
      FROM flats f
      LEFT JOIN flat_memberships fm ON fm.flat_id = f.id AND fm.user_id = $1
      ORDER BY f.name ASC;
    `;

    const result = await pool.query(query, [userId]);

    res.status(200).json({
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/flats/:flatId/members - Get all members (active and departed) of a flat
router.get('/:flatId/members', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  try {
    const flatId = req.params.flatId as string;

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        fm.joined_at AS "joinedAt",
        fm.left_at AS "leftAt",
        (fm.left_at IS NOT NULL) AS "hasLeft"
      FROM flat_memberships fm
      JOIN users u ON u.id = fm.user_id
      WHERE fm.flat_id = $1
      ORDER BY fm.left_at ASC NULLS FIRST, fm.joined_at ASC, u.name ASC;
    `;

    const result = await pool.query(query, [flatId]);

    res.status(200).json({
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/flats/:flatId/leave - Leave the flat
router.get('/:flatId/leave', requireAuth, (_req, res) => {
  res.status(405).json({
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Please use POST to leave the flat.',
    },
  });
});

router.post('/:flatId/leave', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  try {
    const flatId = req.params.flatId as string;
    const userId = req.user!.id;

    const updateQuery = `
      UPDATE flat_memberships
      SET left_at = NOW()
      WHERE flat_id = $1 AND user_id = $2 AND left_at IS NULL
      RETURNING flat_id AS "flatId", user_id AS "userId", left_at AS "leftAt";
    `;

    const result = await pool.query(updateQuery, [flatId, userId]);

    if (result.rowCount === 0) {
      throw ApiError.badRequest('You have already left this flat or are not an active member.');
    }

    res.status(200).json({
      message: 'Successfully left the flat.',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
