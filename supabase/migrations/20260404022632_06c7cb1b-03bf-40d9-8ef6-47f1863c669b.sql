
CREATE OR REPLACE VIEW public.v_contact_balance AS
SELECT 
  contact_id,
  user_id,
  count(*) AS total_transactions,
  COALESCE(sum(CASE WHEN type = 'in'::transaction_type THEN amount ELSE 0::numeric END), 0::numeric) AS total_debit,
  COALESCE(sum(CASE WHEN type = 'out'::transaction_type THEN amount ELSE 0::numeric END), 0::numeric) AS total_credit,
  COALESCE(sum(CASE WHEN type = 'in'::transaction_type THEN amount ELSE -amount END), 0::numeric) AS balance
FROM transactions t
WHERE contact_id IS NOT NULL
GROUP BY contact_id, user_id;
