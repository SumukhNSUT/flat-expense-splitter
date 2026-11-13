import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveFlatMember } from '../middleware/flatMember.js';
import { ApiError } from '../errors/ApiError.js';
import { calculateEqualSplit } from '../utils/split.js';

const router = Router();

const expenseBodySchema = z.object({
  description: z
    .string({ required_error: 'Description is required.' })
    .trim()
    .min(1, 'Description cannot be empty.')
    .max(255, 'Description cannot exceed 255 characters.'),
  amountPaise: z
    .number({ required_error: 'Amount in paise is required.' })
    .int('Amount must be an integer number of paise.')
    .positive('Amount must be greater than zero.'),
  paidByUserId: z
    .string({ required_error: 'Payer is required.' })
    .uuid('Payer must be a valid user UUID.'),
  splitBetweenUserIds: z
    .array(z.string().uuid('Each split participant must be a valid user UUID.'))
    .min(1, 'At least one participant must be selected for the split.')
    .refine(
      (arr) => new Set(arr).size === arr.length,
      'Duplicate participants are not allowed in the split.'
    ),
});

// Helper to fetch active member IDs for a flat
async function getActiveMemberIds(flatId: string): Promise<Set<string>> {
  const result = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM flat_memberships WHERE flat_id = $1 AND left_at IS NULL',
    [flatId]
  );
  return new Set(result.rows.map((r) => r.user_id));
}

// Helper to fetch a single full expense with its shares
async function fetchFullExpense(expenseId: string, currentUserId: string) {
  const query = `
    SELECT 
      e.id,
      e.flat_id AS "flatId",
      e.description,
      e.amount_paise::BIGINT AS "amountPaise",
      e.created_at AS "createdAt",
      e.updated_at AS "updatedAt",
      json_build_object('id', u_paid.id, 'name', u_paid.name, 'email', u_paid.email) AS "paidBy",
      json_build_object('id', u_created.id, 'name', u_created.name, 'email', u_created.email) AS "createdBy",
      (e.created_by_user_id = $2) AS "isCreator",
      COALESCE(
        json_agg(
          json_build_object(
            'userId', es.user_id,
            'userName', u_share.name,
            'userEmail', u_share.email,
            'amountPaise', es.amount_paise::BIGINT
          ) ORDER BY u_share.name ASC
        ) FILTER (WHERE es.id IS NOT NULL),
        '[]'
      ) AS shares
    FROM expenses e
    JOIN users u_paid ON u_paid.id = e.paid_by_user_id
    JOIN users u_created ON u_created.id = e.created_by_user_id
    LEFT JOIN expense_shares es ON es.expense_id = e.id
    LEFT JOIN users u_share ON u_share.id = es.user_id
    WHERE e.id = $1 AND e.deleted_at IS NULL
    GROUP BY e.id, u_paid.id, u_created.id;
  `;

  const result = await pool.query(query, [expenseId, currentUserId]);
  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    amountPaise: Number(row.amountPaise),
    shares: row.shares.map((s: { userId: string; userName: string; userEmail: string; amountPaise: string | number }) => ({
      ...s,
      amountPaise: Number(s.amountPaise),
    })),
  };
}

