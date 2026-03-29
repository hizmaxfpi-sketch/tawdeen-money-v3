
-- Drop views first (order matters due to dependencies)
DROP VIEW IF EXISTS public.v_invoice_balance;
DROP VIEW IF EXISTS public.v_contact_balance;
DROP VIEW IF EXISTS public.v_account_ledger;

-- ============================================================
-- 1. Recreate v_account_ledger with correct sign logic
-- ============================================================
CREATE VIEW public.v_account_ledger AS
SELECT
  t.id,
  t.user_id,
  t.contact_id,
  t.date,
  t.type,
  t.amount,
  CASE WHEN t.type = 'out' THEN t.amount ELSE -t.amount END AS signed_amount,
  t.fund_id,
  t.project_id,
  t.shipment_id,
  t.reference_id,
  t.posting_batch_id,
  t.created_at,
  t.description,
  t.notes,
  t.category,
  t.source_type
FROM transactions t
WHERE t.contact_id IS NOT NULL;

-- ============================================================
-- 2. Recreate v_contact_balance
-- ============================================================
CREATE VIEW public.v_contact_balance AS
SELECT
  t.contact_id,
  t.user_id,
  COUNT(*)::bigint AS total_transactions,
  COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.amount ELSE 0 END), 0) AS total_debit,
  COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.amount ELSE 0 END), 0) AS total_credit,
  COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.amount ELSE -t.amount END), 0) AS balance
FROM transactions t
WHERE t.contact_id IS NOT NULL
GROUP BY t.contact_id, t.user_id;

-- ============================================================
-- 3. Recreate v_invoice_balance
-- ============================================================
CREATE VIEW public.v_invoice_balance AS
SELECT
  s.id AS shipment_id,
  s.user_id,
  s.container_id,
  s.client_id,
  s.client_name,
  s.goods_type,
  s.cbm,
  s.contract_price,
  COALESCE(SUM(CASE WHEN t.source_type = 'shipment_invoice' THEN t.amount ELSE 0 END), 0) AS invoice_amount,
  COALESCE(SUM(CASE WHEN t.source_type = 'shipment_payment' THEN t.amount ELSE 0 END), 0) AS total_paid,
  GREATEST(0,
    COALESCE(SUM(CASE WHEN t.source_type = 'shipment_invoice' THEN t.amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN t.source_type = 'shipment_payment' THEN t.amount ELSE 0 END), 0)
  ) AS remaining,
  CASE
    WHEN COALESCE(SUM(CASE WHEN t.source_type = 'shipment_payment' THEN t.amount ELSE 0 END), 0) >= 
         COALESCE(SUM(CASE WHEN t.source_type = 'shipment_invoice' THEN t.amount ELSE 0 END), 0)
    THEN 'paid'
    WHEN COALESCE(SUM(CASE WHEN t.source_type = 'shipment_payment' THEN t.amount ELSE 0 END), 0) > 0
    THEN 'partial'
    ELSE 'unpaid'
  END AS calc_status
FROM shipments s
LEFT JOIN transactions t ON t.shipment_id = s.id
GROUP BY s.id, s.user_id, s.container_id, s.client_id, s.client_name, s.goods_type, s.cbm, s.contract_price;

