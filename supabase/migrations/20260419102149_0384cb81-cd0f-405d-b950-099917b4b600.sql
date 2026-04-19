-- 1) Cleanup orphan auto entries (purchase invoices that no longer exist)
DELETE FROM transactions
WHERE source_type IN ('production_purchase','production_purchase_payment')
  AND idempotency_key ~ '^pmpp?_[0-9a-f-]{36}$'
  AND NOT EXISTS (
    SELECT 1 FROM material_purchases mp
    WHERE mp.id::text = substring(transactions.idempotency_key from '[0-9a-f-]{36}')
  );

DELETE FROM transactions
WHERE source_type IN ('production_sale','production_sale_payment','production_cogs','production_sale_expense')
  AND idempotency_key ~ '^[a-z]+_[0-9a-f-]{36}'
  AND NOT EXISTS (
    SELECT 1 FROM production_sales ps
    WHERE ps.id::text = substring(transactions.idempotency_key from '[0-9a-f-]{36}')
  );

-- 2) Trigger: when a material_purchases row is deleted, cascade-delete its auto ledger entries
CREATE OR REPLACE FUNCTION public.cleanup_purchase_auto_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM transactions
  WHERE idempotency_key IN ('pmp_' || OLD.id::text, 'pmpp_' || OLD.id::text)
     OR (OLD.transaction_id IS NOT NULL AND id = OLD.transaction_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_purchase_auto_entries ON material_purchases;
CREATE TRIGGER trg_cleanup_purchase_auto_entries
BEFORE DELETE ON material_purchases
FOR EACH ROW EXECUTE FUNCTION public.cleanup_purchase_auto_entries();

-- 3) Trigger: when a production_sales row is deleted, cascade-delete its auto ledger entries
CREATE OR REPLACE FUNCTION public.cleanup_sale_auto_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM transactions
  WHERE idempotency_key LIKE 'psale_' || OLD.id::text || '%'
     OR idempotency_key LIKE 'psp_' || OLD.id::text || '%'
     OR idempotency_key LIKE 'pcogs_' || OLD.id::text || '%'
     OR idempotency_key LIKE 'psexp_' || OLD.id::text || '%'
     OR (OLD.transaction_id IS NOT NULL AND id = OLD.transaction_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_sale_auto_entries ON production_sales;
CREATE TRIGGER trg_cleanup_sale_auto_entries
BEFORE DELETE ON production_sales
FOR EACH ROW EXECUTE FUNCTION public.cleanup_sale_auto_entries();