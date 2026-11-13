import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.created_at AS "createdAt",
        COALESCE(
          json_agg(
            json_build_object(
              'flatId', fm.flat_id,
              'flatName', f.name,
              'joinedAt', fm.joined_at,
              'leftAt', fm.left_at,
              'isActive', (fm.left_at IS NULL)
            )
          ) FILTER (WHERE fm.flat_id IS NOT NULL),
          '[]'
        ) AS memberships
      FROM users u
      LEFT JOIN flat_memberships fm ON fm.user_id = u.id
      LEFT JOIN flats f ON f.id = fm.flat_id
      GROUP BY u.id, u.name, u.email, u.created_at
      ORDER BY u.name ASC;
    `;

    const result = await pool.query(query);

    res.status(200).json({
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