-- ============================================================
-- 4. Rewrite create_shipment_with_accounting with p_fund_id + first payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_shipment_with_accounting(
  p_user_id uuid, p_container_id uuid,
  p_client_id uuid DEFAULT NULL, p_client_name text DEFAULT '',
  p_client_code text DEFAULT NULL, p_recipient_name text DEFAULT NULL,
  p_goods_type text DEFAULT '', p_length numeric DEFAULT 0,
  p_width numeric DEFAULT 0, p_height numeric DEFAULT 0,
  p_quantity integer DEFAULT 1, p_weight numeric DEFAULT 0,
  p_cbm numeric DEFAULT NULL, p_price_per_meter numeric DEFAULT 0,
  p_amount_paid numeric DEFAULT 0, p_tracking_number text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_china_expenses numeric DEFAULT 0,
  p_sea_freight numeric DEFAULT 0, p_port_delivery_fees numeric DEFAULT 0,
  p_customs_fees numeric DEFAULT 0, p_internal_transport_fees numeric DEFAULT 0,
  p_fund_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_shipment_id UUID; v_cbm NUMERIC; v_contract_price NUMERIC;
  v_remaining NUMERIC; v_payment_status TEXT;
  v_batch_id UUID := gen_random_uuid();
  v_is_closed BOOLEAN; v_payment_id UUID;
BEGIN
  SELECT is_manually_closed INTO v_is_closed FROM containers WHERE id = p_container_id;
  IF v_is_closed THEN RAISE EXCEPTION 'Container is manually closed'; END IF;

  v_cbm := COALESCE(NULLIF(p_cbm, 0), p_length * p_width * p_height * p_quantity);
  v_contract_price := v_cbm * p_price_per_meter;
  v_remaining := GREATEST(0, v_contract_price - p_amount_paid);
  v_payment_status := CASE WHEN v_remaining <= 0 THEN 'paid' WHEN p_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  INSERT INTO shipments (user_id, container_id, client_id, client_name, client_code, recipient_name,
    goods_type, length, width, height, quantity, weight, cbm, price_per_meter,
    contract_price, amount_paid, remaining_amount, payment_status, tracking_number, notes,
    china_expenses, sea_freight, port_delivery_fees, customs_fees, internal_transport_fees)
  VALUES (p_user_id, p_container_id, p_client_id, p_client_name, p_client_code, p_recipient_name,
    p_goods_type, p_length, p_width, p_height, p_quantity, p_weight, v_cbm, p_price_per_meter,
    v_contract_price, p_amount_paid, v_remaining, v_payment_status::payment_status, p_tracking_number, p_notes,
    p_china_expenses, p_sea_freight, p_port_delivery_fees, p_customs_fees, p_internal_transport_fees)
  RETURNING id INTO v_shipment_id;

  UPDATE containers SET
    used_capacity = used_capacity + v_cbm,
    total_revenue = total_revenue + v_contract_price,
    profit = (total_revenue + v_contract_price) - total_cost
  WHERE id = p_container_id;

  -- قيد الفاتورة (Out = مديونية على العميل)
  IF p_client_id IS NOT NULL AND v_contract_price > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, shipment_id, source_type, posting_batch_id,
      idempotency_key, notes, currency_code, exchange_rate)
    VALUES (p_user_id, 'out', 'client_collection', v_contract_price,
      'أجور شحن - ' || p_goods_type || ' - ' || v_cbm || ' CBM',
      CURRENT_DATE, p_client_id, v_shipment_id, 'shipment_invoice', v_batch_id,
      'si_' || v_shipment_id::text, 'قيد تلقائي من إنشاء شحنة', 'USD', 1);
  END IF;

  -- الدفعة الأولى
  IF p_amount_paid > 0 THEN
    INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note)
    VALUES (p_user_id, v_shipment_id, p_amount_paid, p_fund_id, 'دفعة أولى عند إنشاء الشحنة')
    RETURNING id INTO v_payment_id;

    IF p_fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance + p_amount_paid WHERE id = p_fund_id;
    END IF;

    IF p_client_id IS NOT NULL THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date,
        fund_id, contact_id, shipment_id, source_type, reference_id, posting_batch_id,
        idempotency_key, notes, currency_code, exchange_rate)
      VALUES (p_user_id, 'in', 'client_collection', p_amount_paid,
        'دفعة أولى - ' || p_goods_type,
        CURRENT_DATE, p_fund_id, p_client_id, v_shipment_id,
        'shipment_payment', v_payment_id, v_batch_id,
        'sp_' || v_payment_id::text, 'دفعة أولى عند إنشاء الشحنة', 'USD', 1);
    END IF;
  END IF;

  RETURN v_shipment_id;
END;
$$;

