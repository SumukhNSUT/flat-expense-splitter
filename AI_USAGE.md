# AI Usage & Collaborative Engineering Log

This document provides a transparent and accurate record of how AI assistance was utilized during the development of the **Flatmate Ledger** take-home project, including tools used, their specific contributions, genuine technical issues discovered and resolved during development, and the manual engineering reviews conducted.

---

## 1. AI Tools Used

- **Google Antigravity**
- **ChatGPT**

---

## 2. Roles and Assistance Provided

AI assistance was utilized across the following development workflows:
- **Project Scaffolding**: Initial monorepo layout setup using npm workspaces (`apps/web`, `apps/api`), Docker Compose container configuration for PostgreSQL 16, and GitHub Actions CI workflow templating.
- **Architecture & Implementation Guidance**: Designing the layered backend structure (middleware, routes, controllers, error hierarchy) and establishing integer-only monetary handling.
- **PostgreSQL Schema & SQL Query Assistance**: Drafting relational schemas with foreign keys, constraints, and designing the aggregated Common Table Expression (CTE) query for member balance calculations.
- **Backend & React Development**: Generating boilerplate route handlers, request validation schemas using Zod, and foundational React components with Tailwind CSS styling.
- **Test Generation & Debugging**: Drafting Vitest test suites, including integration test scenarios using Supertest and property-based test routines for remainder splitting.
- **Documentation Assistance**: Drafting initial documentation templates for the assignment deliverables.
- **Code Review & Verification**: Reviewing edge cases for input validation, pagination boundary conditions, and relational constraints.

---

## 3. Genuine Development Issues Discovered & Resolved

### Issue 1: Monorepo Development Startup Script Execution
- **Context**: The root `package.json` was initially configured with:
  ```json
  "dev": "npm run dev --workspaces"
  ```
- **The Issue**: When executing `npm run dev`, npm ran the development command in the first workspace (`apps/api`) as a blocking foreground process. Because the API server ran continuously, npm never launched the second workspace (`apps/web`) in the same terminal session as expected.
- **Resolution**: Identified the issue during manual runtime testing. Replaced the workspace script with `concurrently`:
  ```json
  "dev": "concurrently -k -n API,WEB -c blue,green \"npm run dev --workspace=apps/api\" \"npm run dev --workspace=apps/web\""
  ```
  Verified that both the Express API (port 4000) and the Vite development server (port 5173) start reliably and output to the terminal concurrently.

### Issue 2: Test Helper Query Omitted Expense Shares, Violating Ledger Zero-Sum Invariant
- **Context**: In `apps/api/test/integration/api.test.ts`, Test Scenario 14 was written to verify stable secondary sorting (`ORDER BY created_at DESC, id DESC`) when expenses share identical timestamps.
- **The Issue**: A raw SQL test query inserted two expenses directly into the `expenses` table (`Same time 1` and `Same time 2`, each ₹10.00 / 1000 paise paid by `SUMUKH_ID`), but did not insert matching records into `expense_shares`.
- **How It Was Discovered**: When the subsequent test scenario (Scenario 16: *preserves historical balances of departed member so flat net sum remains 0*) executed, Vitest failed with:
  ```
  AssertionError: expected 2000 to be +0
  - Expected: 0
  + Received: 2000
  ```
  Because the two test expenses credited ₹20.00 to `total_paid_paise` without any corresponding debits in `total_share_paise`, the net balance sum for the flat became ₹20.00 instead of ₹0.00.
- **Resolution**: Updated the test helper to insert corresponding records into `expense_shares` for each test expense, immediately satisfying the zero-sum ledger invariant and passing all 28 automated tests.

### Issue 3: Missing Ambient Vite Client Type Declarations
- **Context**: In `apps/web/src/services/api.ts`, environment-based API URL configuration was accessed using `import.meta.env.VITE_API_URL`.
- **The Issue**: Running `npm run build` failed with TypeScript error:
  ```
  TS2339: Property 'env' does not exist on type 'ImportMeta'
  ```
  The build failed because ambient Vite client types were not loaded in the web application's TypeScript compilation context.
- **Resolution**: Added `apps/web/src/vite-env.d.ts` containing `/// <reference types="vite/client" />`, resolving the type definitions and allowing production builds to complete cleanly.

---

## 4. Manual Reviews and Verifications Conducted

All application code, queries, and behaviors were manually inspected, reviewed, and verified through execution:
- **Database Schema and Relationships**: Verified all tables, foreign keys, cascade behaviors, and the partial composite index `idx_expenses_flat_active`.
- **Integer Paise Calculation**: Reviewed that no floating-point conversions or `Math.round()` calls are used in the monetary calculation pipeline.
- **Uneven Remainder Splitting**: Verified that remainder paise are distributed deterministically across sorted user UUIDs and verified that the sum of shares strictly equals the total amount.
- **Database-Persisted Expense Shares**: Inspected SQL queries in PostgreSQL to confirm that shares are created and replaced transactionally inside atomic database transactions (`BEGIN ... COMMIT`).
- **Balance Calculations**: Verified the execution of the CTE aggregation query directly in `psql` to confirm that net balances strictly sum to zero across all flat members.
- **Authorization and Soft Deletion**: Verified that non-creators cannot edit or delete expenses, departed members are blocked from flat resources, and soft-deleted records immediately vanish from listings and balances.
- **Automated Test Results**: Executed and verified the full 28-test test suite against an isolated PostgreSQL database.
- **Application Startup and API Connectivity**: Verified dual-server startup via `concurrently` and verified end-to-end communication between the React frontend and Express backend.
