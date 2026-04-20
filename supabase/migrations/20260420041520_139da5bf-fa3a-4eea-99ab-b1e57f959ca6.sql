-- 1) إصلاح بيانات سابقة: استرجاع أرصدة الصناديق من قيود مصاريف البيع التي خصمت سابقاً
-- (لأن هذه المصاريف عليها قيود سداد سابقة ولا يجب تكرار التأثير على الصندوق)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, fund_id, amount
    FROM transactions
    WHERE source_type = 'production_sale_expense'
      AND fund_id IS NOT NULL
  LOOP
    -- استرجاع المبلغ للصندوق (عكس أثر out)
    UPDATE funds SET balance = balance + r.amount WHERE id = r.fund_id;
    -- تجريد القيد من fund_id ليبقى للعرض فقط
    UPDATE transactions SET fund_id = NULL WHERE id = r.id;
  END LOOP;
END $$;

-- 2) تعديل sell_product: إنشاء قيد مصروف بدون fund_id ولا تحديث الصندوق
CREATE OR REPLACE FUNCTION public.sell_product(
  p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL::uuid, p_fund_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text, p_services jsonb DEFAULT '[]'::jsonb,
  p_expenses jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- مصاريف البيع: تُسجل في الجدول التفصيلي + قيد عرضي بدون fund_id (لا أثر على الصندوق)
  -- السبب: المستخدم سدّد هذه المصاريف من قيود سابقة، فلا يجوز خصمها مرة ثانية
  FOR v_exp IN SELECT * FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::jsonb)) LOOP
    v_exp_amount := COALESCE((v_exp->>'amount')::numeric, 0);
    v_exp_fund := NULLIF(v_exp->>'fund_id', '')::uuid;
    IF v_exp_amount > 0 THEN
      INSERT INTO production_sale_expenses (sale_id, user_id, description, amount, fund_id, treat_as_business)
      VALUES (v_sale_id, v_user_id, COALESCE(v_exp->>'description', 'مصروف بيع'), v_exp_amount, v_exp_fund,
              COALESCE((v_exp->>'treat_as_business')::boolean, false));
      -- قيد عرضي فقط (بدون fund_id) — يظهر في سجل الأعمال دون أن يخصم من أي صندوق
      INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, source_type, posting_batch_id, idempotency_key, notes)
      VALUES (v_user_id, 'out', 'production_expense', v_exp_amount,
        COALESCE(v_exp->>'description', 'مصروف بيع منتج'),
        p_date, NULL, 'production_sale_expense', v_batch,
        'psex_' || v_sale_id::text || '_' || gen_random_uuid()::text,
        'مصروف بيع — للعرض فقط (لا أثر على الصندوق، مسدّد سابقاً)');
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

-- 3) نفس التعديل لدالة sell_raw_material
CREATE OR REPLACE FUNCTION public.sell_raw_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL::uuid, p_fund_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text, p_services jsonb DEFAULT '[]'::jsonb,
  p_expenses jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    p_date, p_notes, v_services_total, v_expenses_total, 'material'
  ) RETURNING id INTO v_sale_id;

  IF p_contact_id IS NOT NULL AND v_grand_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'client_collection', v_grand_total,
      'بيع مادة خام: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, p_contact_id, 'production_sale', v_batch,
      'psl_' || v_sale_id::text, 'فاتورة بيع مادة خام')
    RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'client_collection', p_paid_amount,
      'تحصيل بيع مادة خام - ' || v_material.name,
      p_date, p_contact_id, p_fund_id, 'production_sale_payment', v_batch,
      'pslp_' || v_sale_id::text, 'دفعة من بيع مادة خام');
  END IF;

  IF v_cost > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'production_cogs', v_cost,
      'تكلفة مادة خام مباعة: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, 'production_cogs', v_batch,
      'pcogs_' || v_sale_id::text, 'تكلفة مادة خام مباعة - بدون أثر على الصندوق');
  END IF;

  -- مصاريف البيع: قيد عرضي بدون fund_id
  FOR v_exp IN SELECT * FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::jsonb)) LOOP
    v_exp_amount := COALESCE((v_exp->>'amount')::numeric, 0);
    v_exp_fund := NULLIF(v_exp->>'fund_id', '')::uuid;
    IF v_exp_amount > 0 THEN
      INSERT INTO production_sale_expenses (sale_id, user_id, description, amount, fund_id, treat_as_business)
      VALUES (v_sale_id, v_user_id, COALESCE(v_exp->>'description', 'مصروف بيع'), v_exp_amount, v_exp_fund,
              COALESCE((v_exp->>'treat_as_business')::boolean, false));
      INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, source_type, posting_batch_id, idempotency_key, notes)
      VALUES (v_user_id, 'out', 'production_expense', v_exp_amount,
        COALESCE(v_exp->>'description', 'مصروف بيع مادة خام'),
        p_date, NULL, 'production_sale_expense', v_batch,
        'psex_' || v_sale_id::text || '_' || gen_random_uuid()::text,
        'مصروف بيع — للعرض فقط (لا أثر على الصندوق، مسدّد سابقاً)');
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