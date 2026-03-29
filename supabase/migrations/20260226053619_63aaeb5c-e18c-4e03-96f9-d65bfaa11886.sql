
-- 1. update_project_with_accounting RPC
CREATE OR REPLACE FUNCTION public.update_project_with_accounting(
  p_project_id uuid,
  p_name text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_contract_value numeric DEFAULT NULL,
  p_expenses numeric DEFAULT NULL,
  p_commission numeric DEFAULT NULL,
  p_currency_difference numeric DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_received_amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old RECORD;
  v_new_contract_value NUMERIC;
  v_new_expenses NUMERIC;
  v_new_commission NUMERIC;
  v_new_currency_difference NUMERIC;
  v_new_profit NUMERIC;
  v_old_client_debit NUMERIC;
  v_old_client_credit NUMERIC;
  v_old_client_tx INTEGER;
  v_new_client_debit NUMERIC;
  v_new_client_credit NUMERIC;
  v_new_client_tx INTEGER;
  v_old_vendor_debit NUMERIC;
  v_old_vendor_credit NUMERIC;
  v_old_vendor_tx INTEGER;
  v_new_vendor_debit NUMERIC;
  v_new_vendor_credit NUMERIC;
  v_new_vendor_tx INTEGER;
BEGIN
  -- جلب المشروع الحالي
  SELECT * INTO v_old FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;

  v_new_contract_value := COALESCE(p_contract_value, v_old.contract_value);
  v_new_expenses := COALESCE(p_expenses, v_old.expenses);
  v_new_commission := COALESCE(p_commission, v_old.commission);
  v_new_currency_difference := COALESCE(p_currency_difference, v_old.currency_difference);
  v_new_profit := v_new_contract_value - v_new_expenses + v_new_commission + v_new_currency_difference;

  -- === عكس القيود القديمة ===

  -- عكس قيد العميل القديم
  IF v_old.client_id IS NOT NULL AND v_old.contract_value > 0 THEN
    SELECT total_debit, total_credit, total_transactions INTO v_old_client_debit, v_old_client_credit, v_old_client_tx
    FROM contacts WHERE id = v_old.client_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = GREATEST(0, v_old_client_debit - v_old.contract_value),
      balance = GREATEST(0, v_old_client_debit - v_old.contract_value) - v_old_client_credit,
      total_transactions = GREATEST(0, v_old_client_tx - 1)
    WHERE id = v_old.client_id;

    -- حذف القيد المالي القديم
    DELETE FROM transactions
    WHERE project_id = p_project_id AND contact_id = v_old.client_id AND category = 'client_collection';
  END IF;

  -- عكس قيد المورد القديم
  IF v_old.vendor_id IS NOT NULL AND v_old.expenses > 0 THEN
    SELECT total_debit, total_credit, total_transactions INTO v_old_vendor_debit, v_old_vendor_credit, v_old_vendor_tx
    FROM contacts WHERE id = v_old.vendor_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = GREATEST(0, v_old_vendor_credit - v_old.expenses),
      balance = v_old_vendor_debit - GREATEST(0, v_old_vendor_credit - v_old.expenses),
      total_transactions = GREATEST(0, v_old_vendor_tx - 1)
    WHERE id = v_old.vendor_id;

    DELETE FROM transactions
    WHERE project_id = p_project_id AND contact_id = v_old.vendor_id AND category = 'vendor_payment';
  END IF;

  -- === تحديث المشروع ===
  UPDATE projects SET
    name = COALESCE(p_name, v_old.name),
    client_id = p_client_id,
    vendor_id = p_vendor_id,
    contract_value = v_new_contract_value,
    expenses = v_new_expenses,
    received_amount = COALESCE(p_received_amount, v_old.received_amount),
    commission = v_new_commission,
    currency_difference = v_new_currency_difference,
    profit = v_new_profit,
    status = COALESCE(p_status, v_old.status),
    start_date = COALESCE(p_start_date, v_old.start_date),
    end_date = COALESCE(p_end_date, v_old.end_date),
    notes = COALESCE(p_notes, v_old.notes)
  WHERE id = p_project_id;

  -- === إنشاء القيود الجديدة ===

  -- قيد العميل الجديد
  IF p_client_id IS NOT NULL AND v_new_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (v_old.user_id, 'in', 'client_collection', v_new_contract_value,
            'ترحيل تلقائي - قيمة عقد مشروع: ' || COALESCE(p_name, v_old.name),
            CURRENT_DATE, p_client_id, p_project_id, 'قيد تلقائي من تعديل المشروع');

    SELECT total_debit, total_credit, total_transactions INTO v_new_client_debit, v_new_client_credit, v_new_client_tx
    FROM contacts WHERE id = p_client_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = v_new_client_debit + v_new_contract_value,
      balance = (v_new_client_debit + v_new_contract_value) - v_new_client_credit,
      total_transactions = v_new_client_tx + 1
    WHERE id = p_client_id;
  END IF;

  -- قيد المورد الجديد
  IF p_vendor_id IS NOT NULL AND v_new_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (v_old.user_id, 'out', 'vendor_payment', v_new_expenses,
            'ترحيل تلقائي - تكلفة مشروع: ' || COALESCE(p_name, v_old.name),
            CURRENT_DATE, p_vendor_id, p_project_id, 'قيد تلقائي من تعديل المشروع');

    SELECT total_debit, total_credit, total_transactions INTO v_new_vendor_debit, v_new_vendor_credit, v_new_vendor_tx
    FROM contacts WHERE id = p_vendor_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = v_new_vendor_credit + v_new_expenses,
      balance = v_new_vendor_debit - (v_new_vendor_credit + v_new_expenses),
      total_transactions = v_new_vendor_tx + 1
    WHERE id = p_vendor_id;
  END IF;
END;
$$;

-- 2. update_shipment_with_accounting RPC
CREATE OR REPLACE FUNCTION public.update_shipment_with_accounting(
  p_shipment_id uuid,
  p_client_name text DEFAULT NULL,
  p_goods_type text DEFAULT NULL,
  p_length numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_quantity integer DEFAULT NULL,
  p_price_per_meter numeric DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old RECORD;
  v_new_length NUMERIC;
  v_new_width NUMERIC;
  v_new_height NUMERIC;
  v_new_quantity INTEGER;
  v_new_price_per_meter NUMERIC;
  v_new_amount_paid NUMERIC;
  v_new_cbm NUMERIC;
  v_new_contract_price NUMERIC;
  v_new_remaining NUMERIC;
  v_new_status TEXT;
  v_container RECORD;
  v_client_debit NUMERIC;
  v_client_credit NUMERIC;
  v_client_tx INTEGER;
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

  -- 1. تحديث الشحنة
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

  -- 2. تحديث الحاوية (الفرق)
  SELECT used_capacity, total_revenue, total_cost INTO v_container
  FROM containers WHERE id = v_old.container_id FOR UPDATE;

  UPDATE containers SET
    used_capacity = GREATEST(0, v_container.used_capacity - v_old.cbm + v_new_cbm),
    total_revenue = GREATEST(0, v_container.total_revenue - v_old.contract_price + v_new_contract_price),
    profit = GREATEST(0, v_container.total_revenue - v_old.contract_price + v_new_contract_price) - v_container.total_cost
  WHERE id = v_old.container_id;

  -- 3. تحديث رصيد العميل (الفرق)
  IF v_old.client_id IS NOT NULL AND (v_new_contract_price != v_old.contract_price) THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx
    FROM contacts WHERE id = v_old.client_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = GREATEST(0, v_client_debit - v_old.contract_price + v_new_contract_price),
      balance = GREATEST(0, v_client_debit - v_old.contract_price + v_new_contract_price) - v_client_credit
    WHERE id = v_old.client_id;
  END IF;
END;
$$;