-- ============================================================
-- 5. process_shipment_payment with safe idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_shipment_payment(
  p_user_id uuid, p_shipment_id uuid, p_amount numeric,
  p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_shipment RECORD; v_new_paid NUMERIC; v_new_remaining NUMERIC;
  v_new_status TEXT; v_payment_id UUID;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note)
  VALUES (p_user_id, p_shipment_id, p_amount, p_fund_id, p_note)
  RETURNING id INTO v_payment_id;

  v_new_paid := v_shipment.amount_paid + p_amount;
  v_new_remaining := GREATEST(0, v_shipment.contract_price - v_new_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE shipments SET amount_paid = v_new_paid, remaining_amount = v_new_remaining,
    payment_status = v_new_status::payment_status WHERE id = p_shipment_id;

  IF p_fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_amount WHERE id = p_fund_id;
  END IF;

  INSERT INTO transactions (user_id, type, category, amount, description, date,
    fund_id, contact_id, shipment_id, source_type, reference_id, posting_batch_id,
    idempotency_key, notes, currency_code, exchange_rate)
  VALUES (p_user_id, 'in', 'client_collection', p_amount,
    'دفعة - ' || v_shipment.goods_type,
    CURRENT_DATE, p_fund_id, v_shipment.client_id, p_shipment_id,
    'shipment_payment', v_payment_id, v_batch_id,
    'sp_' || v_payment_id::text,
    COALESCE(p_note, 'دفعة شحن'), 'USD', 1);
END;
$$;

-- ============================================================
-- 6. delete_shipment_with_accounting (handles first payment too)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_shipment_with_accounting(p_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_shipment RECORD; v_payment RECORD;
BEGIN
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  UPDATE containers SET
    used_capacity = GREATEST(0, used_capacity - v_shipment.cbm),
    total_revenue = GREATEST(0, total_revenue - v_shipment.contract_price),
    profit = GREATEST(0, total_revenue - v_shipment.contract_price) - total_cost
  WHERE id = v_shipment.container_id;

  FOR v_payment IN SELECT * FROM shipment_payments WHERE shipment_id = p_shipment_id LOOP
    IF v_payment.fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance - v_payment.amount WHERE id = v_payment.fund_id;
    END IF;
  END LOOP;

  DELETE FROM transactions WHERE shipment_id = p_shipment_id;
  DELETE FROM shipment_payments WHERE shipment_id = p_shipment_id;
  DELETE FROM shipments WHERE id = p_shipment_id;
END;
$$;

-- ============================================================
-- 7. create_project_with_accounting with safe idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_project_with_accounting(
  p_user_id uuid, p_name text,
  p_client_id uuid DEFAULT NULL, p_vendor_id uuid DEFAULT NULL,
  p_contract_value numeric DEFAULT 0, p_expenses numeric DEFAULT 0,
  p_commission numeric DEFAULT 0, p_currency_difference numeric DEFAULT 0,
  p_status text DEFAULT 'active', p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_project_id UUID; v_profit NUMERIC; v_batch_id UUID := gen_random_uuid();
BEGIN
  v_profit := p_contract_value - p_expenses + p_commission + p_currency_difference;
  INSERT INTO projects (user_id, name, client_id, vendor_id, contract_value, expenses,
    received_amount, commission, currency_difference, profit, status, start_date, end_date, notes)
  VALUES (p_user_id, p_name, p_client_id, p_vendor_id, p_contract_value, p_expenses,
    0, p_commission, p_currency_difference, v_profit, p_status, p_start_date, p_end_date, p_notes)
  RETURNING id INTO v_project_id;

  IF p_client_id IS NOT NULL AND p_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (p_user_id, 'out', 'client_collection', p_contract_value,
      'قيمة عقد مشروع: ' || p_name, CURRENT_DATE, p_client_id, v_project_id,
      'project_client', v_batch_id, 'pc_' || v_project_id::text, 'قيد تلقائي من المشروع');
  END IF;

  IF p_vendor_id IS NOT NULL AND p_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (p_user_id, 'in', 'vendor_payment', p_expenses,
      'تكلفة مشروع: ' || p_name, CURRENT_DATE, p_vendor_id, v_project_id,
      'project_vendor', v_batch_id, 'pv_' || v_project_id::text, 'قيد تلقائي من المشروع');
  END IF;

  RETURN v_project_id;
END;
$$;

-- ============================================================
-- 8. update_shipment_with_accounting
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_shipment_with_accounting(
  p_shipment_id uuid, p_client_name text DEFAULT NULL, p_goods_type text DEFAULT NULL,
  p_length numeric DEFAULT NULL, p_width numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL, p_quantity integer DEFAULT NULL,
  p_price_per_meter numeric DEFAULT NULL, p_amount_paid numeric DEFAULT NULL,
  p_tracking_number text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_old RECORD; v_new_length NUMERIC; v_new_width NUMERIC; v_new_height NUMERIC;
  v_new_quantity INTEGER; v_new_price_per_meter NUMERIC; v_new_amount_paid NUMERIC;
  v_new_cbm NUMERIC; v_new_contract_price NUMERIC; v_new_remaining NUMERIC;
  v_new_status TEXT; v_price_changed BOOLEAN;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_old FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  v_new_length := COALESCE(p_length, v_old.length);
  v_new_width := COALESCE(p_width, v_old.width);
  v_new_height := COALESCE(p_height, v_old.height);
  v_new_quantity := COALESCE(p_quantity, v_old.quantity);
  v_new_price_per_meter := COALESCE(p_price_per_meter, v_old.price_per_meter);
  v_new_amount_paid := COALESCE(p_amount_paid, v_old.amount_paid);
  v_new_cbm := v_new_length * v_new_width * v_new_height * v_new_quantity;
  v_new_contract_price := v_new_cbm * v_new_price_per_meter;
  v_new_remaining := GREATEST(0, v_new_contract_price - v_new_amount_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' WHEN v_new_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;
  v_price_changed := v_new_contract_price != v_old.contract_price;

  UPDATE shipments SET
    client_name = COALESCE(p_client_name, v_old.client_name),
    goods_type = COALESCE(p_goods_type, v_old.goods_type),
    length = v_new_length, width = v_new_width, height = v_new_height,
    quantity = v_new_quantity, cbm = v_new_cbm,
    price_per_meter = v_new_price_per_meter, contract_price = v_new_contract_price,
    amount_paid = v_new_amount_paid, remaining_amount = v_new_remaining,
    payment_status = v_new_status::payment_status,
    tracking_number = COALESCE(p_tracking_number, v_old.tracking_number),
    notes = COALESCE(p_notes, v_old.notes)
  WHERE id = p_shipment_id;

  UPDATE containers SET
    used_capacity = GREATEST(0, used_capacity - v_old.cbm + v_new_cbm),
    total_revenue = GREATEST(0, total_revenue - v_old.contract_price + v_new_contract_price),
    profit = GREATEST(0, total_revenue - v_old.contract_price + v_new_contract_price) - total_cost
  WHERE id = v_old.container_id;

  IF v_old.client_id IS NOT NULL AND v_price_changed THEN
    DELETE FROM transactions WHERE shipment_id = p_shipment_id AND source_type = 'shipment_invoice';
    IF v_new_contract_price > 0 THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date,
        contact_id, shipment_id, source_type, posting_batch_id, idempotency_key, notes, currency_code, exchange_rate)
      VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_price,
        'أجور شحن - ' || COALESCE(p_goods_type, v_old.goods_type) || ' - ' || v_new_cbm || ' CBM',
        CURRENT_DATE, v_old.client_id, p_shipment_id, 'shipment_invoice', v_batch_id,
        'si_' || p_shipment_id::text, 'قيد تلقائي من تعديل شحنة', 'USD', 1);
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- 9. update_project_with_accounting
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_project_with_accounting(
  p_project_id uuid, p_name text DEFAULT NULL, p_client_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL, p_contract_value numeric DEFAULT NULL,
  p_expenses numeric DEFAULT NULL, p_commission numeric DEFAULT NULL,
  p_currency_difference numeric DEFAULT NULL, p_status text DEFAULT NULL,
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL,
  p_notes text DEFAULT NULL, p_received_amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_old RECORD; v_new_contract_value NUMERIC; v_new_expenses NUMERIC;
  v_new_commission NUMERIC; v_new_currency_difference NUMERIC; v_new_profit NUMERIC;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_old FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;

  v_new_contract_value := COALESCE(p_contract_value, v_old.contract_value);
  v_new_expenses := COALESCE(p_expenses, v_old.expenses);
  v_new_commission := COALESCE(p_commission, v_old.commission);
  v_new_currency_difference := COALESCE(p_currency_difference, v_old.currency_difference);
  v_new_profit := v_new_contract_value - v_new_expenses + v_new_commission + v_new_currency_difference;

  DELETE FROM transactions WHERE project_id = p_project_id AND source_type IN ('project_client', 'project_vendor');

  UPDATE projects SET
    name = COALESCE(p_name, v_old.name), client_id = p_client_id, vendor_id = p_vendor_id,
    contract_value = v_new_contract_value, expenses = v_new_expenses,
    received_amount = COALESCE(p_received_amount, v_old.received_amount),
    commission = v_new_commission, currency_difference = v_new_currency_difference,
    profit = v_new_profit, status = COALESCE(p_status, v_old.status),
    start_date = COALESCE(p_start_date, v_old.start_date),
    end_date = COALESCE(p_end_date, v_old.end_date),
    notes = COALESCE(p_notes, v_old.notes)
  WHERE id = p_project_id;

  IF p_client_id IS NOT NULL AND v_new_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_value,
      'قيمة عقد مشروع: ' || COALESCE(p_name, v_old.name), CURRENT_DATE, p_client_id,
      p_project_id, 'project_client', v_batch_id, 'pc_' || p_project_id::text, 'قيد تلقائي من تعديل المشروع');
  END IF;

  IF p_vendor_id IS NOT NULL AND v_new_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_old.user_id, 'in', 'vendor_payment', v_new_expenses,
      'تكلفة مشروع: ' || COALESCE(p_name, v_old.name), CURRENT_DATE, p_vendor_id,
      p_project_id, 'project_vendor', v_batch_id, 'pv_' || p_project_id::text, 'قيد تلقائي من تعديل المشروع');
  END IF;
END;
$$;
