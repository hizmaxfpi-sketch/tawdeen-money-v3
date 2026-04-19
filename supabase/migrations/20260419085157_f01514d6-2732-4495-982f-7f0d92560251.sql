-- 1) تنظيف قيود شراء المواد اليتيمة
DELETE FROM transactions
WHERE source_type = 'production_purchase'
  AND idempotency_key LIKE 'pmp_%'
  AND NOT EXISTS (
    SELECT 1 FROM material_purchases mp
    WHERE 'pmp_' || mp.id::text = transactions.idempotency_key
  );

DELETE FROM transactions
WHERE source_type = 'production_purchase_payment'
  AND idempotency_key LIKE 'pmpp_%'
  AND NOT EXISTS (
    SELECT 1 FROM material_purchases mp
    WHERE 'pmpp_' || mp.id::text = transactions.idempotency_key
  );

DELETE FROM transactions
WHERE source_type = 'production_cogs'
  AND idempotency_key LIKE 'pcogs_%'
  AND NOT EXISTS (
    SELECT 1 FROM production_sales ps
    WHERE 'pcogs_' || ps.id::text = transactions.idempotency_key
  );

-- مزامنة أرصدة جهات الاتصال يدوياً (بدون auth.uid)
UPDATE public.contacts c SET
  total_debit = COALESCE(v.total_debit, 0),
  total_credit = COALESCE(v.total_credit, 0),
  balance = COALESCE(v.balance, 0),
  total_transactions = COALESCE(v.total_transactions, 0)
FROM public.v_contact_balance v
WHERE c.id = v.contact_id;

UPDATE public.contacts SET
  total_debit = 0, total_credit = 0, balance = 0, total_transactions = 0
WHERE id NOT IN (SELECT contact_id FROM public.v_contact_balance WHERE contact_id IS NOT NULL);

-- 2) purchase_material محسّن
CREATE OR REPLACE FUNCTION public.purchase_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL, p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id UUID := auth.uid(); v_purchase_id UUID; v_material RECORD;
  v_total NUMERIC; v_new_qty NUMERIC; v_new_avg NUMERIC;
  v_tx_id UUID; v_batch UUID := gen_random_uuid();
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
    THEN ((v_material.quantity * v_material.avg_cost) + v_total) / v_new_qty
    ELSE p_unit_price END;

  UPDATE production_materials SET quantity = v_new_qty, avg_cost = v_new_avg WHERE id = p_material_id;

  INSERT INTO material_purchases (user_id, material_id, quantity, unit_price, total_amount, paid_amount, contact_id, fund_id, date, notes)
  VALUES (v_user_id, p_material_id, p_quantity, p_unit_price, v_total, p_paid_amount, p_contact_id, p_fund_id, p_date, p_notes)
  RETURNING id INTO v_purchase_id;

  IF p_contact_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'vendor_payment', v_total,
      'شراء مواد خام: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, p_contact_id, 'production_purchase', v_batch,
      'pmp_' || v_purchase_id::text, COALESCE(p_notes, 'فاتورة شراء مواد خام'))
    RETURNING id INTO v_tx_id;
    UPDATE material_purchases SET transaction_id = v_tx_id WHERE id = v_purchase_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'vendor_payment', p_paid_amount,
      'دفعة شراء مواد - ' || v_material.name,
      p_date, p_contact_id, p_fund_id, 'production_purchase_payment', v_batch,
      'pmpp_' || v_purchase_id::text, 'دفعة على فاتورة شراء');
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_purchase_id;
END;
$function$;

