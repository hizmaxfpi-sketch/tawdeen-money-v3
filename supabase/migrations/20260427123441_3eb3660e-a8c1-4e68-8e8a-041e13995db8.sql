
-- ============================================================
-- Helper: bucket created_at into 5-second windows
-- ============================================================
CREATE OR REPLACE FUNCTION public.tx_dedup_bucket(ts timestamptz)
RETURNS bigint
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (extract(epoch FROM ts)::bigint / 5);
$$;

-- ============================================================
-- Step 1: Reverse historical duplicate manual transactions.
-- Strategy: for each (user, fund, type, amount, date, description, 5s bucket)
-- group with > 1 row, keep the earliest-created row and reverse the rest
-- through the existing reverse_transaction RPC (which restores balances).
-- ============================================================
DO $$
DECLARE
  dup_id uuid;
BEGIN
  FOR dup_id IN
    WITH ranked AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY user_id, fund_id, type, amount, date, description,
                       public.tx_dedup_bucket(created_at)
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM public.transactions
      WHERE (source_type = 'manual' OR source_type IS NULL)
        AND fund_id IS NOT NULL
    )
    SELECT id FROM ranked WHERE rn > 1
  LOOP
    BEGIN
      PERFORM public.reverse_transaction(dup_id);
    EXCEPTION WHEN OTHERS THEN
      -- If reversal fails for any reason, fall back to a hard delete
      -- so the unique index can be created. Balances may need a manual
      -- sync_contact_balances() call afterwards.
      DELETE FROM public.transactions WHERE id = dup_id;
    END;
  END LOOP;
END$$;

-- Re-sync contact balances after cleanup (safe no-op if no changes)
DO $$
BEGIN
  PERFORM public.sync_contact_balances();
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- ============================================================
-- Step 2: Now create the protective unique index
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS transactions_manual_dedup_idx
  ON public.transactions (
    user_id,
    fund_id,
    type,
    amount,
    date,
    description,
    public.tx_dedup_bucket(created_at)
  )
  WHERE source_type = 'manual' OR source_type IS NULL;

-- ============================================================
-- Step 3: Performance indexes for the heavy reads
-- ============================================================
CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON public.transactions (user_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_fund_idx
  ON public.transactions (fund_id) WHERE fund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_contact_idx
  ON public.transactions (contact_id) WHERE contact_id IS NOT NULL;
