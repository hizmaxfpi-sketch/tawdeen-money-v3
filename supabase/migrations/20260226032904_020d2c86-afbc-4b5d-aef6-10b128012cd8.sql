
-- ============= 1. دالة إضافة شحنة مع المحاسبة =============
CREATE OR REPLACE FUNCTION public.create_shipment_with_accounting(
  p_user_id UUID,
  p_container_id UUID,
  p_client_id UUID DEFAULT NULL,
  p_client_name TEXT DEFAULT '',
  p_client_code TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_goods_type TEXT DEFAULT '',
  p_length NUMERIC DEFAULT 0,
  p_width NUMERIC DEFAULT 0,
  p_height NUMERIC DEFAULT 0,
  p_quantity INTEGER DEFAULT 1,
  p_weight NUMERIC DEFAULT 0,
  p_cbm NUMERIC DEFAULT NULL,
  p_price_per_meter NUMERIC DEFAULT 0,
  p_amount_paid NUMERIC DEFAULT 0,
  p_tracking_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_china_expenses NUMERIC DEFAULT 0,
  p_sea_freight NUMERIC DEFAULT 0,
  p_port_delivery_fees NUMERIC DEFAULT 0,
  p_customs_fees NUMERIC DEFAULT 0,
  p_internal_transport_fees NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  -- حساب CBM
  v_cbm := COALESCE(NULLIF(p_cbm, 0), p_length * p_width * p_height * p_quantity);
  v_contract_price := v_cbm * p_price_per_meter;
  v_remaining := GREATEST(0, v_contract_price - p_amount_paid);
  v_payment_status := CASE WHEN v_remaining <= 0 THEN 'paid' WHEN p_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  -- 1. إدراج الشحنة
  INSERT INTO shipments (user_id, container_id, client_id, client_name, client_code, recipient_name, goods_type, length, width, height, quantity, weight, cbm, price_per_meter, contract_price, amount_paid, remaining_amount, payment_status, tracking_number, notes, china_expenses, sea_freight, port_delivery_fees, customs_fees, internal_transport_fees)
  VALUES (p_user_id, p_container_id, p_client_id, p_client_name, p_client_code, p_recipient_name, p_goods_type, p_length, p_width, p_height, p_quantity, p_weight, v_cbm, p_price_per_meter, v_contract_price, p_amount_paid, v_remaining, v_payment_status::payment_status, p_tracking_number, p_notes, p_china_expenses, p_sea_freight, p_port_delivery_fees, p_customs_fees, p_internal_transport_fees)
  RETURNING id INTO v_shipment_id;

  -- 2. تحديث الحاوية (سعة + إيرادات + ربح)
  SELECT used_capacity, total_revenue, total_cost INTO v_container FROM containers WHERE id = p_container_id FOR UPDATE;
  UPDATE containers SET
    used_capacity = v_container.used_capacity + v_cbm,
    total_revenue = v_container.total_revenue + v_contract_price,
    profit = (v_container.total_revenue + v_contract_price) - v_container.total_cost
  WHERE id = p_container_id;

  -- 3. تسجيل مديونية العميل (إن وجد)
  IF p_client_id IS NOT NULL AND v_contract_price > 0 THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = p_client_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = v_client_debit + v_contract_price,
      balance = (v_client_debit + v_contract_price) - v_client_credit,
      total_transactions = v_client_tx_count + 1
    WHERE id = p_client_id;
  END IF;

  RETURN v_shipment_id;
END;
$$;

-- ============= 2. دالة حذف شحنة مع عكس المحاسبة =============
CREATE OR REPLACE FUNCTION public.delete_shipment_with_accounting(
  p_shipment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shipment RECORD;
  v_container RECORD;
  v_total_payments NUMERIC;
  v_client_debit NUMERIC;
  v_client_credit NUMERIC;
  v_client_tx_count INTEGER;
  v_fund_balance NUMERIC;
  v_payment RECORD;
BEGIN
  -- جلب بيانات الشحنة
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  -- 1. عكس تأثير الحاوية
  SELECT used_capacity, total_revenue, total_cost INTO v_container FROM containers WHERE id = v_shipment.container_id FOR UPDATE;
  UPDATE containers SET
    used_capacity = GREATEST(0, v_container.used_capacity - v_shipment.cbm),
    total_revenue = GREATEST(0, v_container.total_revenue - v_shipment.contract_price),
    profit = GREATEST(0, v_container.total_revenue - v_shipment.contract_price) - v_container.total_cost
  WHERE id = v_shipment.container_id;

  -- 2. عكس مدفوعات الصناديق
  FOR v_payment IN SELECT * FROM shipment_payments WHERE shipment_id = p_shipment_id LOOP
    IF v_payment.fund_id IS NOT NULL THEN
      SELECT balance INTO v_fund_balance FROM funds WHERE id = v_payment.fund_id FOR UPDATE;
      UPDATE funds SET balance = v_fund_balance - v_payment.amount WHERE id = v_payment.fund_id;
    END IF;
  END LOOP;

  -- 3. عكس مديونية العميل
  IF v_shipment.client_id IS NOT NULL THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = v_shipment.client_id FOR UPDATE;

    -- عكس الـ debit (قيمة العقد) وعكس الـ credit (المدفوعات)
    v_client_debit := GREATEST(0, v_client_debit - v_shipment.contract_price);
    v_client_credit := GREATEST(0, v_client_credit - v_shipment.amount_paid);

    UPDATE contacts SET
      total_debit = v_client_debit,
      total_credit = v_client_credit,
      balance = v_client_debit - v_client_credit,
      total_transactions = GREATEST(0, v_client_tx_count - 1)
    WHERE id = v_shipment.client_id;
  END IF;

  -- 4. حذف المدفوعات ثم الشحنة
  DELETE FROM shipment_payments WHERE shipment_id = p_shipment_id;
  DELETE FROM shipments WHERE id = p_shipment_id;
END;
$$;

-- ============= 3. تحديث دالة دفعة الشحنة الموجودة =============
CREATE OR REPLACE FUNCTION public.process_shipment_payment(
  p_user_id UUID,
  p_shipment_id UUID,
  p_amount NUMERIC,
  p_fund_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shipment RECORD;
  v_new_paid NUMERIC;
  v_new_remaining NUMERIC;
  v_new_status TEXT;
  v_fund_balance NUMERIC;
  v_client_debit NUMERIC;
  v_client_credit NUMERIC;
  v_client_tx_count INTEGER;
BEGIN
  -- جلب بيانات الشحنة
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  -- 1. إدراج الدفعة
  INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note)
  VALUES (p_user_id, p_shipment_id, p_amount, p_fund_id, p_note);

  -- 2. تحديث الشحنة
  v_new_paid := v_shipment.amount_paid + p_amount;
  v_new_remaining := GREATEST(0, v_shipment.contract_price - v_new_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE shipments SET
    amount_paid = v_new_paid,
    remaining_amount = v_new_remaining,
    payment_status = v_new_status::payment_status
  WHERE id = p_shipment_id;

  -- 3. تحديث رصيد الصندوق (إضافة لأنه تحصيل)
  IF p_fund_id IS NOT NULL THEN
    SELECT balance INTO v_fund_balance FROM funds WHERE id = p_fund_id FOR UPDATE;
    UPDATE funds SET balance = v_fund_balance + p_amount WHERE id = p_fund_id;
  END IF;

  -- 4. تحديث رصيد العميل (credit = سدد جزء من المديونية)
  IF v_shipment.client_id IS NOT NULL THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = v_shipment.client_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = v_client_credit + p_amount,
      balance = v_client_debit - (v_client_credit + p_amount),
      total_transactions = v_client_tx_count + 1
    WHERE id = v_shipment.client_id;
  END IF;
END;
$$;

-- ============= 4. دالة حذف حاوية مع كل محتوياتها =============
CREATE OR REPLACE FUNCTION public.delete_container_with_shipments(
  p_container_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shipment RECORD;
BEGIN
  -- حذف كل شحنة محاسبياً
  FOR v_shipment IN SELECT id FROM shipments WHERE container_id = p_container_id LOOP
    PERFORM delete_shipment_with_accounting(v_shipment.id);
  END LOOP;

  -- حذف الحاوية
  DELETE FROM containers WHERE id = p_container_id;
END;
$$;
