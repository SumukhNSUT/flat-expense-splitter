-- Migration 001: Initial Schema
-- Enables pgcrypto for UUID generation if needed (gen_random_uuid is standard in Postgres 13+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL CHECK (char_length(trim(name)) > 0),
    email VARCHAR(255) NOT NULL UNIQUE CHECK (char_length(trim(email)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Flats Table
CREATE TABLE IF NOT EXISTS flats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL CHECK (char_length(trim(name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Flat Memberships Table
CREATE TABLE IF NOT EXISTS flat_memberships (
    flat_id UUID NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ NULL,
    PRIMARY KEY (flat_id, user_id)
);

-- 4. Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_id UUID NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL CHECK (char_length(trim(description)) > 0),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    paid_by_user_id UUID NOT NULL REFERENCES users(id),
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- 5. Expense Shares Table
CREATE TABLE IF NOT EXISTS expense_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    CONSTRAINT uq_expense_shares_expense_user UNIQUE (expense_id, user_id)
);

-- Performance Indexes

-- Partial composite index for listing non-deleted expenses for a flat in reverse chronological order
-- Why useful:
-- 1. Partial: Filters out soft-deleted expenses at index level, drastically reducing index size and cache footprint.
-- 2. Composite (flat_id, created_at DESC, id DESC): Satisfies WHERE flat_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC
--    directly through an index scan with no sorting step in memory (avoids Sort node in EXPLAIN).
CREATE INDEX IF NOT EXISTS idx_expenses_flat_active 
ON expenses(flat_id, created_at DESC, id DESC) 
WHERE deleted_at IS NULL;

-- Index for balance calculations filtering non-deleted expenses by flat_id and paid_by_user_id
CREATE INDEX IF NOT EXISTS idx_expenses_balance_paid 
ON expenses(flat_id, paid_by_user_id) 
WHERE deleted_at IS NULL;

-- Indexes on foreign keys for fast joins and aggregations
CREATE INDEX IF NOT EXISTS idx_expense_shares_expense_id ON expense_shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_shares_user_id ON expense_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_flat_memberships_user_id ON flat_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_flat_memberships_active ON flat_memberships(flat_id, user_id) WHERE left_at IS NULL;
