
-- 1. Fix the Fund Transfer logic to ensure two transactions are created (or at least handled by recalculate)
-- However, the user wants a consolidated source of truth.
-- Let's update get_dashboard_snapshot to be robust.

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_company_users UUID[];
  v_total_liquidity NUMERIC;
  v_total_in NUMERIC;
  v_total_out NUMERIC;
  v_total_expenses NUMERIC;
  v_total_receivables NUMERIC;
  v_total_payables NUMERIC;
  v_shipping_receivables NUMERIC;
  v_ledger_debit NUMERIC;
  v_ledger_credit NUMERIC;
  v_project_profit NUMERIC;
  v_container_profit NUMERIC;
  v_production_sales NUMERIC;
  v_production_cost NUMERIC;
  v_production_expenses NUMERIC;
  v_production_materials_value NUMERIC;
  v_production_products_value NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_company_users := ARRAY(SELECT company_user_ids());

  -- 1. السيولة - نحسبها من القيود الفعلية لضمان الدقة (Source of Truth)
  SELECT
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0)
  INTO v_total_liquidity
  FROM transactions
  WHERE user_id = ANY(v_company_users) AND fund_id IS NOT NULL;

  -- 2. الإيرادات والمصاريف التشغيلية (تستثني التحويلات لأنها ليست ربحاً أو خسارة)
  SELECT
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_total_in, v_total_out, v_total_expenses
  FROM transactions
  WHERE user_id = ANY(v_company_users) AND category != 'fund_transfer';

  -- 3. المستحقات والمطلوبات (من جدول الديون)
  SELECT
    COALESCE(SUM(CASE WHEN type = 'receivable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'payable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0)
  INTO v_total_receivables, v_total_payables
  FROM debts WHERE user_id = ANY(v_company_users);

  -- 4. مستحقات الشحن (من الفواتير غير المدفوعة)
  BEGIN
    SELECT COALESCE(SUM(remaining), 0) INTO v_shipping_receivables
    FROM v_invoice_balance
    WHERE user_id = ANY(v_company_users) AND calc_status != 'paid';
  EXCEPTION WHEN OTHERS THEN
    v_shipping_receivables := 0;
  END;

  -- 5. إجماليات الدفتر (نحسبها من القيود مباشرة لضمان مطابقة الواقع)
  SELECT
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0), -- Debit
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0)  -- Credit
  INTO v_ledger_debit, v_ledger_credit
  FROM transactions WHERE user_id = ANY(v_company_users) AND contact_id IS NOT NULL;

  -- 6. أرباح المشاريع
  SELECT COALESCE(SUM(profit), 0) INTO v_project_profit
  FROM projects
  WHERE user_id = ANY(v_company_users) AND status = 'completed';

  -- 7. أرباح الحاويات
  SELECT COALESCE(SUM(profit), 0) INTO v_container_profit
  FROM containers
  WHERE user_id = ANY(v_company_users) AND status = 'delivered';

  -- 8. الإنتاج
  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(cost_at_sale), 0),
    COALESCE(SUM(expenses_total), 0)
  INTO v_production_sales, v_production_cost, v_production_expenses
  FROM production_sales WHERE user_id = ANY(v_company_users);

  SELECT COALESCE(SUM(quantity * avg_cost), 0) INTO v_production_materials_value
  FROM production_materials WHERE user_id = ANY(v_company_users);

  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_production_products_value
  FROM production_products WHERE user_id = ANY(v_company_users);

  RETURN json_build_object(
    'totalLiquidity', v_total_liquidity,
    'netCompanyProfit', v_total_in - v_total_out,
    'totalExpenses', v_total_expenses,
    'totalIncome', v_total_in,
    'totalOutcome', v_total_out,
    'totalReceivables', v_total_receivables + v_shipping_receivables,
    'totalPayables', v_total_payables,
    'shippingReceivables', v_shipping_receivables,
    'ledgerDebit', v_ledger_debit,
    'ledgerCredit', v_ledger_credit,
    'ledgerNet', v_ledger_debit - v_ledger_credit,
    'projectProfit', v_project_profit,
    'containerProfit', v_container_profit,
    'productionSales', v_production_sales,
    'productionCost', v_production_cost,
    'productionExpenses', v_production_expenses,
    'productionMaterialsValue', v_production_materials_value,
    'productionProductsValue', v_production_products_value,
    'computedAt', extract(epoch from now())
  );
END;
$function$;