// GET /api/flats/:flatId/expenses - List expenses with pagination and deterministic sorting
router.get('/:flatId/expenses', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  try {
    const flatId = req.params.flatId as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const offset = (page - 1) * limit;
    const currentUserId = req.user!.id;

    // Count non-deleted expenses for pagination
    const countResult = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::BIGINT AS count FROM expenses WHERE flat_id = $1 AND deleted_at IS NULL',
      [flatId]
    );
    const totalCount = Number(countResult.rows[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // Fetch expenses with stable ordering (created_at DESC, id DESC)
    const listQuery = `
      SELECT 
        e.id,
        e.flat_id AS "flatId",
        e.description,
        e.amount_paise::BIGINT AS "amountPaise",
        e.created_at AS "createdAt",
        e.updated_at AS "updatedAt",
        json_build_object('id', u_paid.id, 'name', u_paid.name, 'email', u_paid.email) AS "paidBy",
        json_build_object('id', u_created.id, 'name', u_created.name, 'email', u_created.email) AS "createdBy",
        (e.created_by_user_id = $2) AS "isCreator",
        COALESCE(
          json_agg(
            json_build_object(
              'userId', es.user_id,
              'userName', u_share.name,
              'userEmail', u_share.email,
              'amountPaise', es.amount_paise::BIGINT
            ) ORDER BY u_share.name ASC
          ) FILTER (WHERE es.id IS NOT NULL),
          '[]'
        ) AS shares
      FROM expenses e
      JOIN users u_paid ON u_paid.id = e.paid_by_user_id
      JOIN users u_created ON u_created.id = e.created_by_user_id
      LEFT JOIN expense_shares es ON es.expense_id = e.id
      LEFT JOIN users u_share ON u_share.id = es.user_id
      WHERE e.flat_id = $1 AND e.deleted_at IS NULL
      GROUP BY e.id, u_paid.id, u_created.id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $3 OFFSET $4;
    `;

    const listResult = await pool.query(listQuery, [flatId, currentUserId, limit, offset]);

    const data = listResult.rows.map((row) => ({
      ...row,
      amountPaise: Number(row.amountPaise),
      shares: row.shares.map((s: { userId: string; userName: string; userEmail: string; amountPaise: string | number }) => ({
        ...s,
        amountPaise: Number(s.amountPaise),
      })),
    }));

    res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/flats/:flatId/expenses - Create new expense
router.post('/:flatId/expenses', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const flatId = req.params.flatId as string;
    const callerId = req.user!.id;

    // Validate request body
    const body = expenseBodySchema.parse(req.body);

    // Verify payer and split participants are active members of this flat
    const activeMemberIds = await getActiveMemberIds(flatId);

    if (!activeMemberIds.has(body.paidByUserId)) {
      throw ApiError.badRequest('Selected payer is not an active member of this flat.');
    }

    for (const userId of body.splitBetweenUserIds) {
      if (!activeMemberIds.has(userId)) {
        throw ApiError.badRequest(`Selected participant (${userId}) is not an active member of this flat.`);
      }
    }

    // Calculate equal split shares deterministically using pure integer arithmetic
    const shares = calculateEqualSplit(body.amountPaise, body.splitBetweenUserIds);

    await client.query('BEGIN');

    // Insert expense
    const insertExpenseSql = `
      INSERT INTO expenses (flat_id, description, amount_paise, paid_by_user_id, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `;
    const expenseRes = await client.query<{ id: string }>(insertExpenseSql, [
      flatId,
      body.description,
      body.amountPaise,
      body.paidByUserId,
      callerId,
    ]);
    const expenseId = expenseRes.rows[0].id;

    // Insert shares
    const insertShareSql = `
      INSERT INTO expense_shares (expense_id, user_id, amount_paise)
      VALUES ($1, $2, $3);
    `;
    for (const share of shares) {
      await client.query(insertShareSql, [expenseId, share.userId, share.amountPaise]);
    }

    await client.query('COMMIT');

    const createdExpense = await fetchFullExpense(expenseId, callerId);
    res.status(201).json({
      message: 'Expense created successfully.',
      data: createdExpense,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PUT /api/flats/:flatId/expenses/:expenseId - Update existing expense (creator only)
router.put('/:flatId/expenses/:expenseId', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const flatId = req.params.flatId as string;
    const expenseId = req.params.expenseId as string;
    const callerId = req.user!.id;

    const body = expenseBodySchema.parse(req.body);

    // Verify expense exists, belongs to this flat, and caller is the creator
    const existingRes = await client.query<{ id: string; created_by_user_id: string; deleted_at: Date | null }>(
      'SELECT id, created_by_user_id, deleted_at FROM expenses WHERE id = $1 AND flat_id = $2',
      [expenseId, flatId]
    );

    if (existingRes.rowCount === 0 || existingRes.rows[0].deleted_at !== null) {
      throw ApiError.notFound('Expense not found.');
    }

    const existingExpense = existingRes.rows[0];
    if (existingExpense.created_by_user_id !== callerId) {
      throw ApiError.forbidden('Only the member who recorded this expense can edit it.');
    }

    // Verify active flat memberships
    const activeMemberIds = await getActiveMemberIds(flatId);

    if (!activeMemberIds.has(body.paidByUserId)) {
      throw ApiError.badRequest('Selected payer is not an active member of this flat.');
    }

    for (const userId of body.splitBetweenUserIds) {
      if (!activeMemberIds.has(userId)) {
        throw ApiError.badRequest(`Selected participant (${userId}) is not an active member of this flat.`);
      }
    }

    // Recompute shares deterministically
    const shares = calculateEqualSplit(body.amountPaise, body.splitBetweenUserIds);

    await client.query('BEGIN');

    // Update expense record
    await client.query(
      `UPDATE expenses
       SET description = $1, amount_paise = $2, paid_by_user_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [body.description, body.amountPaise, body.paidByUserId, expenseId]
    );

    // Replace shares transactionally
    await client.query('DELETE FROM expense_shares WHERE expense_id = $1', [expenseId]);

    const insertShareSql = `
      INSERT INTO expense_shares (expense_id, user_id, amount_paise)
      VALUES ($1, $2, $3);
    `;
    for (const share of shares) {
      await client.query(insertShareSql, [expenseId, share.userId, share.amountPaise]);
    }

    await client.query('COMMIT');

    const updatedExpense = await fetchFullExpense(expenseId, callerId);
    res.status(200).json({
      message: 'Expense updated successfully.',
      data: updatedExpense,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/flats/:flatId/expenses/:expenseId - Soft delete expense (creator only)
router.delete('/:flatId/expenses/:expenseId', requireAuth, requireActiveFlatMember, async (req, res, next) => {
  try {
    const flatId = req.params.flatId as string;
    const expenseId = req.params.expenseId as string;
    const callerId = req.user!.id;

    // Verify expense exists, belongs to flat, and check creator ownership
    const existingRes = await pool.query<{ id: string; created_by_user_id: string; deleted_at: Date | null }>(
      'SELECT id, created_by_user_id, deleted_at FROM expenses WHERE id = $1 AND flat_id = $2',
      [expenseId, flatId]
    );

    if (existingRes.rowCount === 0 || existingRes.rows[0].deleted_at !== null) {
      throw ApiError.notFound('Expense not found.');
    }

    if (existingRes.rows[0].created_by_user_id !== callerId) {
      throw ApiError.forbidden('Only the member who recorded this expense can delete it.');
    }

    // Perform soft deletion: set deleted_at = NOW()
    await pool.query(
      'UPDATE expenses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
      [expenseId]
    );

    res.status(200).json({
      message: 'Expense deleted successfully.',
      id: expenseId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
