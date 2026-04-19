-- DROP الدوال الموجودة قبل إعادة إنشائها بتوقيع جديد
DROP FUNCTION IF EXISTS public.get_production_summary();
DROP FUNCTION IF EXISTS public.sell_product(uuid, numeric, numeric, uuid, uuid, numeric, date, text);
DROP FUNCTION IF EXISTS public.reverse_production_sale(uuid);

-- =====================================================
-- 1) جدول الخدمات
-- =====================================================
CREATE TABLE IF NOT EXISTS public.production_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  default_price numeric NOT NULL DEFAULT 0,
  notes text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company view production_services" ON public.production_services;
DROP POLICY IF EXISTS "Company insert production_services" ON public.production_services;
DROP POLICY IF EXISTS "Company update production_services" ON public.production_services;
DROP POLICY IF EXISTS "Company delete production_services" ON public.production_services;

CREATE POLICY "Company view production_services" ON public.production_services
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert production_services" ON public.production_services
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update production_services" ON public.production_services
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete production_services" ON public.production_services
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

DROP TRIGGER IF EXISTS trg_production_services_updated ON public.production_services;
CREATE TRIGGER trg_production_services_updated
  BEFORE UPDATE ON public.production_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2) أعمدة إضافية لجدول البيع
-- =====================================================
ALTER TABLE public.production_sales
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS material_id uuid,
  ADD COLUMN IF NOT EXISTS services_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expenses_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expenses_as_business boolean NOT NULL DEFAULT true;

ALTER TABLE public.production_sales ALTER COLUMN product_id DROP NOT NULL;

