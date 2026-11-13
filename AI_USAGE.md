# AI Usage & Collaborative Engineering Log

This document provides a transparent and honest record of how AI assistance was utilized during the development of the **Flatmate Ledger** take-home project, including tools used, architectural guidance, genuine mistakes discovered during development, and the manual technical verification applied.

---

## 1. AI Tools Used

- **Google Antigravity Assistant (Gemini 3.8 Flash)**: Used as an interactive full-stack architectural assistant, pair programmer, and test suite design collaborator.

---

## 2. What the AI Tool Helped With

1. **Scaffolding and Configuration**:
   - Setting up npm workspaces for the monorepo (`apps/web`, `apps/api`).
   - Generating standard Docker Compose configuration for PostgreSQL 16 Alpine and GitHub Actions CI workflow syntax.
2. **SQL Query Design & CTE Drafting**:
   - Drafting the initial Common Table Expression (CTE) query structure for `/api/flats/:flatId/balances` to ensure separate aggregations for payments and shares before joining against flat memberships.
3. **Property-Based Testing Generation**:
   - Generating a 1,000-iteration randomized simulation test verifying that integer division and remainder distribution never lose or gain a single paise across arbitrary participant counts.
4. **UI Component Templates**:
   - Drafting initial Tailwind CSS markup for the financial metric cards and settlement cards.

---

## 3. Genuine AI Mistakes Discovered & Resolved During Development

### Mistake 1: Raw SQL Database Seeding Broke the Zero-Sum Ledger Invariant in Integration Tests
- **Context**: In `apps/api/test/integration/api.test.ts`, Test Scenario 14 was written to verify stable secondary sorting (`ORDER BY created_at DESC, id DESC`) when two expenses share the identical timestamp.
- **The Issue**: The AI generated a test helper query inserting two raw rows directly into the `expenses` table (`Same time 1` and `Same time 2`, each ₹10.00 / 1000 paise paid by `SUMUKH_ID`), but omitted inserting corresponding `expense_shares` records for those expenses.
- **How It Was Discovered**: When the subsequent test scenario (Scenario 16: *preserves historical balances of departed member so flat net sum remains 0*) ran against the test database, Vitest failed with:
  ```
  AssertionError: expected 2000 to be +0
  - Expected: 0
  + Received: 2000
  ```
  Because the two expenses added ₹20.00 to `total_paid_paise` without any corresponding shares in `total_share_paise`, the net balance sum for the flat became ₹20.00 instead of ₹0.00.
- **Resolution**: Recognized that inserting raw expenses without shares violates the relational integrity of the ledger. The test was updated to insert matching shares for each expense, immediately restoring the zero-sum invariant and passing all 28 tests.

### Mistake 2: Missing Vite Client Types Caused `import.meta.env` Compilation Failure
- **Context**: In `apps/web/src/services/api.ts`, environment-based API URL configuration was written using `import.meta.env.VITE_API_URL`.
- **The Issue**: Running `npm run build` failed with TypeScript error `TS2339: Property 'env' does not exist on type 'ImportMeta'`. The AI did not initially include Vite's ambient client type definitions.
- **Resolution**: Added `apps/web/src/vite-env.d.ts` with `/// <reference types="vite/client" />`, enabling TypeScript to properly type `import.meta.env` across the frontend application.

---

## 4. Parts Written, Refined, or Verified Manually

1. **Integer Split Remainder Tie-Breaking Algorithm**:
   - Ensured the tie-breaker rule was strictly deterministic by explicitly sorting `userIds` lexicographically before allocating remainder paise. Without this, calling the split function with different participant array orderings would assign the remainder to different people.
2. **Relational Constraints & Partial Index**:
   - Designed the composite partial index `idx_expenses_flat_active ON expenses(flat_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` to eliminate runtime in-memory sorting.
3. **Form Currency Handling**:
   - Implemented `parseRupeesToPaise` and `formatPaise` using string splitting and standard integer math rather than `parseFloat(x) * 100`, guarding against floating-point inaccuracies when users enter decimal amounts like `0.99` or `1500.50`.

<!-- TODO: Sumukh, you can add any personal observations or notes about your own code review experience before your interview. -->