-- 3) reverse_material_purchase شامل
CREATE OR REPLACE FUNCTION public.reverse_material_purchase(p_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id UUID := auth.uid(); v_purchase RECORD; v_material RECORD;
  v_new_qty NUMERIC; v_new_avg NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_purchase FROM material_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF NOT verify_company_access(v_purchase.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = v_purchase.material_id FOR UPDATE;

  v_new_qty := GREATEST(0, v_material.quantity - v_purchase.quantity);
  IF v_new_qty > 0 THEN
    v_new_avg := GREATEST(0, ((v_material.quantity * v_material.avg_cost) - v_purchase.total_amount) / v_new_qty);
  ELSE v_new_avg := 0; END IF;
  UPDATE production_materials SET quantity = v_new_qty, avg_cost = v_new_avg WHERE id = v_purchase.material_id;

  IF v_purchase.paid_amount > 0 AND v_purchase.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + v_purchase.paid_amount WHERE id = v_purchase.fund_id;
  END IF;

  -- حذف شامل لكل القيود المرتبطة
  DELETE FROM transactions
  WHERE idempotency_key IN ('pmp_' || p_purchase_id::text, 'pmpp_' || p_purchase_id::text)
     OR (v_purchase.transaction_id IS NOT NULL AND id = v_purchase.transaction_id);

  DELETE FROM material_purchases WHERE id = p_purchase_id;

  PERFORM sync_contact_balances();
END;
$function$;

-- 4) sell_product مع COGS بدون fund_id
CREATE OR REPLACE FUNCTION public.sell_product(
  p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL, p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL, p_services jsonb DEFAULT '[]'::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id UUID := auth.uid(); v_product RECORD; v_sale_id UUID;
  v_total NUMERIC; v_cost NUMERIC; v_services_total NUMERIC := 0;
  v_expenses_total NUMERIC := 0; v_grand_total NUMERIC; v_profit NUMERIC;
  v_tx_id UUID; v_batch UUID := gen_random_uuid();
  v_svc jsonb; v_exp jsonb; v_exp_fund UUID; v_exp_amount NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT verify_company_access(v_product.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_product.quantity < p_quantity THEN RAISE EXCEPTION 'مخزون غير كافٍ من: %', v_product.name; END IF;

  v_total := p_quantity * p_unit_price;
  v_cost := p_quantity * v_product.unit_cost;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    v_services_total := v_services_total + COALESCE((v_svc->>'amount')::numeric, 0);
  END LOOP;
  FOR v_exp IN SELECT * FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::jsonb)) LOOP
    v_expenses_total := v_expenses_total + COALESCE((v_exp->>'amount')::numeric, 0);
  END LOOP;

  v_grand_total := v_total + v_services_total;
  v_profit := v_grand_total - v_cost - v_expenses_total;

  UPDATE production_products SET quantity = quantity - p_quantity WHERE id = p_product_id;

  INSERT INTO production_sales (
    user_id, product_id, quantity, unit_price, total_amount,
    cost_at_sale, profit, paid_amount, contact_id, fund_id,
    date, notes, services_total, expenses_total, source_type
  ) VALUES (
    v_user_id, p_product_id, p_quantity, p_unit_price, v_grand_total,
    v_cost, v_profit, p_paid_amount, p_contact_id, p_fund_id,
    p_date, p_notes, v_services_total, v_expenses_total, 'product'
  ) RETURNING id INTO v_sale_id;

  IF p_contact_id IS NOT NULL AND v_grand_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'client_collection', v_grand_total,
      'بيع منتج: ' || v_product.name || ' (' || p_quantity || ' ' || v_product.unit || ')',
      p_date, p_contact_id, 'production_sale', v_batch,
      'psl_' || v_sale_id::text, 'فاتورة بيع منتج')
    RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'client_collection', p_paid_amount,
      'تحصيل بيع منتج - ' || v_product.name,
      p_date, p_contact_id, p_fund_id, 'production_sale_payment', v_batch,
      'pslp_' || v_sale_id::text, 'دفعة من بيع منتج');
  END IF;

  -- COGS بدون fund_id (لا أثر نقدي)
  IF v_cost > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'production_cogs', v_cost,
      'تكلفة مواد مستهلكة: ' || v_product.name || ' (' || p_quantity || ' ' || v_product.unit || ')',
      p_date, 'production_cogs', v_batch,
      'pcogs_' || v_sale_id::text, 'تكلفة مواد خام مستهلكة - بدون أثر على الصندوق');
  END IF;

  FOR v_exp IN SELECT * FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::jsonb)) LOOP
    v_exp_amount := COALESCE((v_exp->>'amount')::numeric, 0);
    v_exp_fund := NULLIF(v_exp->>'fund_id', '')::uuid;
    IF v_exp_amount > 0 THEN
      INSERT INTO production_sale_expenses (sale_id, user_id, description, amount, fund_id, treat_as_business)
      VALUES (v_sale_id, v_user_id, COALESCE(v_exp->>'description', 'مصروف بيع'), v_exp_amount, v_exp_fund,
              COALESCE((v_exp->>'treat_as_business')::boolean, false));
      IF v_exp_fund IS NOT NULL THEN
        UPDATE funds SET balance = balance - v_exp_amount WHERE id = v_exp_fund;
        INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, source_type, posting_batch_id, idempotency_key, notes)
        VALUES (v_user_id, 'out', 'production_expense', v_exp_amount,
          COALESCE(v_exp->>'description', 'مصروف بيع منتج'),
          p_date, v_exp_fund, 'production_sale_expense', v_batch,
          'psex_' || v_sale_id::text || '_' || gen_random_uuid()::text, 'مصروف بيع');
      END IF;
    END IF;
  END LOOP;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO production_sale_services (sale_id, user_id, name, amount, service_id)
    VALUES (v_sale_id, v_user_id, COALESCE(v_svc->>'name', 'خدمة'),
            COALESCE((v_svc->>'amount')::numeric, 0),
            NULLIF(v_svc->>'service_id', '')::uuid);
  END LOOP;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$function$;