-- =====================================================
-- 3) الخدمات لكل عملية بيع
-- =====================================================
CREATE TABLE IF NOT EXISTS public.production_sale_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.production_sales(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.production_services(id) ON DELETE SET NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_sale_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company view sale_services" ON public.production_sale_services;
DROP POLICY IF EXISTS "Company insert sale_services" ON public.production_sale_services;
DROP POLICY IF EXISTS "Company update sale_services" ON public.production_sale_services;
DROP POLICY IF EXISTS "Company delete sale_services" ON public.production_sale_services;

CREATE POLICY "Company view sale_services" ON public.production_sale_services
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert sale_services" ON public.production_sale_services
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update sale_services" ON public.production_sale_services
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete sale_services" ON public.production_sale_services
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- =====================================================
-- 4) المصاريف على البيع
-- =====================================================
CREATE TABLE IF NOT EXISTS public.production_sale_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.production_sales(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  fund_id uuid,
  treat_as_business boolean NOT NULL DEFAULT true,
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_sale_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company view sale_expenses" ON public.production_sale_expenses;
DROP POLICY IF EXISTS "Company insert sale_expenses" ON public.production_sale_expenses;
DROP POLICY IF EXISTS "Company update sale_expenses" ON public.production_sale_expenses;
DROP POLICY IF EXISTS "Company delete sale_expenses" ON public.production_sale_expenses;

CREATE POLICY "Company view sale_expenses" ON public.production_sale_expenses
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert sale_expenses" ON public.production_sale_expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update sale_expenses" ON public.production_sale_expenses
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete sale_expenses" ON public.production_sale_expenses
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- =====================================================
-- 5) RPC: بيع مباشر من المخزون الخام
-- =====================================================
CREATE OR REPLACE FUNCTION public.sell_raw_material(
  p_material_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL,
  p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb,
  p_expenses jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_material RECORD;
  v_sale_id uuid;
  v_total numeric;
  v_services_total numeric := 0;
  v_expenses_total numeric := 0;
  v_cost numeric;
  v_profit numeric;
  v_batch uuid := gen_random_uuid();
  v_tx_id uuid;
  v_svc jsonb;
  v_exp jsonb;
  v_exp_tx_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = p_material_id FOR UPDATE;
  IF v_material IS NULL THEN RAISE EXCEPTION 'المادة غير موجودة'; END IF;
  IF v_material.quantity < p_quantity THEN
    RAISE EXCEPTION 'الكمية المتاحة % أقل من المطلوب %', v_material.quantity, p_quantity;
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    SELECT COALESCE(SUM((s->>'amount')::numeric), 0) INTO v_services_total
    FROM jsonb_array_elements(p_services) s;
  END IF;
  IF jsonb_typeof(p_expenses) = 'array' THEN
    SELECT COALESCE(SUM((e->>'amount')::numeric), 0) INTO v_expenses_total
    FROM jsonb_array_elements(p_expenses) e;
  END IF;

  v_total := (p_quantity * p_unit_price) + v_services_total;
  v_cost := p_quantity * v_material.avg_cost;
  v_profit := v_total - v_cost - v_expenses_total;

  UPDATE production_materials SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = p_material_id;

  INSERT INTO production_sales (
    user_id, source_type, material_id, product_id, contact_id, fund_id,
    quantity, unit_price, total_amount, paid_amount, cost_at_sale, profit,
    services_total, expenses_total, expenses_as_business, date, notes
  ) VALUES (
    v_user_id, 'material', p_material_id, NULL, p_contact_id, p_fund_id,
    p_quantity, p_unit_price, v_total, p_paid_amount, v_cost, v_profit,
    v_services_total, v_expenses_total, true, p_date, p_notes
  ) RETURNING id INTO v_sale_id;

  IF p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, category, date, contact_id, source_type,
      posting_batch_id, idempotency_key, description
    ) VALUES (
      v_user_id, 'in', v_total, 'production_sale', p_date, p_contact_id,
      'production_sale', v_batch, 'psl_' || v_sale_id::text, 'بيع مباشر من المخزون'
    ) RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, category, date, contact_id, fund_id,
      source_type, posting_batch_id, idempotency_key, description
    ) VALUES (
      v_user_id, 'in', p_paid_amount, 'production_sale_payment', p_date, p_contact_id, p_fund_id,
      'production_sale', v_batch, 'pslp_' || v_sale_id::text, 'دفعة عند البيع'
    );
    UPDATE funds SET balance = balance + p_paid_amount, updated_at = now() WHERE id = p_fund_id;
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      INSERT INTO production_sale_services (user_id, sale_id, service_id, name, amount)
      VALUES (
        v_user_id, v_sale_id,
        NULLIF(v_svc->>'service_id','')::uuid,
        v_svc->>'name',
        COALESCE((v_svc->>'amount')::numeric, 0)
      );
    END LOOP;
  END IF;

  IF jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      v_exp_tx_id := NULL;
      IF COALESCE((v_exp->>'treat_as_business')::boolean, true) AND COALESCE((v_exp->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO transactions (
          user_id, type, amount, category, date, fund_id,
          source_type, posting_batch_id, description
        ) VALUES (
          v_user_id, 'out', (v_exp->>'amount')::numeric, 'business_expense', p_date,
          NULLIF(v_exp->>'fund_id','')::uuid, 'production_sale', v_batch,
          COALESCE(v_exp->>'description','مصروف على بيع')
        ) RETURNING id INTO v_exp_tx_id;
        IF (v_exp->>'fund_id') IS NOT NULL AND (v_exp->>'fund_id') <> '' THEN
          UPDATE funds SET balance = balance - (v_exp->>'amount')::numeric, updated_at = now()
          WHERE id = (v_exp->>'fund_id')::uuid;
        END IF;
      END IF;
      INSERT INTO production_sale_expenses (
        user_id, sale_id, description, amount, fund_id, treat_as_business, transaction_id
      ) VALUES (
        v_user_id, v_sale_id,
        COALESCE(v_exp->>'description','مصروف'),
        COALESCE((v_exp->>'amount')::numeric, 0),
        NULLIF(v_exp->>'fund_id','')::uuid,
        COALESCE((v_exp->>'treat_as_business')::boolean, true),
        v_exp_tx_id
      );
    END LOOP;
  END IF;

  RETURN v_sale_id;
END;
$$;

-- =====================================================
-- 6) إعادة إنشاء sell_product مع دعم الخدمات والمصاريف
-- =====================================================
CREATE OR REPLACE FUNCTION public.sell_product(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL,
  p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb,
  p_expenses jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product RECORD;
  v_sale_id uuid;
  v_total numeric;
  v_services_total numeric := 0;
  v_expenses_total numeric := 0;
  v_cost numeric;
  v_profit numeric;
  v_batch uuid := gen_random_uuid();
  v_tx_id uuid;
  v_svc jsonb;
  v_exp jsonb;
  v_exp_tx_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = p_product_id FOR UPDATE;
  IF v_product IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود'; END IF;
  IF v_product.quantity < p_quantity THEN
    RAISE EXCEPTION 'الكمية المتاحة % أقل من المطلوب %', v_product.quantity, p_quantity;
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    SELECT COALESCE(SUM((s->>'amount')::numeric), 0) INTO v_services_total
    FROM jsonb_array_elements(p_services) s;
  END IF;
  IF jsonb_typeof(p_expenses) = 'array' THEN
    SELECT COALESCE(SUM((e->>'amount')::numeric), 0) INTO v_expenses_total
    FROM jsonb_array_elements(p_expenses) e;
  END IF;

  v_total := (p_quantity * p_unit_price) + v_services_total;
  v_cost := p_quantity * v_product.unit_cost;
  v_profit := v_total - v_cost - v_expenses_total;

  UPDATE production_products SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO production_sales (
    user_id, source_type, product_id, contact_id, fund_id,
    quantity, unit_price, total_amount, paid_amount, cost_at_sale, profit,
    services_total, expenses_total, expenses_as_business, date, notes
  ) VALUES (
    v_user_id, 'product', p_product_id, p_contact_id, p_fund_id,
    p_quantity, p_unit_price, v_total, p_paid_amount, v_cost, v_profit,
    v_services_total, v_expenses_total, true, p_date, p_notes
  ) RETURNING id INTO v_sale_id;

  IF p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, category, date, contact_id, source_type,
      posting_batch_id, idempotency_key, description
    ) VALUES (
      v_user_id, 'in', v_total, 'production_sale', p_date, p_contact_id,
      'production_sale', v_batch, 'psl_' || v_sale_id::text, 'بيع منتج جاهز'
    ) RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, category, date, contact_id, fund_id,
      source_type, posting_batch_id, idempotency_key, description
    ) VALUES (
      v_user_id, 'in', p_paid_amount, 'production_sale_payment', p_date, p_contact_id, p_fund_id,
      'production_sale', v_batch, 'pslp_' || v_sale_id::text, 'دفعة عند البيع'
    );
    UPDATE funds SET balance = balance + p_paid_amount, updated_at = now() WHERE id = p_fund_id;
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      INSERT INTO production_sale_services (user_id, sale_id, service_id, name, amount)
      VALUES (
        v_user_id, v_sale_id,
        NULLIF(v_svc->>'service_id','')::uuid,
        v_svc->>'name',
        COALESCE((v_svc->>'amount')::numeric, 0)
      );
    END LOOP;
  END IF;

  IF jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      v_exp_tx_id := NULL;
      IF COALESCE((v_exp->>'treat_as_business')::boolean, true) AND COALESCE((v_exp->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO transactions (
          user_id, type, amount, category, date, fund_id,
          source_type, posting_batch_id, description
        ) VALUES (
          v_user_id, 'out', (v_exp->>'amount')::numeric, 'business_expense', p_date,
          NULLIF(v_exp->>'fund_id','')::uuid, 'production_sale', v_batch,
          COALESCE(v_exp->>'description','مصروف على بيع')
        ) RETURNING id INTO v_exp_tx_id;
        IF (v_exp->>'fund_id') IS NOT NULL AND (v_exp->>'fund_id') <> '' THEN
          UPDATE funds SET balance = balance - (v_exp->>'amount')::numeric, updated_at = now()
          WHERE id = (v_exp->>'fund_id')::uuid;
        END IF;
      END IF;
      INSERT INTO production_sale_expenses (
        user_id, sale_id, description, amount, fund_id, treat_as_business, transaction_id
      ) VALUES (
        v_user_id, v_sale_id,
        COALESCE(v_exp->>'description','مصروف'),
        COALESCE((v_exp->>'amount')::numeric, 0),
        NULLIF(v_exp->>'fund_id','')::uuid,
        COALESCE((v_exp->>'treat_as_business')::boolean, true),
        v_exp_tx_id
      );
    END LOOP;
  END IF;

  RETURN v_sale_id;
END;
$$;

-- =====================================================
-- 7) إعادة إنشاء reverse_production_sale
-- =====================================================
CREATE OR REPLACE FUNCTION public.reverse_production_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_exp RECORD;
BEGIN
  SELECT * INTO v_sale FROM production_sales WHERE id = p_sale_id FOR UPDATE;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'سجل البيع غير موجود'; END IF;

  IF v_sale.source_type = 'material' AND v_sale.material_id IS NOT NULL THEN
    UPDATE production_materials SET quantity = quantity + v_sale.quantity, updated_at = now()
    WHERE id = v_sale.material_id;
  ELSIF v_sale.product_id IS NOT NULL THEN
    UPDATE production_products SET quantity = quantity + v_sale.quantity, updated_at = now()
    WHERE id = v_sale.product_id;
  END IF;

  IF v_sale.paid_amount > 0 AND v_sale.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - v_sale.paid_amount, updated_at = now()
    WHERE id = v_sale.fund_id;
  END IF;

  FOR v_exp IN SELECT * FROM production_sale_expenses WHERE sale_id = p_sale_id LOOP
    IF v_exp.transaction_id IS NOT NULL AND v_exp.fund_id IS NOT NULL AND v_exp.amount > 0 THEN
      UPDATE funds SET balance = balance + v_exp.amount, updated_at = now()
      WHERE id = v_exp.fund_id;
    END IF;
    IF v_exp.transaction_id IS NOT NULL THEN
      DELETE FROM transactions WHERE id = v_exp.transaction_id;
    END IF;
  END LOOP;

  DELETE FROM transactions
  WHERE idempotency_key IN ('psl_' || p_sale_id::text, 'pslp_' || p_sale_id::text);

  DELETE FROM production_sale_services WHERE sale_id = p_sale_id;
  DELETE FROM production_sale_expenses WHERE sale_id = p_sale_id;
  DELETE FROM production_sales WHERE id = p_sale_id;
END;
$$;

-- =====================================================
-- 8) get_production_summary مع المصاريف
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_production_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_materials_value numeric;
  v_products_value numeric;
  v_total_sales numeric;
  v_total_cost numeric;
  v_total_expenses numeric;
  v_net_profit numeric;
BEGIN
  SELECT COALESCE(SUM(quantity * avg_cost), 0) INTO v_materials_value
  FROM production_materials WHERE user_id IN (SELECT company_user_ids());

  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_products_value
  FROM production_products WHERE user_id IN (SELECT company_user_ids());

  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(cost_at_sale), 0),
    COALESCE(SUM(expenses_total), 0)
  INTO v_total_sales, v_total_cost, v_total_expenses
  FROM production_sales WHERE user_id IN (SELECT company_user_ids());

  v_net_profit := v_total_sales - v_total_cost - v_total_expenses;

  RETURN jsonb_build_object(
    'materialsValue', v_materials_value,
    'productsValue', v_products_value,
    'totalSales', v_total_sales,
    'totalCost', v_total_cost,
    'totalExpenses', v_total_expenses,
    'netProfit', v_net_profit
  );
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_sale_services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_sale_expenses;