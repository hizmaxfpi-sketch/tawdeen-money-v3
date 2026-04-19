-- ============================================================
-- إصلاح شامل لمحاسبة الإنتاج:
-- 1) عكس اتجاه قيود الشراء/البيع وفق منطق المستخدم
--    - شراء: type='in' على المورد (نحن مدينون له = أخضر له)
--    - بيع:  type='out' على العميل (هو مدين لنا = سالب عليه)
--    - السداد يعكس القيد الأصلي
-- 2) إصلاح reverse_material_purchase ليطابق idempotency keys (pmp_/pmpp_)
-- 3) تسجيل تكلفة البضاعة المباعة (COGS) كقيد مصروف ظاهر في السجل
-- ============================================================

-- ---------- purchase_material ----------
CREATE OR REPLACE FUNCTION public.purchase_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL, p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
  v_new_avg := CASE WHEN v_new_qty > 0
    THEN ((v_material.quantity * v_material.avg_cost) + (p_quantity * p_unit_price)) / v_new_qty
    ELSE p_unit_price END;

  UPDATE production_materials SET quantity = v_new_qty, avg_cost = v_new_avg WHERE id = p_material_id;

  INSERT INTO material_purchases (user_id, material_id, contact_id, fund_id, quantity, unit_price, total_amount, paid_amount, date, notes)
  VALUES (v_user_id, p_material_id, p_contact_id, p_fund_id, p_quantity, p_unit_price, v_total, p_paid_amount, p_date, p_notes)
  RETURNING id INTO v_purchase_id;

  -- شراء على الحساب → نحن مدينون للمورد (أخضر له) → type='in' على المورد
  IF p_contact_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'vendor_payment', v_total,
      'شراء مواد خام: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, p_contact_id, 'production_purchase', v_batch,
      'pmp_' || v_purchase_id::text, 'قيد تلقائي - شراء مواد خام (التزام للمورد)')
    RETURNING id INTO v_tx_id;
    UPDATE material_purchases SET transaction_id = v_tx_id WHERE id = v_purchase_id;
  END IF;

  -- سداد فوري للمورد → نخفض الالتزام → type='out' على المورد
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'vendor_payment', p_paid_amount,
      'سداد شراء مواد - ' || v_material.name,
      p_date, p_contact_id, p_fund_id, 'production_purchase_payment', v_batch,
      'pmpp_' || v_purchase_id::text, 'دفعة عند الشراء (تخفيض الالتزام)');
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_purchase_id;
END;
$function$;

