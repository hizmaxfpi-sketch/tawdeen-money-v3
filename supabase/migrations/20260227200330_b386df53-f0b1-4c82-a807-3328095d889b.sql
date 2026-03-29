
CREATE OR REPLACE FUNCTION public.create_shipment_with_accounting(p_user_id uuid, p_container_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_client_name text DEFAULT ''::text, p_client_code text DEFAULT NULL::text, p_recipient_name text DEFAULT NULL::text, p_goods_type text DEFAULT ''::text, p_length numeric DEFAULT 0, p_width numeric DEFAULT 0, p_height numeric DEFAULT 0, p_quantity integer DEFAULT 1, p_weight numeric DEFAULT 0, p_cbm numeric DEFAULT NULL::numeric, p_price_per_meter numeric DEFAULT 0, p_amount_paid numeric DEFAULT 0, p_tracking_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_china_expenses numeric DEFAULT 0, p_sea_freight numeric DEFAULT 0, p_port_delivery_fees numeric DEFAULT 0, p_customs_fees numeric DEFAULT 0, p_internal_transport_fees numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment_id UUID;
  v_cbm NUMERIC;
  v_contract_price NUMERIC;
  v_remaining NUMERIC;
  v_payment_status TEXT;
  v_container RECORD;
  v_client_debit NUMERIC;
  v_client_credit NUMERIC;
  v_client_tx_count INTEGER;
  v_is_closed BOOLEAN;
BEGIN
  SELECT is_manually_closed INTO v_is_closed FROM containers WHERE id = p_container_id;
  IF v_is_closed THEN RAISE EXCEPTION 'Container is manually closed'; END IF;

  v_cbm := COALESCE(NULLIF(p_cbm, 0), p_length * p_width * p_height * p_quantity);
  v_contract_price := v_cbm * p_price_per_meter;
  v_remaining := GREATEST(0, v_contract_price - p_amount_paid);
  v_payment_status := CASE WHEN v_remaining <= 0 THEN 'paid' WHEN p_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  INSERT INTO shipments (user_id, container_id, client_id, client_name, client_code, recipient_name, goods_type, length, width, height, quantity, weight, cbm, price_per_meter, contract_price, amount_paid, remaining_amount, payment_status, tracking_number, notes, china_expenses, sea_freight, port_delivery_fees, customs_fees, internal_transport_fees)
  VALUES (p_user_id, p_container_id, p_client_id, p_client_name, p_client_code, p_recipient_name, p_goods_type, p_length, p_width, p_height, p_quantity, p_weight, v_cbm, p_price_per_meter, v_contract_price, p_amount_paid, v_remaining, v_payment_status::payment_status, p_tracking_number, p_notes, p_china_expenses, p_sea_freight, p_port_delivery_fees, p_customs_fees, p_internal_transport_fees)
  RETURNING id INTO v_shipment_id;

  SELECT used_capacity, total_revenue, total_cost INTO v_container FROM containers WHERE id = p_container_id FOR UPDATE;
  UPDATE containers SET
    used_capacity = v_container.used_capacity + v_cbm,
    total_revenue = v_container.total_revenue + v_contract_price,
    profit = (v_container.total_revenue + v_contract_price) - v_container.total_cost
  WHERE id = p_container_id;

  -- القيد المحاسبي: قيمة الشحنة تُسجل كـ credit في حساب العميل (سالب/أحمر = عليه لنا)
  IF p_client_id IS NOT NULL AND v_contract_price > 0 THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = p_client_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = v_client_credit + v_contract_price,
      balance = v_client_debit - (v_client_credit + v_contract_price),
      total_transactions = v_client_tx_count + 1
    WHERE id = p_client_id;

    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, notes, currency_code, exchange_rate)
    VALUES (p_user_id, 'out', 'client_collection', v_contract_price,
            'شحنة - ' || p_client_name || ' (' || p_goods_type || ') - ' || v_cbm || ' CBM',
            CURRENT_DATE, p_client_id, 'قيد تلقائي من إنشاء شحنة', 'USD', 1);
  END IF;

  RETURN v_shipment_id;
END;
$function$;

