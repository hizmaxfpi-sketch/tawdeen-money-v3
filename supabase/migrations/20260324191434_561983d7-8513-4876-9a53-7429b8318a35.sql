
-- Helper function for company access verification in RPCs
CREATE OR REPLACE FUNCTION public.verify_company_access(_target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles a
    JOIN user_roles b ON a.company_id = b.company_id
    WHERE a.user_id = auth.uid() AND a.is_active = true
    AND b.user_id = _target_user_id
  )
$$;

-- Update get_financial_summary to be company-wide
CREATE OR REPLACE FUNCTION public.get_financial_summary()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_result JSON;
  v_total_liquidity NUMERIC;
  v_total_in NUMERIC;
  v_total_out NUMERIC;
  v_total_expenses NUMERIC;
  v_total_receivables NUMERIC;
  v_total_payables NUMERIC;
  v_shipping_receivables NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(SUM(balance), 0) INTO v_total_liquidity FROM funds WHERE user_id IN (SELECT company_user_ids());
  SELECT
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_total_in, v_total_out, v_total_expenses
  FROM transactions WHERE user_id IN (SELECT company_user_ids()) AND category != 'fund_transfer';

  SELECT
    COALESCE(SUM(CASE WHEN type = 'receivable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'payable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0)
  INTO v_total_receivables, v_total_payables
  FROM debts WHERE user_id IN (SELECT company_user_ids());

  SELECT COALESCE(SUM(remaining), 0) INTO v_shipping_receivables
  FROM v_invoice_balance WHERE user_id IN (SELECT company_user_ids()) AND calc_status != 'paid';

  v_result := json_build_object(
    'totalLiquidity', v_total_liquidity,
    'netCompanyProfit', v_total_in - v_total_out,
    'totalExpenses', v_total_expenses,
    'totalReceivables', v_total_receivables + v_shipping_receivables,
    'totalPayables', v_total_payables,
    'totalIncome', v_total_in,
    'totalOutcome', v_total_out,
    'shippingReceivables', v_shipping_receivables
  );
  RETURN v_result;
END;
$function$;

-- Update sync_contact_balances to be company-wide
CREATE OR REPLACE FUNCTION public.sync_contact_balances()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE contacts c SET
    total_debit = COALESCE(v.total_debit, 0),
    total_credit = COALESCE(v.total_credit, 0),
    balance = COALESCE(v.balance, 0),
    total_transactions = COALESCE(v.total_transactions, 0)
  FROM v_contact_balance v
  WHERE c.id = v.contact_id
    AND c.user_id IN (SELECT company_user_ids());

  UPDATE contacts SET
    total_debit = 0, total_credit = 0, balance = 0, total_transactions = 0
  WHERE user_id IN (SELECT company_user_ids())
    AND id NOT IN (SELECT contact_id FROM v_contact_balance WHERE contact_id IS NOT NULL);
END;
$function$;