-- 5) sell_raw_material مع COGS بدون fund_id
CREATE OR REPLACE FUNCTION public.sell_raw_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL, p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL, p_services jsonb DEFAULT '[]'::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id UUID := auth.uid(); v_material RECORD; v_sale_id UUID;
  v_total NUMERIC; v_cost NUMERIC; v_services_total NUMERIC := 0;
  v_expenses_total NUMERIC := 0; v_grand_total NUMERIC; v_profit NUMERIC;
  v_tx_id UUID; v_batch UUID := gen_random_uuid();
  v_svc jsonb; v_exp jsonb; v_exp_fund UUID; v_exp_amount NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF NOT verify_company_access(v_material.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_material.quantity < p_quantity THEN RAISE EXCEPTION 'مخزون غير كافٍ من: %', v_material.name; END IF;

  v_total := p_quantity * p_unit_price;
  v_cost := p_quantity * v_material.avg_cost;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    v_services_total := v_services_total + COALESCE((v_svc->>'amount')::numeric, 0);
  END LOOP;
  FOR v_exp IN SELECT * FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::jsonb)) LOOP
    v_expenses_total := v_expenses_total + COALESCE((v_exp->>'amount')::numeric, 0);
  END LOOP;

  v_grand_total := v_total + v_services_total;
  v_profit := v_grand_total - v_cost - v_expenses_total;

  UPDATE production_materials SET quantity = quantity - p_quantity WHERE id = p_material_id;

  INSERT INTO production_sales (
    user_id, material_id, quantity, unit_price, total_amount,
    cost_at_sale, profit, paid_amount, contact_id, fund_id,
    date, notes, services_total, expenses_total, source_type
  ) VALUES (
    v_user_id, p_material_id, p_quantity, p_unit_price, v_grand_total,
    v_cost, v_profit, p_paid_amount, p_contact_id, p_fund_id,
    p_date, p_notes, v_services_total, v_expenses_total, 'raw_material'
  ) RETURNING id INTO v_sale_id;

  IF p_contact_id IS NOT NULL AND v_grand_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'client_collection', v_grand_total,
      'بيع مواد خام: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, p_contact_id, 'production_sale', v_batch,
      'psl_' || v_sale_id::text, 'فاتورة بيع مواد خام')
    RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'client_collection', p_paid_amount,
      'تحصيل بيع مواد - ' || v_material.name,
      p_date, p_contact_id, p_fund_id, 'production_sale_payment', v_batch,
      'pslp_' || v_sale_id::text, 'دفعة من بيع مواد خام');
  END IF;

  IF v_cost > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'production_cogs', v_cost,
      'تكلفة مواد مباعة: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, 'production_cogs', v_batch,
      'pcogs_' || v_sale_id::text, 'تكلفة مواد خام مباعة - بدون أثر على الصندوق');
  END IF;

  FOR v_exp IN SELECT * FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::jsonb)) LOOP
    v_exp_amount := COALESCE((v_exp->>'amount')::numeric, 0);
    v_exp_fund := NULLIF(v_exp->>'fund_id', '')::uuid;
    IF v_exp_amount > 0 THEN
      INSERT INTO production_sale_expenses (sale_id, user_id, description, amount, fund_id, treat_as_business)
      VALUES (v_sale_id, v_user_id, COALESCE(v_exp->>'description', 'مصروف بيع'), v_exp_amount, v_exp_fund,
              COALESCE((v_exp->>'treat_as_business')::boolean, false));
      IF v_exp_fund IS NOT NULL THEN
        UPDATE funds SET balance = balance - v_exp_amount WHERE id = v_exp_fund;
        INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, source_type, posting_batch_id, idempotency_key, notes)
        VALUES (v_user_id, 'out', 'production_expense', v_exp_amount,
          COALESCE(v_exp->>'description', 'مصروف بيع مواد'),
          p_date, v_exp_fund, 'production_sale_expense', v_batch,
          'psex_' || v_sale_id::text || '_' || gen_random_uuid()::text, 'مصروف بيع');
      END IF;
    END IF;
  END LOOP;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO production_sale_services (sale_id, user_id, name, amount, service_id)
    VALUES (v_sale_id, v_user_id, COALESCE(v_svc->>'name', 'خدمة'),
            COALESCE((v_svc->>'amount')::numeric, 0),
            NULLIF(v_svc->>'service_id', '')::uuid);
  END LOOP;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$function$;

