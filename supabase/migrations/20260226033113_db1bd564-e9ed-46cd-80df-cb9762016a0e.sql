
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

  -- 1. إدراج الدفعة في shipment_payments
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

  -- 5. تسجيل العملية في السجل المالي العام (transactions)
  INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, contact_id, notes, currency_code, exchange_rate)
  VALUES (
    p_user_id,
    'in',
    'client_collection',
    p_amount,
    'دفعة شحنة - ' || v_shipment.client_name || ' (' || v_shipment.goods_type || ')',
    CURRENT_DATE,
    p_fund_id,
    v_shipment.client_id,
    COALESCE(p_note, 'دفعة شحن تلقائية'),
    'USD',
    1
  );
END;
$$;