-- Fix update_shipment_with_accounting to use credit instead of debit
CREATE OR REPLACE FUNCTION public.update_shipment_with_accounting(p_shipment_id uuid, p_client_name text DEFAULT NULL::text, p_goods_type text DEFAULT NULL::text, p_length numeric DEFAULT NULL::numeric, p_width numeric DEFAULT NULL::numeric, p_height numeric DEFAULT NULL::numeric, p_quantity integer DEFAULT NULL::integer, p_price_per_meter numeric DEFAULT NULL::numeric, p_amount_paid numeric DEFAULT NULL::numeric, p_tracking_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_new_length NUMERIC; v_new_width NUMERIC; v_new_height NUMERIC;
  v_new_quantity INTEGER; v_new_price_per_meter NUMERIC; v_new_amount_paid NUMERIC;
  v_new_cbm NUMERIC; v_new_contract_price NUMERIC; v_new_remaining NUMERIC;
  v_new_status TEXT; v_container RECORD;
  v_client_debit NUMERIC; v_client_credit NUMERIC; v_client_tx INTEGER;
  v_price_changed BOOLEAN;
  v_old_tx_id UUID;
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

  SELECT used_capacity, total_revenue, total_cost INTO v_container
  FROM containers WHERE id = v_old.container_id FOR UPDATE;
  UPDATE containers SET
    used_capacity = GREATEST(0, v_container.used_capacity - v_old.cbm + v_new_cbm),
    total_revenue = GREATEST(0, v_container.total_revenue - v_old.contract_price + v_new_contract_price),
    profit = GREATEST(0, v_container.total_revenue - v_old.contract_price + v_new_contract_price) - v_container.total_cost
  WHERE id = v_old.container_id;

  -- تحديث حساب العميل: عكس القيد القديم (credit) وإنشاء الجديد (credit)
  IF v_old.client_id IS NOT NULL AND v_price_changed THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx
    FROM contacts WHERE id = v_old.client_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = GREATEST(0, v_client_credit - v_old.contract_price + v_new_contract_price),
      balance = v_client_debit - GREATEST(0, v_client_credit - v_old.contract_price + v_new_contract_price)
    WHERE id = v_old.client_id;

    -- حذف العملية المالية القديمة
    SELECT id INTO v_old_tx_id FROM transactions
    WHERE contact_id = v_old.client_id AND category = 'client_collection'
      AND description LIKE 'شحنة - %' AND amount = v_old.contract_price AND user_id = v_old.user_id
    ORDER BY created_at DESC FETCH FIRST 1 ROW ONLY;

    IF v_old_tx_id IS NOT NULL THEN
      DELETE FROM transactions WHERE id = v_old_tx_id;
    END IF;

    IF v_new_contract_price > 0 THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, notes, currency_code, exchange_rate)
      VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_price,
              'شحنة - ' || COALESCE(p_client_name, v_old.client_name) || ' (' || COALESCE(p_goods_type, v_old.goods_type) || ') - ' || v_new_cbm || ' CBM',
              CURRENT_DATE, v_old.client_id, 'قيد تلقائي من تعديل شحنة', 'USD', 1);
    END IF;
  END IF;
END;
$function$;

-- Fix delete_shipment_with_accounting to reverse credit instead of debit
CREATE OR REPLACE FUNCTION public.delete_shipment_with_accounting(p_shipment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment RECORD;
  v_container RECORD;
  v_client_debit NUMERIC; v_client_credit NUMERIC; v_client_tx_count INTEGER;
  v_fund_balance NUMERIC;
  v_payment RECORD;
BEGIN
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  SELECT used_capacity, total_revenue, total_cost INTO v_container FROM containers WHERE id = v_shipment.container_id FOR UPDATE;
  UPDATE containers SET
    used_capacity = GREATEST(0, v_container.used_capacity - v_shipment.cbm),
    total_revenue = GREATEST(0, v_container.total_revenue - v_shipment.contract_price),
    profit = GREATEST(0, v_container.total_revenue - v_shipment.contract_price) - v_container.total_cost
  WHERE id = v_shipment.container_id;

  FOR v_payment IN SELECT * FROM shipment_payments WHERE shipment_id = p_shipment_id LOOP
    IF v_payment.fund_id IS NOT NULL THEN
      SELECT balance INTO v_fund_balance FROM funds WHERE id = v_payment.fund_id FOR UPDATE;
      UPDATE funds SET balance = v_fund_balance - v_payment.amount WHERE id = v_payment.fund_id;
    END IF;
  END LOOP;

  -- عكس القيد المحاسبي: كان credit فنعكسه
  IF v_shipment.client_id IS NOT NULL THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = v_shipment.client_id FOR UPDATE;

    v_client_credit := GREATEST(0, v_client_credit - v_shipment.contract_price);

    UPDATE contacts SET
      total_credit = v_client_credit,
      balance = v_client_debit - v_client_credit,
      total_transactions = GREATEST(0, v_client_tx_count - 1)
    WHERE id = v_shipment.client_id;

    DELETE FROM transactions
    WHERE contact_id = v_shipment.client_id AND category = 'client_collection'
      AND description LIKE 'شحنة - %' AND user_id = v_shipment.user_id;
  END IF;

  DELETE FROM shipment_payments WHERE shipment_id = p_shipment_id;
  DELETE FROM shipments WHERE id = p_shipment_id;
END;
$function$;
