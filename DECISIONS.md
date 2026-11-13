# Engineering Decisions & Architecture Trade-Offs

This document records five foundational engineering decisions made during the design and implementation of **Flatmate Ledger**, along with the alternatives evaluated and the technical rationale behind each choice.

---

## 1. Monetary Representation and Deterministic Paise Distribution

### Decision Made
All monetary amounts across the database, API layer, and application calculations are represented exclusively as 64-bit integer paise (`BIGINT` in PostgreSQL, `number` and `bigint` in TypeScript, where 1 INR = 100 paise).

When splitting an expense of $T$ paise among $N$ selected active flat members, shares are calculated using integer arithmetic:
1. The participant list is deterministically sorted by member user UUIDs in ascending lexicographical order.
2. The base integer share is computed via integer division:
   $$\text{baseShare} = \lfloor T / N \rfloor$$
3. The remainder paise count is computed via integer modulo:
   $$R = T \pmod N \quad (0 \le R < N)$$
4. Exactly 1 extra paise is allocated to the first $R$ participants in the deterministically sorted sequence, while the remaining $N - R$ members receive $\text{baseShare}$.

This guarantees that:
$$\sum_{i=1}^N \text{share}_i = R \cdot (\text{baseShare} + 1) + (N - R) \cdot \text{baseShare} = N \cdot \text{baseShare} + R = T$$
The sum of all computed shares strictly equals the total expense with zero precision loss.

### Alternatives Considered
1. **IEEE 754 Binary Floating-Point (`DOUBLE PRECISION` / JavaScript `number` with Decimals)**:
   - *Why rejected*: Standard binary floating-point representation cannot exactly represent many decimal fractions (such as `0.1` or `0.2`), causing classic precision errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). In a shared financial ledger where bills are repeatedly divided across varying numbers of flatmates, accumulating sub-paise fractional discrepancies corrupts account balances over time.
2. **Arbitrary-Precision Decimals (`NUMERIC(12, 2)` / `decimal.js`)**:
   - *Why rejected*: While SQL `NUMERIC` avoids binary floating-point imprecision in the database, transferring decimal types to and from Node.js requires external dependencies (such as `decimal.js` or `bignumber.js`) or custom string serialization. Furthermore, when dividing amounts like ₹100.00 among 3 participants, decimal division produces periodic fractions ($33.333\dots$), requiring an explicit fractional rounding policy that still risks creating or losing money.
3. **Integer Paise with Deterministic Remainder Allocation (Selected)**:
   - *Selected*: Storing values in integer paise eliminates all floating-point rounding errors naturally at the data-type level. Deterministic remainder allocation using sorted UUIDs ensures that identical inputs produce identical allocations across every API call and test run, without requiring third-party math packages.

---

## 2. Balance Aggregation Using SQL CTEs and Deterministic Settlement Suggestions

