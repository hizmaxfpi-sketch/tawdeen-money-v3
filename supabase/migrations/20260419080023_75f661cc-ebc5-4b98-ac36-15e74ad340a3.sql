-- 1) Update sell_product: customer payment must be 'out' (offsets the 'in' sale on the contact ledger)
CREATE OR REPLACE FUNCTION public.sell_product(
  p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL::uuid, p_fund_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text,
  p_services jsonb DEFAULT '[]'::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  -- Sale on credit → customer owes us (debit balance) → type='in'
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

  -- Customer payment received → settles the receivable → type='out' on contact (offsets the 'in' sale)
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, category, date, contact_id, fund_id,
      source_type, posting_batch_id, idempotency_key, description
    ) VALUES (
      v_user_id, 'out', p_paid_amount, 'production_sale_payment', p_date, p_contact_id, p_fund_id,
      'production_sale_payment', v_batch, 'pslp_' || v_sale_id::text, 'دفعة عند البيع (تخفيض المديونية)'
    );
    UPDATE funds SET balance = balance + p_paid_amount, updated_at = now() WHERE id = p_fund_id;
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      INSERT INTO production_sale_services (user_id, sale_id, service_id, name, amount)
      VALUES (v_user_id, v_sale_id,
        NULLIF(v_svc->>'service_id','')::uuid,
        COALESCE(v_svc->>'name',''),
        COALESCE((v_svc->>'amount')::numeric, 0));
    END LOOP;
  END IF;

  IF jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      v_tx_id := NULL;
      IF COALESCE((v_exp->>'treat_as_business')::boolean, true) AND COALESCE((v_exp->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO transactions (
          user_id, type, amount, category, date, fund_id,
          source_type, posting_batch_id, description
        ) VALUES (
          v_user_id, 'out', (v_exp->>'amount')::numeric, 'business_expense', p_date,
          NULLIF(v_exp->>'fund_id','')::uuid,
          'production_sale_expense', v_batch, COALESCE(v_exp->>'description','مصروف على البيع')
        ) RETURNING id INTO v_tx_id;
        IF NULLIF(v_exp->>'fund_id','') IS NOT NULL THEN
          UPDATE funds SET balance = balance - (v_exp->>'amount')::numeric WHERE id = (v_exp->>'fund_id')::uuid;
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
        v_tx_id
      );
    END LOOP;
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$function$;

-- 2) Update sell_raw_material with same fix
CREATE OR REPLACE FUNCTION public.sell_raw_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL::uuid, p_fund_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text,
  p_services jsonb DEFAULT '[]'::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
      'production_sale', v_batch, 'psl_' || v_sale_id::text, 'بيع مواد خام'
    ) RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = v_sale_id;
  END IF;

  -- Customer payment → 'out' on contact ledger (offsets the sale)
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, category, date, contact_id, fund_id,
      source_type, posting_batch_id, idempotency_key, description
    ) VALUES (
      v_user_id, 'out', p_paid_amount, 'production_sale_payment', p_date, p_contact_id, p_fund_id,
      'production_sale_payment', v_batch, 'pslp_' || v_sale_id::text, 'دفعة عند البيع (تخفيض المديونية)'
    );
    UPDATE funds SET balance = balance + p_paid_amount, updated_at = now() WHERE id = p_fund_id;
  END IF;

  IF jsonb_typeof(p_services) = 'array' THEN
    FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      INSERT INTO production_sale_services (user_id, sale_id, service_id, name, amount)
      VALUES (v_user_id, v_sale_id,
        NULLIF(v_svc->>'service_id','')::uuid,
        COALESCE(v_svc->>'name',''),
        COALESCE((v_svc->>'amount')::numeric, 0));
    END LOOP;
  END IF;

  IF jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      v_tx_id := NULL;
      IF COALESCE((v_exp->>'treat_as_business')::boolean, true) AND COALESCE((v_exp->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO transactions (
          user_id, type, amount, category, date, fund_id,
          source_type, posting_batch_id, description
        ) VALUES (
          v_user_id, 'out', (v_exp->>'amount')::numeric, 'business_expense', p_date,
          NULLIF(v_exp->>'fund_id','')::uuid,
          'production_sale_expense', v_batch, COALESCE(v_exp->>'description','مصروف على البيع')
        ) RETURNING id INTO v_tx_id;
        IF NULLIF(v_exp->>'fund_id','') IS NOT NULL THEN
          UPDATE funds SET balance = balance - (v_exp->>'amount')::numeric WHERE id = (v_exp->>'fund_id')::uuid;
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
        v_tx_id
      );
    END LOOP;
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_sale_id;
END;
$function$;

-- 3) Backfill: legacy customer-payment rows that mistakenly used 'in' must become 'out'
UPDATE public.transactions
SET type = 'out'
WHERE source_type = 'production_sale_payment'
  AND type = 'in';

-- 4) Re-sync all production-related contact balances
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT contact_id
    FROM public.transactions
    WHERE source_type IN ('production_sale','production_sale_payment','production_purchase','production_purchase_payment')
      AND contact_id IS NOT NULL
  LOOP
    UPDATE public.contacts c SET
      total_debit = COALESCE(v.total_debit, 0),
      total_credit = COALESCE(v.total_credit, 0),
      balance = COALESCE(v.balance, 0),
      total_transactions = COALESCE(v.total_transactions, 0)
    FROM public.v_contact_balance v
    WHERE c.id = v.contact_id AND c.id = r.contact_id;
  END LOOP;
END $$;