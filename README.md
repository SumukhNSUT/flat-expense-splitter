# Flatmate Ledger

**Flatmate Ledger** is a production-quality, full-stack shared flat expense tracking application. It allows people sharing a flat to record shared expenses, split bills between flatmates, track individual balances, and understand who owes whom with plain-language settlement suggestions.

The system is built with a **React + TypeScript frontend**, an **Express.js + TypeScript REST API**, and a **PostgreSQL database** accessed directly using the `pg` library with raw SQL queries and Common Table Expressions (CTEs).

---

## Quick Start (5 Commands)

Get the complete application running locally with PostgreSQL, database migrations, seed data, frontend, and backend in five commands:

```bash
# 1. Install all dependencies across the monorepo
npm install

# 2. Start PostgreSQL 16 container via Docker Compose
npm run docker:up

# 3. Apply SQL migrations to the database
npm run db:migrate

# 4. Populate realistic seed data (flats, users, expenses)
npm run db:seed

# 5. Start both Frontend (Vite) and Backend (Express) in development mode
npm run dev
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000](http://localhost:4000)
- **API Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## Key Features

1. **Deterministic Equal Money Splitting**:
   - Uses **pure integer arithmetic** in paise (1 INR = 100 paise).
   - Base share is calculated using integer division (`total / count`).
   - Remainder paise are distributed deterministically (1 paise at a time) according to lexicographical user ID order.
   - Zero floating-point rounding errors. Sum of all shares **strictly equals** the total expense amount.
2. **Aggregated Balances with Raw SQL**:
   - Uses genuine SQL JOINs and separate aggregate Common Table Expressions (CTEs) for total payments and total shares.
   - Prevents Cartesian explosion and row multiplication.
   - Mathematical invariant: Sum of all member net balances **always equals zero** for any flat.
3. **Soft Deletion**:
   - Expenses are soft-deleted via `deleted_at = NOW()`.
   - Excluded instantly from listings and balance aggregations while preserving historical records.
4. **Flat Member Lifecycle & Historical Integrity**:
   - Active members can leave a flat via `POST /api/flats/:flatId/leave` (sets `left_at = NOW()`).
   - Departed members immediately lose access to flat operations.
   - Historical contributions and shares of departed members remain in the ledger so remaining flatmates' balances are not corrupted.
5. **Deterministic Settlement Suggestions**:
   - Plain-language settlement recommendations (e.g., *"Aarav owes Riya ₹450.00"*).
   - Greedy debtor-creditor matching algorithm without database mutation.
6. **Caller Identity & Testing Switcher**:
   - Trusted `X-User-Id` header-based caller identity.
   - Visual demo user selector in the UI sidebar to seamlessly switch perspective between flatmates.

---

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Lucide React icons.
- **Backend**: Node.js 22, Express.js, TypeScript, PostgreSQL (using direct `pg` pool queries), Zod schema validation.
- **Testing**: Vitest, Supertest, PostgreSQL-backed integration test suite.
- **Infrastructure**: Docker Compose (PostgreSQL 16 Alpine), GitHub Actions CI.

---

## Monorepo Architecture

```
flatmate-ledger/
├── apps/
│   ├── api/                     # Node.js + Express TypeScript REST API
│   │   ├── src/
│   │   │   ├── db/              # pg Pool, migration runner, seed runner
│   │   │   ├── errors/          # Custom ApiError hierarchy
│   │   │   ├── middleware/      # Auth, membership check, central error handler
│   │   │   ├── routes/          # Health, demo users, flats, expenses, balances
│   │   │   ├── utils/           # Integer split and settlement algorithms
│   │   │   ├── server.ts        # Express app configuration
│   │   │   └── index.ts         # Server entry point
│   │   └── test/
│   │       ├── unit/            # Money splitting & settlement unit tests
│   │       └── integration/     # PostgreSQL-backed API integration tests
│   └── web/                     # React + Vite TypeScript frontend
│       ├── src/
│       │   ├── components/      # Sidebar, Header, Modal, ConfirmDialog, EmptyState
│       │   ├── context/         # AppContext (active user, flat, refresh state)
│       │   ├── pages/           # Dashboard, Expenses, Balances, Members
│       │   ├── services/        # Fetch API client with X-User-Id header injection
│       │   └── utils/           # Currency formatting and safe paise parser
│       └── vite.config.ts       # Vite proxy config
├── database/
│   ├── migrations/              # SQL schema migration files
│   └── seeds/                   # Seed data SQL files
├── .github/
│   └── workflows/ci.yml         # GitHub Actions CI workflow
├── docker-compose.yml           # PostgreSQL container definition
├── .env.example                 # Environment configuration template
├── package.json                 # Monorepo workspaces definition
├── README.md                    # Project documentation
├── DECISIONS.md                 # Architecture and technical decisions
├── PREVIOUS_WORK.md             # Prior project discussion
└── AI_USAGE.md                  # Development tools & debugging notes
```

---

## Database Schema

```mermaid
erDiagram
    users ||--o{ flat_memberships : has
    flats ||--o{ flat_memberships : contains
    flats ||--o{ expenses : contains
    users ||--o{ expenses : "paid by / created by"
    expenses ||--o{ expense_shares : has
    users ||--o{ expense_shares : assigned

    users {
        uuid id PK
        varchar name
        varchar email
        timestamptz created_at
    }

    flats {
        uuid id PK
        varchar name
        timestamptz created_at
    }

    flat_memberships {
        uuid flat_id FK
        uuid user_id FK
        timestamptz joined_at
        timestamptz left_at
    }

    expenses {
        uuid id PK
        uuid flat_id FK
        varchar description
        bigint amount_paise
        uuid paid_by_user_id FK
        uuid created_by_user_id FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    expense_shares {
        uuid id PK
        uuid expense_id FK
        uuid user_id FK
        bigint amount_paise
    }
```

### Partial Composite Index

```sql
CREATE INDEX idx_expenses_flat_active 
ON expenses(flat_id, created_at DESC, id DESC) 
WHERE deleted_at IS NULL;
```

**Why this index is critical:**
1. **Partial Filtering**: Excludes all soft-deleted records directly at the B-tree index level, keeping the index compact and cache-resident.
2. **Sort Elimination**: The index order `(flat_id, created_at DESC, id DESC)` precisely matches the query's `WHERE flat_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`. PostgreSQL satisfies this with a pure Index Scan with zero runtime in-memory sorting.

---

## Seed Data & Demo Users

The database is seeded with two flats and seven realistic members:

### Flat 1: Maple Residency (`11111111-1111-1111-1111-111111111111`)

| Name | Email | User UUID |
| :--- | :--- | :--- |
| **Sumukh Bansal** (Default) | `sumukh@example.com` | `00000000-0000-0000-0000-000000000001` |
| **Aarav Sharma** | `aarav@example.com` | `00000000-0000-0000-0000-000000000002` |
| **Riya Verma** | `riya@example.com` | `00000000-0000-0000-0000-000000000003` |
| **Karan Mehta** | `karan@example.com` | `00000000-0000-0000-0000-000000000004` |

### Flat 2: Cedar Heights (`22222222-2222-2222-2222-222222222222`)

| Name | Email | User UUID |
| :--- | :--- | :--- |
| **Dev Malhotra** | `dev@example.com` | `00000000-0000-0000-0000-000000000005` |
| **Ananya Singh** | `ananya@example.com` | `00000000-0000-0000-0000-000000000006` |
| **Ishaan Gupta** | `ishaan@example.com` | `00000000-0000-0000-0000-000000000007` |

---

## REST API Reference

All protected endpoints require the caller identification header:
`X-User-Id: <user-uuid>`

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check | `200` |
| `GET` | `/api/demo-users` | List demo users and their flat memberships | `200` |
| `GET` | `/api/flats` | List flats for caller identity | `200`, `401` |
| `GET` | `/api/flats/:flatId/members` | Get active and departed members of a flat | `200`, `401`, `403` |
| `POST` | `/api/flats/:flatId/leave` | Leave flat (records `left_at` timestamp) | `200`, `400`, `401`, `403` |
| `GET` | `/api/flats/:flatId/expenses` | Paginated non-deleted expenses (newest first) | `200`, `401`, `403` |
| `POST` | `/api/flats/:flatId/expenses` | Create new expense with transactional shares | `201`, `400`, `401`, `403` |
| `PUT` | `/api/flats/:flatId/expenses/:expenseId` | Update expense & replace shares (creator only) | `200`, `400`, `401`, `403`, `404` |
| `DELETE` | `/api/flats/:flatId/expenses/:expenseId` | Soft delete expense (creator only) | `200`, `401`, `403`, `404` |
| `GET` | `/api/flats/:flatId/balances` | Aggregated balances (SQL CTE) & settlements | `200`, `401`, `403` |

### Standard Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted data.",
    "details": {
      "amountPaise": "Amount must be greater than zero."
    }
  }
}
```

---

## Example API Requests (cURL)

### 1. Record a Shared Grocery Bill (₹1,500.00 = 150000 paise)
```bash
curl -X POST http://localhost:4000/api/flats/11111111-1111-1111-1111-111111111111/expenses \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "description": "Weekly Groceries",
    "amountPaise": 150000,
    "paidByUserId": "00000000-0000-0000-0000-000000000001",
    "splitBetweenUserIds": [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000003"
    ]
  }'
```

### 2. Fetch Flat Balances & Settlement Suggestions
```bash
curl -X GET http://localhost:4000/api/flats/11111111-1111-1111-1111-111111111111/balances \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001"
```

### 3. Leave a Flat
```bash
curl -X POST http://localhost:4000/api/flats/11111111-1111-1111-1111-111111111111/leave \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000004"
```

---

## Automated Testing

The project includes unit tests for money calculation and settlement logic, as well as integration tests backed by an isolated PostgreSQL test database (`flatmate_ledger_test`).

Run all tests:
```bash
npm run test
```

### Test Coverage Highlights:
- **Integer Split Invariant**: Property-based test iterating over 1,000 distinct totals and participant counts verifying that the sum of shares strictly equals the original total with 0 paise loss.
- **Equal & Uneven Remainder**: Correct deterministic distribution of remainder paise (e.g. 100 paise between 3 participants = 34, 33, 33).
- **Authentication**: Rejection of missing, malformed, or unauthorized `X-User-Id`.
- **Flat Isolation**: Rejection of cross-flat resource access (403 Forbidden).
- **Ownership Verification**: Only expense creators can edit or soft-delete expenses.
- **Soft Deletion Removal**: Verifying that soft-deleted items vanish from listings and balance calculations.
- **Zero-Sum Ledger**: SQL CTE balances query verification ensuring the sum of net balances is zero.
- **Stable Pagination**: Secondary sort by `id DESC` when timestamps match.
- **Departed Members**: Access revocation upon leaving, while historical balances remain preserved.

---

## Production Build & Verification

```bash
# Type check and build both apps
npm run build
```

Both apps build into their respective `dist/` directories without warnings or errors.