-- 6) reverse_production_sale شامل
CREATE OR REPLACE FUNCTION public.reverse_production_sale(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id UUID := auth.uid(); v_sale RECORD; v_exp RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_sale FROM production_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT verify_company_access(v_sale.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF v_sale.product_id IS NOT NULL THEN
    UPDATE production_products SET quantity = quantity + v_sale.quantity WHERE id = v_sale.product_id;
  ELSIF v_sale.material_id IS NOT NULL THEN
    UPDATE production_materials SET quantity = quantity + v_sale.quantity WHERE id = v_sale.material_id;
  END IF;

  IF v_sale.paid_amount > 0 AND v_sale.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - v_sale.paid_amount WHERE id = v_sale.fund_id;
  END IF;

  FOR v_exp IN SELECT * FROM production_sale_expenses WHERE sale_id = p_sale_id LOOP
    IF v_exp.fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance + v_exp.amount WHERE id = v_exp.fund_id;
    END IF;
  END LOOP;

  -- حذف شامل لكل القيود (الفاتورة + الدفع + COGS + المصاريف)
  DELETE FROM transactions
  WHERE idempotency_key IN (
    'psl_' || p_sale_id::text,
    'pslp_' || p_sale_id::text,
    'pcogs_' || p_sale_id::text
  )
  OR idempotency_key LIKE ('psex_' || p_sale_id::text || '%');

  DELETE FROM production_sale_services WHERE sale_id = p_sale_id;
  DELETE FROM production_sale_expenses WHERE sale_id = p_sale_id;
  DELETE FROM production_sales WHERE id = p_sale_id;

  PERFORM sync_contact_balances();
END;
$function$;