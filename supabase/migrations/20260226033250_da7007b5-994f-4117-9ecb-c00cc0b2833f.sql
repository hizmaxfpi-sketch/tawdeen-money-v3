
-- ============= Database View: إحصائيات مالية موحدة لكل مستخدم =============
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
  v_total_liquidity NUMERIC;
  v_total_in NUMERIC;
  v_total_out NUMERIC;
  v_total_expenses NUMERIC;
  v_total_receivables NUMERIC;
  v_total_payables NUMERIC;
  v_shipping_receivables NUMERIC;
BEGIN
  -- 1. السيولة = مجموع أرصدة الصناديق
  SELECT COALESCE(SUM(balance), 0) INTO v_total_liquidity FROM funds WHERE user_id = p_user_id;

  -- 2. الإيرادات والمصروفات (بدون التحويلات بين الصناديق)
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_total_in, v_total_out, v_total_expenses
  FROM transactions 
  WHERE user_id = p_user_id AND category != 'fund_transfer';

  -- 3. المستحقات والالتزامات من الديون
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'receivable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'payable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0)
  INTO v_total_receivables, v_total_payables
  FROM debts WHERE user_id = p_user_id;

  -- 4. مستحقات الشحن
  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_shipping_receivables
  FROM shipments WHERE user_id = p_user_id AND payment_status != 'paid';

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
$$;
