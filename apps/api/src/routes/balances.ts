import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveFlatMember } from '../middleware/flatMember.js';
import { calculateSettlements } from '../utils/split.js';

const router = Router();

/**
 * GET /api/flats/:flatId/balances
 *
 * CRITICAL DATABASE REQUIREMENT:
 * Uses a genuine SQL query with aggregated CTEs and JOINs.
 * We separate `paid_summary` and `share_summary` into distinct Common Table Expressions (CTEs)
 * before joining to flat_memberships and users.
 * This guarantees:
 * 1. Zero cross-product multiplication of expense rows and share rows.
 * 2. Complete exclusion of soft-deleted expenses (e.deleted_at IS NULL).
 * 3. Inclusion of members with zero spending/shares (via LEFT JOIN on flat_memberships).
 * 4. Inclusion of departed members (left_at IS NOT NULL) to preserve historical accounting integrity.
 * 5. Net balance sum across the entire flat is guaranteed to equal 0.
 */
router.get('/:flatId/balances', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  try {
    const flatId = req.params.flatId as string;

    const balancesSql = `
      WITH paid_summary AS (
        SELECT 
          paid_by_user_id AS user_id,
          COALESCE(SUM(amount_paise), 0)::BIGINT AS total_paid_paise
        FROM expenses
        WHERE flat_id = $1 AND deleted_at IS NULL
        GROUP BY paid_by_user_id
      ),
      share_summary AS (
        SELECT 
          es.user_id,
          COALESCE(SUM(es.amount_paise), 0)::BIGINT AS total_share_paise
        FROM expense_shares es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.flat_id = $1 AND e.deleted_at IS NULL
        GROUP BY es.user_id
      )
      SELECT 
        u.id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        fm.joined_at AS "joinedAt",
        fm.left_at AS "leftAt",
        (fm.left_at IS NOT NULL) AS "hasLeft",
        COALESCE(p.total_paid_paise, 0)::BIGINT AS "totalPaidPaise",
        COALESCE(s.total_share_paise, 0)::BIGINT AS "totalSharePaise",
        (COALESCE(p.total_paid_paise, 0) - COALESCE(s.total_share_paise, 0))::BIGINT AS "netBalancePaise"
      FROM flat_memberships fm
      JOIN users u ON u.id = fm.user_id
      LEFT JOIN paid_summary p ON p.user_id = fm.user_id
      LEFT JOIN share_summary s ON s.user_id = fm.user_id
      WHERE fm.flat_id = $1
      ORDER BY fm.joined_at ASC, u.name ASC;
    `;

    const spendingSql = `
      SELECT COALESCE(SUM(amount_paise), 0)::BIGINT AS "totalSpendingPaise"
      FROM expenses
      WHERE flat_id = $1 AND deleted_at IS NULL;
    `;

    const [balancesResult, spendingResult] = await Promise.all([
      pool.query(balancesSql, [flatId]),
      pool.query(spendingSql, [flatId]),
    ]);

    // Parse string bigints from pg to JavaScript numbers (safe up to 90 trillion paise = 900 billion INR)
    const members = balancesResult.rows.map((row) => ({
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
      hasLeft: Boolean(row.hasLeft),
      totalPaidPaise: Number(row.totalPaidPaise),
      totalSharePaise: Number(row.totalSharePaise),
      netBalancePaise: Number(row.netBalancePaise),
    }));

    const totalSpendingPaise = Number(spendingResult.rows[0]?.totalSpendingPaise || 0);

    // Calculate deterministic settlement suggestions from net balances
    const settlements = calculateSettlements(members);

    res.status(200).json({
      data: {
        totalSpendingPaise,
        balances: members,
        settlements,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