### Decision Made
The `/api/flats/:flatId/balances` endpoint calculates member balances entirely within PostgreSQL using a single SQL query composed of two separate aggregated Common Table Expressions (CTEs)—one for total amounts paid and one for total shares owed—which are subsequently joined with `flat_memberships` and `users`:

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
```

To provide plain-language settlement advice (e.g., *"Aarav owes Riya ₹450.00"*), the application processes the resulting net balances in memory using a deterministic greedy debtor-creditor matching heuristic. Members with negative net balances (debtors) are paired with members with positive net balances (creditors), transferring $\min(\text{debt}, \text{credit})$ iteratively until all balances offset.

### Alternatives Considered
1. **Fetching All Flat Expenses into Node.js Memory**:
   - *Why rejected*: Loading every raw expense and share row to compute balances in JavaScript violates the evaluation requirement for SQL JOINs and aggregates, transfers unnecessary data over the network, and scales poorly ($O(E \cdot S)$ application memory consumption as transaction history expands).
2. **Single Direct Multi-Table Join Without Pre-Aggregation**:
   - *Why rejected*: If `expenses` and `expense_shares` are joined directly in a single `SELECT` block without prior grouping, joining an expense with $K$ shares replicates the expense row $K$ times. Aggregating `SUM(e.amount_paise)` over the joined set would multiply the payer's amount by $K$ (a classic Cartesian product join bug).
3. **Separate Aggregated CTEs with Outer Joins (Selected)**:
   - *Selected*: Grouping expenses in `paid_summary` and shares in `share_summary` reduces each dataset to at most one summary row per member before the outer join. Joining against `flat_memberships` ensures that members with zero transactions are included with ₹0 amounts, and departed members remain visible for historical accounting.
4. **Settlement Advice Handling**:
   - The greedy debtor-creditor matching is implemented as a deterministic advisory heuristic. It provides actionable settlement suggestions without modifying the underlying database balances or introducing artificial debt-simplification transactions that could obscure auditability.

---

## 3. Soft Deletion and Partial Composite Indexing

### Decision Made
Expenses are deleted via soft deletion by recording a timestamp:
```sql
UPDATE expenses
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = $1;
```
Physical `DELETE` operations on expenses and their shares are prohibited.

To maintain query efficiency as historical records grow, a partial composite B-tree index was created:
```sql
CREATE INDEX idx_expenses_flat_active
ON expenses(flat_id, created_at DESC, id DESC)
WHERE deleted_at IS NULL;
```

### Alternatives Considered
1. **Hard Physical Deletion (`DELETE FROM expenses WHERE id = $1`)**:
   - *Why rejected*: Permanently deleting rows destroys the financial audit trail, preventing reconciliation of past settlement disputes and eliminating recovery options for accidental deletions.
2. **Standard Full-Table Index (`expenses(flat_id, created_at DESC)`)**:
   - *Why rejected*: An unrestricted index indexes every soft-deleted row alongside active rows. Over time, as deleted expenses accumulate, the index bloats, wasting buffer pool memory and requiring the query engine to filter out soft-deleted entries after index traversal.
3. **Partial Composite Indexing (Selected)**:
   - *Selected*: The partial predicate `WHERE deleted_at IS NULL` restricts the index exclusively to live expenses, keeping the index compact and cache-efficient. The composite column ordering `(flat_id, created_at DESC, id DESC)` directly reflects the application's primary listing query:
     ```sql
     SELECT ... FROM expenses
     WHERE flat_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4;
     ```
     This index structure is designed to support both the filtering condition and the requested sort order efficiently, allowing the query planner to evaluate ordered pagination queries with minimal disk I/O.

---

## 4. Member Departure and Historical Ledger Integrity

### Decision Made
When a user leaves a flat (`POST /api/flats/:flatId/leave`), their membership record is retained in `flat_memberships` with `left_at = NOW()`.

Departed members are immediately blocked by route-level authorization middleware from accessing the flat's expenses, creating new expenses, or participating in new splits. However, their historical expenses, shares, and calculated net balance remain included in the flat's `/api/flats/:flatId/balances` calculation.

### Alternatives Considered
1. **Hard Deletion of Membership (`DELETE FROM flat_memberships`)**:
   - *Why rejected*: Cascading this deletion would remove the user's historical expenses and shares, altering past flat spending and unfairly shifting financial liabilities to remaining flatmates. Restricting the deletion (`ON DELETE RESTRICT`) would cause foreign key failures.
2. **Excluding Departed Members from the Balances Query**:
   - *Why rejected*: If a member who owes money leaves the flat and is subsequently omitted from balance calculations, the sum of remaining members' net balances would no longer equal zero. The flat's ledger would become unbalanced, making fair settlement mathematically impossible.
3. **Soft Membership Deactivation with Preserved Balance Calculation (Selected)**:
   - *Selected*: Retaining departed members with `left_at IS NOT NULL` maintains the relational integrity of all past transactions and preserves the zero-sum ledger invariant ($\sum \text{Net Balances} = 0$). Concurrently, backend authorization checks reject departed users from querying or modifying current flat data.

---

## 5. Stable Secondary Sorting for Pagination

### Decision Made
All paginated expense listing queries enforce a compound deterministic ordering:
```sql
ORDER BY e.created_at DESC, e.id DESC
LIMIT $3 OFFSET $4;
```

### Alternatives Considered
1. **Sorting Solely by `created_at DESC`**:
   - *Why rejected*: Timestamps can collide when expenses are created programmatically, imported in batches, or seeded in migration scripts. In PostgreSQL, when an `ORDER BY` clause does not establish a strict total ordering across all rows, the order of rows with identical sort keys is undefined. When clients page through results using `LIMIT` and `OFFSET`, rows sharing identical timestamps can shift positions between queries, resulting in duplicated or skipped items on subsequent pages.
2. **Sorting by `created_at DESC, id DESC` (Selected)**:
   - *Selected*: Because `id` is a UUID primary key (guaranteed distinct for every row), appending `id DESC` as a secondary sort key creates an unambiguous, deterministic total order. Every expense occupies a stable position across pagination boundaries, ensuring consistent pagination for both user navigation and automated integration tests.