-- ---------- sell_product ----------
CREATE OR REPLACE FUNCTION public.sell_product(
  p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL, p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL, p_services jsonb DEFAULT '[]'::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale_id UUID;
  v_product RECORD;
  v_total NUMERIC;
  v_services_total NUMERIC := 0;
  v_expenses_total NUMERIC := 0;
  v_cost NUMERIC;
  v_profit NUMERIC;
  v_tx_id UUID;
  v_batch UUID := gen_random_uuid();
  v_svc JSONB;
  v_exp JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT verify_company_access(v_product.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_product.quantity < p_quantity THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    SELECT COALESCE(SUM((s->>'amount')::numeric),0) INTO v_services_total FROM jsonb_array_elements(p_services) s;
  END IF;
  IF jsonb_typeof(p_expenses) = 'array' THEN
    SELECT COALESCE(SUM((e->>'amount')::numeric),0) INTO v_expenses_total FROM jsonb_array_elements(p_expenses) e;
  END IF;

  v_total := (p_quantity * p_unit_price) + v_services_total;
  v_cost := p_quantity * v_product.unit_cost;
  v_profit := v_total - v_cost - v_expenses_total;

  UPDATE production_products SET quantity = quantity - p_quantity WHERE id = p_product_id;

  INSERT INTO production_sales (
    user_id, source_type, product_id, contact_id, fund_id,
    quantity, unit_price, total_amount, paid_amount, cost_at_sale, profit,
    services_total, expenses_total, expenses_as_business, date, notes
  ) VALUES (
    v_user_id, 'product', p_product_id, p_contact_id, p_fund_id,
    p_quantity, p_unit_price, v_total, p_paid_amount, v_cost, v_profit,
    v_services_total, v_expenses_total, true, p_date, p_notes
  ) RETURNING id INTO v_sale_id;

  -- بيع على الحساب → العميل مدين لنا (سالب عليه) → type='out' على العميل
  IF p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (user_id, type, amount, category, date, contact_id, source_type, posting_batch_id, idempotency_key, description)
    VALUES (v_user_id, 'out', v_total, 'production_sale', p_date, p_contact_id,
      'production_sale', v_batch, 'psl_' || v_sale_id::text, 'بيع منتج جاهز')
    RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  -- سداد العميل → يخفض الذمم (يعادل قيد البيع) → type='in' على العميل
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (user_id, type, amount, category, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, description)
    VALUES (v_user_id, 'in', p_paid_amount, 'production_sale_payment', p_date, p_contact_id, p_fund_id,
      'production_sale_payment', v_batch, 'pslp_' || v_sale_id::text, 'دفعة عند البيع (تخفيض المديونية)');
    UPDATE funds SET balance = balance + p_paid_amount, updated_at = now() WHERE id = p_fund_id;
  END IF;

  -- ★ تكلفة البضاعة المباعة (COGS) كقيد مصروف ظاهر في السجل
  IF v_cost > 0 THEN
    INSERT INTO transactions (user_id, type, amount, category, date, source_type, posting_batch_id, idempotency_key, description, notes)
    VALUES (v_user_id, 'out', v_cost, 'production_cogs', p_date, 'production_cogs', v_batch,
      'pcogs_' || v_sale_id::text,
      'تكلفة المنتج المباع: ' || v_product.name || ' (' || p_quantity || ' ' || v_product.unit || ')',
      'قيد تلقائي - تكلفة البضاعة المباعة');
  END IF;

  -- خدمات
  IF jsonb_typeof(p_services) = 'array' THEN
    FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      INSERT INTO production_sale_services (user_id, sale_id, service_id, name, amount)
      VALUES (v_user_id, v_sale_id, NULLIF(v_svc->>'service_id','')::uuid,
        COALESCE(v_svc->>'name',''), COALESCE((v_svc->>'amount')::numeric, 0));
    END LOOP;
  END IF;

  -- مصاريف بيع
  IF jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      v_tx_id := NULL;
      IF COALESCE((v_exp->>'treat_as_business')::boolean, true) AND COALESCE((v_exp->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO transactions (user_id, type, amount, category, date, fund_id, source_type, posting_batch_id, description)
        VALUES (v_user_id, 'out', (v_exp->>'amount')::numeric, 'business_expense', p_date,
          NULLIF(v_exp->>'fund_id','')::uuid, 'production_sale_expense', v_batch,
          COALESCE(v_exp->>'description', 'مصروف بيع'))
        RETURNING id INTO v_tx_id;
        IF (v_exp->>'fund_id') IS NOT NULL AND (v_exp->>'fund_id') <> '' THEN
          UPDATE funds SET balance = balance - (v_exp->>'amount')::numeric WHERE id = (v_exp->>'fund_id')::uuid;
        END IF;
      END IF;
      INSERT INTO production_sale_expenses (user_id, sale_id, description, amount, fund_id, treat_as_business, transaction_id)
      VALUES (v_user_id, v_sale_id, COALESCE(v_exp->>'description',''), COALESCE((v_exp->>'amount')::numeric,0),
        NULLIF(v_exp->>'fund_id','')::uuid, COALESCE((v_exp->>'treat_as_business')::boolean, true), v_tx_id);
    END LOOP;
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$function$;

-- ---------- sell_raw_material ----------
CREATE OR REPLACE FUNCTION public.sell_raw_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL, p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL, p_services jsonb DEFAULT '[]'::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale_id UUID;
  v_material RECORD;
  v_total NUMERIC;
  v_services_total NUMERIC := 0;
  v_expenses_total NUMERIC := 0;
  v_cost NUMERIC;
  v_profit NUMERIC;
  v_tx_id UUID;
  v_batch UUID := gen_random_uuid();
  v_svc JSONB;
  v_exp JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF NOT verify_company_access(v_material.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_material.quantity < p_quantity THEN RAISE EXCEPTION 'Insufficient material stock'; END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    SELECT COALESCE(SUM((s->>'amount')::numeric),0) INTO v_services_total FROM jsonb_array_elements(p_services) s;
  END IF;
  IF jsonb_typeof(p_expenses) = 'array' THEN
    SELECT COALESCE(SUM((e->>'amount')::numeric),0) INTO v_expenses_total FROM jsonb_array_elements(p_expenses) e;
  END IF;

  v_total := (p_quantity * p_unit_price) + v_services_total;
  v_cost := p_quantity * v_material.avg_cost;
  v_profit := v_total - v_cost - v_expenses_total;

  UPDATE production_materials SET quantity = quantity - p_quantity WHERE id = p_material_id;

  INSERT INTO production_sales (
    user_id, source_type, material_id, contact_id, fund_id,
    quantity, unit_price, total_amount, paid_amount, cost_at_sale, profit,
    services_total, expenses_total, expenses_as_business, date, notes
  ) VALUES (
    v_user_id, 'material', p_material_id, p_contact_id, p_fund_id,
    p_quantity, p_unit_price, v_total, p_paid_amount, v_cost, v_profit,
    v_services_total, v_expenses_total, true, p_date, p_notes
  ) RETURNING id INTO v_sale_id;

  IF p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (user_id, type, amount, category, date, contact_id, source_type, posting_batch_id, idempotency_key, description)
    VALUES (v_user_id, 'out', v_total, 'production_sale', p_date, p_contact_id,
      'production_sale', v_batch, 'psl_' || v_sale_id::text, 'بيع مواد خام مباشر')
    RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (user_id, type, amount, category, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, description)
    VALUES (v_user_id, 'in', p_paid_amount, 'production_sale_payment', p_date, p_contact_id, p_fund_id,
      'production_sale_payment', v_batch, 'pslp_' || v_sale_id::text, 'دفعة عند البيع المباشر');
    UPDATE funds SET balance = balance + p_paid_amount, updated_at = now() WHERE id = p_fund_id;
  END IF;

  -- ★ COGS للمواد الخام
  IF v_cost > 0 THEN
    INSERT INTO transactions (user_id, type, amount, category, date, source_type, posting_batch_id, idempotency_key, description, notes)
    VALUES (v_user_id, 'out', v_cost, 'production_cogs', p_date, 'production_cogs', v_batch,
      'pcogs_' || v_sale_id::text,
      'تكلفة مواد خام مباعة: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      'قيد تلقائي - تكلفة البضاعة المباعة');
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      INSERT INTO production_sale_services (user_id, sale_id, service_id, name, amount)
      VALUES (v_user_id, v_sale_id, NULLIF(v_svc->>'service_id','')::uuid,
        COALESCE(v_svc->>'name',''), COALESCE((v_svc->>'amount')::numeric, 0));
    END LOOP;
  END IF;

  IF jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      v_tx_id := NULL;
      IF COALESCE((v_exp->>'treat_as_business')::boolean, true) AND COALESCE((v_exp->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO transactions (user_id, type, amount, category, date, fund_id, source_type, posting_batch_id, description)
        VALUES (v_user_id, 'out', (v_exp->>'amount')::numeric, 'business_expense', p_date,
          NULLIF(v_exp->>'fund_id','')::uuid, 'production_sale_expense', v_batch,
          COALESCE(v_exp->>'description', 'مصروف بيع'))
        RETURNING id INTO v_tx_id;
        IF (v_exp->>'fund_id') IS NOT NULL AND (v_exp->>'fund_id') <> '' THEN
          UPDATE funds SET balance = balance - (v_exp->>'amount')::numeric WHERE id = (v_exp->>'fund_id')::uuid;
        END IF;
      END IF;
      INSERT INTO production_sale_expenses (user_id, sale_id, description, amount, fund_id, treat_as_business, transaction_id)
      VALUES (v_user_id, v_sale_id, COALESCE(v_exp->>'description',''), COALESCE((v_exp->>'amount')::numeric,0),
        NULLIF(v_exp->>'fund_id','')::uuid, COALESCE((v_exp->>'treat_as_business')::boolean, true), v_tx_id);
    END LOOP;
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$function$;

-- ---------- reverse_material_purchase: إصلاح مفاتيح الحذف ----------
CREATE OR REPLACE FUNCTION public.reverse_material_purchase(p_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase RECORD;
  v_material RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_purchase FROM material_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF NOT verify_company_access(v_purchase.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = v_purchase.material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF v_material.quantity < v_purchase.quantity THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الشراء: تم استهلاك بعض الكمية في الإنتاج';
  END IF;

  UPDATE production_materials SET quantity = quantity - v_purchase.quantity WHERE id = v_purchase.material_id;

  IF v_purchase.paid_amount > 0 AND v_purchase.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + v_purchase.paid_amount WHERE id = v_purchase.fund_id;
  END IF;

  -- ★ المفاتيح الصحيحة (pmp_/pmpp_) بدلاً من mp_/mpp_
  DELETE FROM transactions
  WHERE idempotency_key IN ('pmp_' || p_purchase_id::text, 'pmpp_' || p_purchase_id::text)
     OR idempotency_key IN ('mp_' || p_purchase_id::text, 'mpp_' || p_purchase_id::text);

  DELETE FROM material_purchases WHERE id = p_purchase_id;
  PERFORM sync_contact_balances();
END;
$function$;

-- ---------- reverse_production_sale: حذف قيد COGS أيضاً ----------
CREATE OR REPLACE FUNCTION public.reverse_production_sale(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_sale RECORD;
  v_exp RECORD;
BEGIN
  SELECT * INTO v_sale FROM production_sales WHERE id = p_sale_id FOR UPDATE;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'سجل البيع غير موجود'; END IF;

  IF v_sale.source_type = 'material' AND v_sale.material_id IS NOT NULL THEN
    UPDATE production_materials SET quantity = quantity + v_sale.quantity, updated_at = now() WHERE id = v_sale.material_id;
  ELSIF v_sale.product_id IS NOT NULL THEN
    UPDATE production_products SET quantity = quantity + v_sale.quantity, updated_at = now() WHERE id = v_sale.product_id;
  END IF;

  IF v_sale.paid_amount > 0 AND v_sale.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - v_sale.paid_amount, updated_at = now() WHERE id = v_sale.fund_id;
  END IF;

  FOR v_exp IN SELECT * FROM production_sale_expenses WHERE sale_id = p_sale_id LOOP
    IF v_exp.transaction_id IS NOT NULL AND v_exp.fund_id IS NOT NULL AND v_exp.amount > 0 THEN
      UPDATE funds SET balance = balance + v_exp.amount, updated_at = now() WHERE id = v_exp.fund_id;
    END IF;
    IF v_exp.transaction_id IS NOT NULL THEN
      DELETE FROM transactions WHERE id = v_exp.transaction_id;
    END IF;
  END LOOP;

  -- ★ تشمل قيد COGS الجديد
  DELETE FROM transactions
  WHERE idempotency_key IN (
    'psl_'   || p_sale_id::text,
    'pslp_'  || p_sale_id::text,
    'pcogs_' || p_sale_id::text
  );

  DELETE FROM production_sale_services WHERE sale_id = p_sale_id;
  DELETE FROM production_sale_expenses WHERE sale_id = p_sale_id;
  DELETE FROM production_sales WHERE id = p_sale_id;

  PERFORM sync_contact_balances();
END;
$function$;