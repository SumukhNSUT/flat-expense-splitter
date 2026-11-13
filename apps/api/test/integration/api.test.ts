import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import { createServer } from '../../src/server.js';
import { runMigrations } from '../../src/db/migrate.js';
import { runSeeds } from '../../src/db/seed.js';

describe('Flatmate Ledger REST API - Integration Test Suite', () => {
  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5432/flatmate_ledger_test';
  let testPool: pg.Pool;
  let app: ReturnType<typeof createServer>;

  // Seed constants
  const FLAT_1_ID = '11111111-1111-1111-1111-111111111111'; // Maple Residency
  const FLAT_2_ID = '22222222-2222-2222-2222-222222222222'; // Cedar Heights

  // Flat 1 Members
  const SUMUKH_ID = '00000000-0000-0000-0000-000000000001';
  const AARAV_ID = '00000000-0000-0000-0000-000000000002';
  const RIYA_ID = '00000000-0000-0000-0000-000000000003';
  const KARAN_ID = '00000000-0000-0000-0000-000000000004';

  // Flat 2 Member
  const DEV_ID = '00000000-0000-0000-0000-000000000005';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TEST_DATABASE_URL = testDbUrl;

    testPool = new pg.Pool({ connectionString: testDbUrl });

    // Initialize test database schema and seeds
    await runMigrations(testPool);
    await runSeeds(testPool);

    app = createServer();
  });

  afterAll(async () => {
    await testPool.end();
  });

  // 1. Health Endpoint
  it('GET /api/health - returns 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('flatmate-ledger-api');
  });

  // 2. Authentication & Identity Verification
  it('rejects requests without X-User-Id header with 401', async () => {
    const res = await request(app).get('/api/flats');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests with malformed X-User-Id with 401', async () => {
    const res = await request(app)
      .get('/api/flats')
      .set('X-User-Id', 'not-a-valid-uuid');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests with non-existent user UUID with 401', async () => {
    const res = await request(app)
      .get('/api/flats')
      .set('X-User-Id', '99999999-9999-9999-9999-999999999999');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 3. Flat Authorization & Isolation
  it('ensures users cannot access another flat’s expenses (403 Forbidden)', async () => {
    // DEV_ID belongs only to Flat 2 (Cedar Heights), trying to access Flat 1 (Maple Residency)
    const res = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', DEV_ID);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('do not belong to this flat');
  });

  // 4. Expense Creation: Success
  let createdExpenseId: string;
  it('POST /api/flats/:flatId/expenses - creates an expense successfully', async () => {
    const res = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', SUMUKH_ID)
      .send({
        description: 'Sunday House Party Snacks',
        amountPaise: 120000, // ₹1,200.00
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID, RIYA_ID, KARAN_ID],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBe('Sunday House Party Snacks');
    expect(res.body.data.amountPaise).toBe(120000);
    expect(res.body.data.paidBy.id).toBe(SUMUKH_ID);
    expect(res.body.data.shares).toHaveLength(4);

    // Each member gets 120000 / 4 = 30000 paise
    res.body.data.shares.forEach((share: { amountPaise: number }) => {
      expect(share.amountPaise).toBe(30000);
    });

    createdExpenseId = res.body.data.id;
  });

  // 5. Uneven Split and Sum Preservation
  it('creates an expense with an uneven split and verifies shares sum exactly to total', async () => {
    // ₹100.00 = 10000 paise among 3 members: 3334, 3333, 3333
    const res = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', RIYA_ID)
      .send({
        description: 'Late Night Ice Cream',
        amountPaise: 10000,
        paidByUserId: RIYA_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID, RIYA_ID],
      });

    expect(res.status).toBe(201);
    const shares: { amountPaise: number }[] = res.body.data.shares;
    expect(shares).toHaveLength(3);

    const sumShares = shares.reduce((acc, s) => acc + s.amountPaise, 0);
    expect(sumShares).toBe(10000);

    // Verify in database directly
    const dbShares = await testPool.query<{ amount_paise: string }>(
      'SELECT amount_paise FROM expense_shares WHERE expense_id = $1',
      [res.body.data.id]
    );
    const dbSum = dbShares.rows.reduce((acc, r) => acc + Number(r.amount_paise), 0);
    expect(dbSum).toBe(10000);
  });

  // 6. Validation Error: Invalid Amount
  it('rejects non-positive and non-integer amounts with 400 Bad Request', async () => {
    // Negative amount
    const res1 = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', SUMUKH_ID)
      .send({
        description: 'Invalid negative',
        amountPaise: -500,
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID],
      });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe('VALIDATION_ERROR');

    // Float amount
    const res2 = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', SUMUKH_ID)
      .send({
        description: 'Invalid float',
        amountPaise: 100.5,
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID],
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 7. Validation Error: Participant not in flat
  it('rejects split participants who do not belong to the flat', async () => {
    const res = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', SUMUKH_ID)
      .send({
        description: 'Snacks with outside member',
        amountPaise: 50000,
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, DEV_ID], // DEV_ID is in Flat 2
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not an active member');
  });

  // 8. Validation Error: Duplicate participants
  it('rejects duplicate split participants', async () => {
    const res = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', SUMUKH_ID)
      .send({
        description: 'Duplicate test',
        amountPaise: 50000,
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID, SUMUKH_ID],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 9. Authorization: Non-creator cannot edit expense
  it('ensures a non-creator cannot edit an expense (403 Forbidden)', async () => {
    // createdExpenseId was recorded by SUMUKH_ID. AARAV_ID tries to edit it.
    const res = await request(app)
      .put(`/api/flats/${FLAT_1_ID}/expenses/${createdExpenseId}`)
      .set('X-User-Id', AARAV_ID)
      .send({
        description: 'Tampered description',
        amountPaise: 150000,
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('recorded this expense can edit it');
  });

  // 10. Creator can edit expense successfully
  it('allows the creator to edit the expense and replaces shares transactionally', async () => {
    const res = await request(app)
      .put(`/api/flats/${FLAT_1_ID}/expenses/${createdExpenseId}`)
      .set('X-User-Id', SUMUKH_ID)
      .send({
        description: 'Sunday House Party Snacks (Updated)',
        amountPaise: 160000, // ₹1,600.00
        paidByUserId: SUMUKH_ID,
        splitBetweenUserIds: [SUMUKH_ID, AARAV_ID], // 2-way split now
      });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Sunday House Party Snacks (Updated)');
    expect(res.body.data.amountPaise).toBe(160000);
    expect(res.body.data.shares).toHaveLength(2);
    expect(res.body.data.shares[0].amountPaise).toBe(80000);
    expect(res.body.data.shares[1].amountPaise).toBe(80000);
  });

  // 11. Authorization: Non-creator cannot delete expense
  it('ensures a non-creator cannot delete an expense (403 Forbidden)', async () => {
    const res = await request(app)
      .delete(`/api/flats/${FLAT_1_ID}/expenses/${createdExpenseId}`)
      .set('X-User-Id', KARAN_ID);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('recorded this expense can delete it');
  });

  // 12. Soft Deletion & Listing Filter
  it('performs soft deletion: expense disappears from list immediately', async () => {
    const deleteRes = await request(app)
      .delete(`/api/flats/${FLAT_1_ID}/expenses/${createdExpenseId}`)
      .set('X-User-Id', SUMUKH_ID);

    expect(deleteRes.status).toBe(200);

    // Verify it is excluded from listing
    const listRes = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', SUMUKH_ID);

    expect(listRes.status).toBe(200);
    const ids = listRes.body.data.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(createdExpenseId);

    // Check in database directly: row still exists, deleted_at is set
    const dbCheck = await testPool.query<{ deleted_at: Date }>(
      'SELECT deleted_at FROM expenses WHERE id = $1',
      [createdExpenseId]
    );
    expect(dbCheck.rows[0].deleted_at).not.toBeNull();
  });

  // 13. Balances calculation with SQL CTE aggregates
  it('verifies balances endpoint returns correct results and net balance sum is 0', async () => {
    const res = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/balances`)
      .set('X-User-Id', SUMUKH_ID);

    expect(res.status).toBe(200);
    const { balances, totalSpendingPaise } = res.body.data;

    expect(balances).toHaveLength(4);
    expect(totalSpendingPaise).toBeGreaterThan(0);

    // Critical Invariant: Net balance sum across the flat must equal 0
    const netSum = balances.reduce((acc: number, b: { netBalancePaise: number }) => acc + b.netBalancePaise, 0);
    expect(netSum).toBe(0);

    // Each member's netBalance = totalPaid - totalShare
    balances.forEach((member: { totalPaidPaise: number; totalSharePaise: number; netBalancePaise: number }) => {
      expect(member.netBalancePaise).toBe(member.totalPaidPaise - member.totalSharePaise);
    });
  });

  // 14. Stable Ordering: when created_at is identical, secondary sort by id DESC
  it('verifies stable ordering using created_at DESC, id DESC', async () => {
    // Insert two expenses with the exact same timestamp and corresponding shares
    const now = new Date();
    const id1 = '44444444-4444-4444-4444-000000000001';
    const id2 = '44444444-4444-4444-4444-000000000002';

    await testPool.query(
      `INSERT INTO expenses (id, flat_id, description, amount_paise, paid_by_user_id, created_by_user_id, created_at)
       VALUES 
       ($1, $3, 'Same time 1', 1000, $4, $4, $5),
       ($2, $3, 'Same time 2', 1000, $4, $4, $5)`,
      [id1, id2, FLAT_1_ID, SUMUKH_ID, now]
    );

    await testPool.query(
      `INSERT INTO expense_shares (expense_id, user_id, amount_paise)
       VALUES 
       ($1, $3, 1000),
       ($2, $3, 1000)`,
      [id1, id2, SUMUKH_ID]
    );

    const res = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/expenses?limit=50`)
      .set('X-User-Id', SUMUKH_ID);

    expect(res.status).toBe(200);
    const expenseList = res.body.data;
    const idx1 = expenseList.findIndex((e: { id: string }) => e.id === id1);
    const idx2 = expenseList.findIndex((e: { id: string }) => e.id === id2);

    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    // id2 ('...0002') > id1 ('...0001'), so id2 must appear before id1
    expect(idx2).toBeLessThan(idx1);
  });

  // 15. Leave flat functionality & Revocation of Access
  it('allows a member to leave flat and immediately revokes their access to that flat', async () => {
    // KARAN_ID leaves Flat 1
    const leaveRes = await request(app)
      .post(`/api/flats/${FLAT_1_ID}/leave`)
      .set('X-User-Id', KARAN_ID);

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.message).toContain('Successfully left the flat');

    // Subsequent access to Flat 1 expenses returns 403 Forbidden
    const expensesRes = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/expenses`)
      .set('X-User-Id', KARAN_ID);

    expect(expensesRes.status).toBe(403);
    expect(expensesRes.body.error.message).toContain('left this flat');

    // Leaving flat does NOT allow access to balances either
    const balancesRes = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/balances`)
      .set('X-User-Id', KARAN_ID);

    expect(balancesRes.status).toBe(403);
  });

  // 16. Historical Integrity: Departed member's historical balance is still preserved
  it('preserves historical balances of departed member so flat net sum remains 0', async () => {
    // Active member SUMUKH queries Flat 1 balances
    const res = await request(app)
      .get(`/api/flats/${FLAT_1_ID}/balances`)
      .set('X-User-Id', SUMUKH_ID);

    expect(res.status).toBe(200);
    const balances = res.body.data.balances;

    // Karan is present in the historical balance list with hasLeft = true
    const karanBalance = balances.find((b: { userId: string }) => b.userId === KARAN_ID);
    expect(karanBalance).toBeDefined();
    expect(karanBalance.hasLeft).toBe(true);

    // Sum of all balances is still strictly zero
    const netSum = balances.reduce((acc: number, b: { netBalancePaise: number }) => acc + b.netBalancePaise, 0);
    expect(netSum).toBe(0);
  });
});
