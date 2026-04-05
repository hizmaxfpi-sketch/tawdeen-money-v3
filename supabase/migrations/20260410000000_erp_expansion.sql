
-- 1. Create transaction_items table for Master-Detail (Bulk entries)
CREATE TABLE IF NOT EXISTS public.transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transaction items" ON public.transaction_items FOR SELECT USING (transaction_id IN (SELECT id FROM transactions WHERE user_id IN (SELECT company_user_ids())));
CREATE POLICY "Users can insert own transaction items" ON public.transaction_items FOR INSERT WITH CHECK (transaction_id IN (SELECT id FROM transactions WHERE user_id = auth.uid()));

-- 2. Update assets table for suppliers and installments
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_installment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS installment_total_amount DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS installments_count INTEGER DEFAULT 1;

-- 2.1 Add asset_id to transactions for better linking
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL;

-- 2.2 Table to track system state (e.g., last depreciation run)
CREATE TABLE IF NOT EXISTS public.system_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own system state" ON public.system_state FOR ALL USING (user_id = auth.uid());

-- 3. Profit Engine: calculate_net_profit RPC
CREATE OR REPLACE FUNCTION public.calculate_net_profit()
 RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
  v_project_profit NUMERIC;
  v_container_profit NUMERIC;
  v_asset_revenue NUMERIC;
  v_operating_expenses NUMERIC;
  v_outstanding_payables NUMERIC;
BEGIN
  -- Sum profits from confirmed columns in schema
  SELECT COALESCE(SUM(profit), 0) INTO v_project_profit FROM projects WHERE user_id IN (SELECT company_user_ids());
  SELECT COALESCE(SUM(profit), 0) INTO v_container_profit FROM containers WHERE user_id IN (SELECT company_user_ids());

  -- Sum asset revenue from transactions
  SELECT COALESCE(SUM(amount), 0) INTO v_asset_revenue
  FROM transactions
  WHERE user_id IN (SELECT company_user_ids())
    AND category = 'asset_revenue';

  -- Sum operating expenses (including depreciation)
  SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
  FROM transactions
  WHERE user_id IN (SELECT company_user_ids())
    AND (category = 'expense' OR category = 'business_expense' OR category = 'asset_depreciation');

  -- Sum outstanding payables
  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_outstanding_payables
  FROM debts
  WHERE user_id IN (SELECT company_user_ids())
    AND type = 'payable'
    AND status != 'paid';

  v_result := json_build_object(
    'projectProfit', v_project_profit,
    'containerProfit', v_container_profit,
    'assetRevenue', v_asset_revenue,
    'operatingExpenses', v_operating_expenses,
    'outstandingPayables', v_outstanding_payables,
    'netProfit', (v_project_profit + v_container_profit + v_asset_revenue) - (v_operating_expenses + v_outstanding_payables)
  );

  RETURN v_result;
END;
$function$;

-- 4. Automated Depreciation Logic
CREATE OR REPLACE FUNCTION public.process_depreciation_cycle()
 RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_asset RECORD;
  v_monthly_dep NUMERIC;
  v_dev_fund_id UUID;
BEGIN
  -- Cycle through active assets
  FOR v_asset IN (SELECT * FROM assets WHERE status = 'active' AND depreciation_rate > 0) LOOP
    v_monthly_dep := (v_asset.value * v_asset.depreciation_rate / 100) / 12;

    -- Update asset value
    UPDATE assets SET
      total_depreciation = LEAST(value, total_depreciation + v_monthly_dep),
      current_value = GREATEST(0, value - (total_depreciation + v_monthly_dep)),
      updated_at = now()
    WHERE id = v_asset.id;

    -- Find Development Fund box
    SELECT id INTO v_dev_fund_id FROM funds WHERE name = 'صندوق التطوير' AND user_id = v_asset.user_id;

    IF v_dev_fund_id IS NOT NULL THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, asset_id, source_type)
      VALUES (v_asset.user_id, 'in', 'asset_depreciation', v_monthly_dep, 'قسط إهلاك أصل: ' || v_asset.name, CURRENT_DATE, v_dev_fund_id, v_asset.id, 'manual');

      UPDATE funds SET balance = balance + v_monthly_dep WHERE id = v_dev_fund_id;
    END IF;
  END LOOP;
END;
$function$;

-- 4.1 Trigger to run depreciation monthly on admin access
CREATE OR REPLACE FUNCTION public.trigger_monthly_depreciation()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_last_run TEXT;
  v_current_month TEXT;
BEGIN
  v_user_id := auth.uid();
  v_current_month := to_char(CURRENT_DATE, 'YYYY-MM');

  -- Check if user is admin
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role = 'admin') THEN
    SELECT value INTO v_last_run FROM system_state WHERE user_id = v_user_id AND key = 'last_depreciation_run';

    IF v_last_run IS NULL OR v_last_run != v_current_month THEN
      PERFORM process_depreciation_cycle();

      INSERT INTO system_state (user_id, key, value, updated_at)
      VALUES (v_user_id, 'last_depreciation_run', v_current_month, now())
      ON CONFLICT (user_id, key) DO UPDATE SET value = v_current_month, updated_at = now();

      RETURN json_build_object('status', 'executed', 'month', v_current_month);
    END IF;
  END IF;

  RETURN json_build_object('status', 'skipped');
END;
$$;

-- 5. Asset-to-Debt link trigger
CREATE OR REPLACE FUNCTION public.handle_asset_installment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_installment AND NEW.supplier_id IS NOT NULL AND NEW.installment_total_amount > 0 THEN
    INSERT INTO debts (user_id, type, contact_id, original_amount, remaining_amount, status, description, due_date)
    VALUES (NEW.user_id, 'payable', NEW.supplier_id, NEW.installment_total_amount, NEW.installment_total_amount, 'pending', 'مديونية شراء أصل: ' || NEW.name, CURRENT_DATE + INTERVAL '1 month');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_asset_created
  AFTER INSERT ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_asset_installment();

-- 6. Bulk Transaction Processing RPC
CREATE OR REPLACE FUNCTION public.create_bulk_transaction(
  p_type text, p_category text, p_amount numeric, p_description text, p_date date, p_fund_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb, p_contact_id uuid DEFAULT NULL, p_notes text DEFAULT NULL,
  p_currency_code text DEFAULT 'USD', p_exchange_rate numeric DEFAULT 1
)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID; v_tx_id UUID; v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Create Master Transaction
  v_tx_id := public.process_transaction(
    p_type, p_category, p_amount, p_description, p_date, p_fund_id,
    p_contact_id, NULL, p_notes, p_currency_code, p_exchange_rate
  );

  -- Create Detail Items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(description text, amount numeric, contact_id uuid) LOOP
    INSERT INTO transaction_items (transaction_id, description, amount, contact_id)
    VALUES (v_tx_id, v_item.description, v_item.amount, v_item.contact_id);
  END LOOP;

  RETURN v_tx_id;
END;
$function$;

-- 7. Initialization for Funds
INSERT INTO public.funds (user_id, name, type, balance)
SELECT DISTINCT user_id, 'صندوق التطوير', 'other'::fund_type, 0
FROM public.funds
ON CONFLICT DO NOTHING;

-- Update handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;

  INSERT INTO public.funds (user_id, name, type, balance)
  VALUES (NEW.id, 'الصندوق النقدي', 'cash', 0);

  INSERT INTO public.funds (user_id, name, type, balance)
  VALUES (NEW.id, 'صندوق التطوير', 'other', 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
