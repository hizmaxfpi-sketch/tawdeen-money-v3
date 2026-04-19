-- Fix legacy production_purchase transactions that were inserted before the direction fix
-- Vendor purchase on credit must be type='out' (we owe the vendor → credit balance)
-- Vendor payment from fund must be type='in' (settling our debt to vendor)

UPDATE public.transactions
SET type = 'out'
WHERE source_type = 'production_purchase'
  AND type = 'in';

UPDATE public.transactions
SET type = 'in'
WHERE source_type = 'production_purchase_payment'
  AND type = 'out';

-- Re-sync contact balances after the correction
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT contact_id, user_id
    FROM public.transactions
    WHERE source_type IN ('production_purchase','production_purchase_payment')
      AND contact_id IS NOT NULL
  LOOP
    UPDATE public.contacts c SET
      total_debit = COALESCE(v.total_debit, 0),
      total_credit = COALESCE(v.total_credit, 0),
      balance = COALESCE(v.balance, 0),
      total_transactions = COALESCE(v.total_transactions, 0)
    FROM public.v_contact_balance v
    WHERE c.id = v.contact_id AND c.id = r.contact_id;
  END LOOP;
END $$;