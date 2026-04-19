
-- ============= 1. الجداول =============

CREATE TABLE public.production_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  quantity NUMERIC NOT NULL DEFAULT 0,
  avg_cost NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.production_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.production_products(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.production_materials(id) ON DELETE RESTRICT,
  qty_per_unit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, material_id)
);

CREATE TABLE public.material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  material_id UUID NOT NULL REFERENCES public.production_materials(id) ON DELETE CASCADE,
  contact_id UUID,
  fund_id UUID,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  transaction_id UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.production_products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.production_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.production_products(id) ON DELETE CASCADE,
  contact_id UUID,
  fund_id UUID,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  cost_at_sale NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  transaction_id UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============= 2. RLS =============
ALTER TABLE public.production_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_sales ENABLE ROW LEVEL SECURITY;

-- Helper: standard policies for company-owned tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['production_materials','production_products','product_bom','material_purchases','production_runs','production_sales'])
  LOOP
    EXECUTE format('CREATE POLICY "Company view %I" ON public.%I FOR SELECT USING (user_id IN (SELECT company_user_ids()))', t, t);
    EXECUTE format('CREATE POLICY "Company insert %I" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "Company update %I" ON public.%I FOR UPDATE USING (user_id IN (SELECT company_user_ids()))', t, t);
    EXECUTE format('CREATE POLICY "Company delete %I" ON public.%I FOR DELETE USING (user_id IN (SELECT company_user_ids()))', t, t);
  END LOOP;
END $$;

-- ============= 3. تحديث افتراضي للأقسام =============
ALTER TABLE public.companies
  ALTER COLUMN enabled_modules
  SET DEFAULT ARRAY['home','funds','accounts','projects','business','shipping','reports','production']::text[];

-- ============= 4. Triggers =============
CREATE TRIGGER update_production_materials_updated_at BEFORE UPDATE ON public.production_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_production_products_updated_at BEFORE UPDATE ON public.production_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 5. RPCs =============

-- شراء مادة خام
CREATE OR REPLACE FUNCTION public.purchase_material(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_contact_id UUID DEFAULT NULL,
  p_fund_id UUID DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT 0,
  p_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase_id UUID;
  v_total NUMERIC;
  v_material RECORD;
  v_new_qty NUMERIC;
  v_new_avg NUMERIC;
  v_tx_id UUID;
  v_batch UUID := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF p_unit_price < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF NOT verify_company_access(v_material.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_total := p_quantity * p_unit_price;
  v_new_qty := v_material.quantity + p_quantity;
  -- weighted avg cost
  IF v_new_qty > 0 THEN
    v_new_avg := ((v_material.quantity * v_material.avg_cost) + (p_quantity * p_unit_price)) / v_new_qty;
  ELSE
    v_new_avg := p_unit_price;
  END IF;

  UPDATE production_materials
  SET quantity = v_new_qty, avg_cost = v_new_avg
  WHERE id = p_material_id;

  INSERT INTO material_purchases (user_id, material_id, contact_id, fund_id, quantity, unit_price, total_amount, paid_amount, date, notes)
  VALUES (v_user_id, p_material_id, p_contact_id, p_fund_id, p_quantity, p_unit_price, v_total, p_paid_amount, p_date, p_notes)
  RETURNING id INTO v_purchase_id;

  -- قيد محاسبي: التزام للمورد (vendor_payment = نزيد ما عليه)
  IF p_contact_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'vendor_payment', v_total,
      'شراء مواد خام: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, p_contact_id, 'production_purchase', v_batch,
      'pmp_' || v_purchase_id::text, 'قيد تلقائي - شراء مواد خام')
    RETURNING id INTO v_tx_id;

    UPDATE material_purchases SET transaction_id = v_tx_id WHERE id = v_purchase_id;
  END IF;

  -- سداد فوري إن وُجد
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'vendor_payment', p_paid_amount,
      'سداد شراء مواد - ' || v_material.name,
      p_date, p_contact_id, p_fund_id, 'production_purchase_payment', v_batch,
      'pmpp_' || v_purchase_id::text, 'دفعة عند الشراء');
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_purchase_id;
END;
$$;

