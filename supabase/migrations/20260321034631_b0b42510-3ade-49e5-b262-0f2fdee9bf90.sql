-- Create admin version of sync_contact_balances that accepts user_id parameter
CREATE OR REPLACE FUNCTION public.sync_contact_balances_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE contacts c SET
    total_debit = COALESCE(v.total_debit, 0),
    total_credit = COALESCE(v.total_credit, 0),
    balance = COALESCE(v.balance, 0),
    total_transactions = COALESCE(v.total_transactions, 0)
  FROM v_contact_balance v
  WHERE c.id = v.contact_id
    AND c.user_id = p_user_id;

  UPDATE contacts SET
    total_debit = 0, total_credit = 0, balance = 0, total_transactions = 0
  WHERE user_id = p_user_id
    AND id NOT IN (SELECT contact_id FROM v_contact_balance WHERE contact_id IS NOT NULL);
END;
$function$;