# Engineering Decisions & Architecture Trade-Offs

This document records the foundational engineering decisions made during the design and implementation of **Flatmate Ledger**, along with the alternatives evaluated and the rationale behind each choice.

---

## 1. Monetary Representation and Rounding: Pure Integer Paise

### Decision
All monetary values in the database, API payloads, and internal business logic are represented exclusively as 64-bit integer paise (`BIGINT` in PostgreSQL, `number`/`bigint` in TypeScript). Decimal floating-point values are forbidden in persistent storage and arithmetic operations.

### Alternatives Considered
1. **IEEE 754 Floating-Point (`DOUBLE PRECISION` / JavaScript `number` with decimals)**:
   - *Why rejected*: Standard binary floating-point representation causes classic precision loss (e.g., `0.1 + 0.2 = 0.30000000000000004`). In a financial ledger, accumulating sub-cent rounding errors across dozens of splits creates fractional discrepancies where the sum of parts does not equal the whole.
2. **PostgreSQL `DECIMAL` / `NUMERIC`**:
   - *Why rejected*: While `NUMERIC(12, 2)` prevents binary floating-point imprecision in the database, handling it across the boundary into Node.js still requires third-party big-decimal libraries (e.g., `decimal.js` or `bignumber.js`) or string manipulation.
3. **Integer Paise with Pure Integer Division & Remainder Distribution**:
   - *Selected*: 1 INR = 100 paise. Dividing integer paise using integer division (`total / N`) yields an exact integer `baseShare`. The integer modulo (`total % N`) yields the exact number of remainder paise `R` (where `0 <= R < N`). By allocating exactly 1 extra paise to the first `R` members in a deterministically sorted array of user IDs, the sum of shares is mathematically guaranteed to equal the total expense with zero precision loss and without external library dependencies.

---

## 2. Balance Query Structure: Separate Aggregated CTEs with Outer Joins

### Decision
The `/api/flats/:flatId/balances` endpoint calculates member balances entirely within a single SQL query using two separate aggregated Common Table Expressions (CTEs)—one for total payments and one for total shares—which are then `LEFT JOIN`ed with `flat_memberships` and `users`.

```sql
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
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    fm.joined_at,
    fm.left_at,
    (fm.left_at IS NOT NULL) AS has_left,
    COALESCE(p.total_paid_paise, 0)::BIGINT AS total_paid_paise,
    COALESCE(s.total_share_paise, 0)::BIGINT AS total_share_paise,
    (COALESCE(p.total_paid_paise, 0) - COALESCE(s.total_share_paise, 0))::BIGINT AS net_balance_paise
FROM flat_memberships fm
JOIN users u ON u.id = fm.user_id
LEFT JOIN paid_summary p ON p.user_id = fm.user_id
LEFT JOIN share_summary s ON s.user_id = fm.user_id
WHERE fm.flat_id = $1
ORDER BY fm.joined_at ASC, u.name ASC;
```

### Alternatives Considered
1. **Fetching All Expenses and Shares into Application Memory**:
   - *Why rejected*: Querying every raw expense and share row to calculate balances in JavaScript violates the explicit requirement for SQL JOINs and aggregates. It also scales poorly (`O(N)` network bandwidth and memory footprint).
2. **Single Direct Join Across Expenses and Shares**:
   - *Why rejected*: If `expenses` and `expense_shares` are joined in a single `SELECT` block without prior aggregation, a member who paid for an expense that is split among 4 participants would have their payment counted 4 times in `SUM(e.amount_paise)`, causing severe data corruption (Cartesian product multiplication).
3. **Separate Aggregated CTEs (Selected Approach)**:
   - Aggregating payments by `paid_by_user_id` in CTE 1 and aggregating shares by `es.user_id` in CTE 2 reduces each dataset to at most one row per user before the final join. Joining against `flat_memberships` ensures members with zero expenses or zero shares are accurately represented with `0` balances, and historical members are correctly preserved.

---

## 3. Soft Deletion Strategy and Partial Indexing

### Decision
Expenses are soft-deleted by setting `deleted_at = NOW()`. Hard `DELETE` operations on the `expenses` table are disallowed. To prevent performance degradation as deleted rows accumulate, a composite partial B-tree index was implemented:

```sql
CREATE INDEX idx_expenses_flat_active 
ON expenses(flat_id, created_at DESC, id DESC) 
WHERE deleted_at IS NULL;
```