-- تصنيع منتج (يستهلك مواد عبر BOM)
CREATE OR REPLACE FUNCTION public.produce_product(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run_id UUID;
  v_product RECORD;
  v_bom RECORD;
  v_total_cost NUMERIC := 0;
  v_unit_cost NUMERIC;
  v_required NUMERIC;
  v_material RECORD;
  v_new_total NUMERIC;
  v_new_avg NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT verify_company_access(v_product.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- التحقق من توفر المواد وحساب التكلفة
  FOR v_bom IN SELECT * FROM product_bom WHERE product_id = p_product_id LOOP
    v_required := v_bom.qty_per_unit * p_quantity;
    SELECT * INTO v_material FROM production_materials WHERE id = v_bom.material_id FOR UPDATE;
    IF v_material.quantity < v_required THEN
      RAISE EXCEPTION 'مخزون غير كافٍ من: %', v_material.name;
    END IF;
    v_total_cost := v_total_cost + (v_required * v_material.avg_cost);

    UPDATE production_materials
    SET quantity = quantity - v_required
    WHERE id = v_bom.material_id;
  END LOOP;

  v_unit_cost := CASE WHEN p_quantity > 0 THEN v_total_cost / p_quantity ELSE 0 END;

  -- weighted avg cost للمنتج
  v_new_total := v_product.quantity + p_quantity;
  IF v_new_total > 0 THEN
    v_new_avg := ((v_product.quantity * v_product.unit_cost) + v_total_cost) / v_new_total;
  ELSE
    v_new_avg := v_unit_cost;
  END IF;

  UPDATE production_products
  SET quantity = v_new_total, unit_cost = v_new_avg
  WHERE id = p_product_id;

  INSERT INTO production_runs (user_id, product_id, quantity, total_cost, unit_cost, date, notes)
  VALUES (v_user_id, p_product_id, p_quantity, v_total_cost, v_unit_cost, p_date, p_notes)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

-- بيع منتج
CREATE OR REPLACE FUNCTION public.sell_product(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_contact_id UUID DEFAULT NULL,
  p_fund_id UUID DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT 0,
  p_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale_id UUID;
  v_product RECORD;
  v_total NUMERIC;
  v_cost NUMERIC;
  v_profit NUMERIC;
  v_tx_id UUID;
  v_batch UUID := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT verify_company_access(v_product.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_product.quantity < p_quantity THEN RAISE EXCEPTION 'مخزون المنتج غير كافٍ'; END IF;

  v_total := p_quantity * p_unit_price;
  v_cost := p_quantity * v_product.unit_cost;
  v_profit := v_total - v_cost;

  UPDATE production_products SET quantity = quantity - p_quantity WHERE id = p_product_id;

  INSERT INTO production_sales (user_id, product_id, contact_id, fund_id, quantity, unit_price, total_amount, paid_amount, cost_at_sale, profit, date, notes)
  VALUES (v_user_id, p_product_id, p_contact_id, p_fund_id, p_quantity, p_unit_price, v_total, p_paid_amount, v_cost, v_profit, p_date, p_notes)
  RETURNING id INTO v_sale_id;

  -- قيد فاتورة العميل
  IF p_contact_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'client_collection', v_total,
      'بيع منتج: ' || v_product.name || ' (' || p_quantity || ' ' || v_product.unit || ')',
      p_date, p_contact_id, 'production_sale', v_batch,
      'psl_' || v_sale_id::text, 'قيد تلقائي - بيع منتج')
    RETURNING id INTO v_tx_id;

    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  -- تحصيل فوري
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'client_collection', p_paid_amount,
      'تحصيل بيع منتج - ' || v_product.name,
      p_date, p_contact_id, p_fund_id, 'production_sale_payment', v_batch,
      'pslp_' || v_sale_id::text, 'دفعة عند البيع');
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$$;

-- ملخص أرباح الإنتاج
CREATE OR REPLACE FUNCTION public.get_production_summary()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_materials_value NUMERIC;
  v_products_value NUMERIC;
  v_total_sales NUMERIC;
  v_total_cost NUMERIC;
  v_total_profit NUMERIC;
BEGIN
  SELECT COALESCE(SUM(quantity * avg_cost), 0) INTO v_materials_value
  FROM production_materials WHERE user_id IN (SELECT company_user_ids());

  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_products_value
  FROM production_products WHERE user_id IN (SELECT company_user_ids());

  SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(cost_at_sale), 0), COALESCE(SUM(profit), 0)
  INTO v_total_sales, v_total_cost, v_total_profit
  FROM production_sales WHERE user_id IN (SELECT company_user_ids());

  RETURN json_build_object(
    'materialsValue', v_materials_value,
    'productsValue', v_products_value,
    'totalSales', v_total_sales,
    'totalCost', v_total_cost,
    'netProfit', v_total_profit
  );
END;
$$;