### Alternatives Considered
1. **Hard Physical Deletion (`DELETE FROM expenses WHERE id = $1`)**:
   - *Why rejected*: Hard deletion destroys financial audit trails, making it impossible to investigate disputed historical settlements or recover accidentally deleted records.
2. **Ledger Balancing Reversals (Contra-Expenses)**:
   - *Why rejected*: Creating an offsetting negative expense row introduces unnecessary complexity for a simple shared expense app, complicating pagination and sorting.
3. **Soft Deletion with Standard Index**:
   - *Why rejected*: An index on `(flat_id, created_at)` without a predicate indexes all deleted rows. Over time, deleted rows bloat the index and cause index scans to filter rows at the table level.
4. **Soft Deletion with Partial Composite Index (Selected Approach)**:
   - The partial index condition `WHERE deleted_at IS NULL` ensures that only active expenses reside in the index. The column order `(flat_id, created_at DESC, id DESC)` allows PostgreSQL to evaluate `WHERE flat_id = $1 ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4` directly via an index-only or index scan without an in-memory sort node.

---

## 4. Member Departure and Historical Ledger Integrity

### Decision
When a member leaves a flat (`POST /api/flats/:flatId/leave`), their membership record is not removed from `flat_memberships`. Instead, `left_at` is set to `NOW()`. Departed members are barred from viewing flat data or participating in new expenses, but their past payments and shares remain in the flat's database records.

### Alternatives Considered
1. **Cascading Row Deletion (`DELETE FROM flat_memberships`)**:
   - *Why rejected*: Because `expense_shares` and `expenses` reference `users(id)`, deleting a membership record would either require cascading deletions of their historical expenses (corrupting every flatmate's historical balance) or setting foreign keys to NULL.
2. **Deleting Departed Members from Balance Queries**:
   - *Why rejected*: If a flatmate who owes money leaves the flat and is filtered out of the balance query, the remaining members' net balances will no longer sum to zero, creating a phantom ledger imbalance.
3. **Soft Membership Deactivation with Continued Balance Accounting (Selected Approach)**:
   - Setting `left_at` preserves the referential integrity of all past expenses and shares. In the balances endpoint, departed members are included in the calculation so the flat's net balance remains strictly zero-sum. However, route authorization middleware blocks departed members from performing any further operations on the flat.

---

## 5. Stable Secondary Sort Key for Pagination

### Decision
All paginated expense queries sort by `ORDER BY e.created_at DESC, e.id DESC`.

### Alternatives Considered
1. **Sort Solely by `created_at DESC`**:
   - *Why rejected*: In high-frequency recording, batch scripts, or seed operations, multiple expenses can share identical millisecond timestamps. When PostgreSQL executes `LIMIT` and `OFFSET` queries across pages without a unique tie-breaker, the database engine does not guarantee a deterministic row order. This causes duplicate items on page transitions or skipped records.
2. **Sort by `created_at DESC, id DESC` (Selected Approach)**:
   - Because `id` is a UUID primary key (guaranteed unique), the combination of `(created_at, id)` creates a strictly deterministic total order. Every item occupies a predictable index across all pagination offsets.

---

## 6. Deterministic Greedy Settlement Suggestions without Database Mutation

### Decision *(Unspecified Requirement Addressed)*
The assignment requested a plain-language explanation of settlements (e.g., *"Aarav owes Riya ₹450"*). We designed a deterministic greedy matching algorithm that operates strictly on the net balances produced by the SQL query:
- Members with `netBalancePaise < 0` are sorted into a `debtors` queue (ordered by descending debt amount, tied by user ID).
- Members with `netBalancePaise > 0` are sorted into a `creditors` queue (ordered by descending credit amount, tied by user ID).
- The algorithm matches the largest debtor with the largest creditor, transfers `min(debt, credit)`, and advances the queues until all accounts balance.

### Why this approach was selected:
1. **Zero Database Mutation**: Settlement suggestions are purely informational advisory projections. They do not alter the database balances until the flatmates actually record an explicit settling transaction.
2. **Minimal Transaction Count**: Greedy matching minimizes the number of transfers needed to settle all debts in the flat.
3. **Exact Invariant Preservation**: Because calculations operate on integer paise, the sum of suggested transfers equals the total debt in the flat with zero remainder.
