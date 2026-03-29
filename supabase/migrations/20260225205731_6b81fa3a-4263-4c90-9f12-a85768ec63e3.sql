
-- ============= 1. دالة إضافة عملية مالية ذرية =============
CREATE OR REPLACE FUNCTION public.process_transaction(
  p_user_id UUID,
  p_type TEXT,
  p_category TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_date DATE,
  p_fund_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_currency_code TEXT DEFAULT 'USD',
  p_exchange_rate NUMERIC DEFAULT 1,
  p_original_amount NUMERIC DEFAULT NULL,
  p_to_fund_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id UUID;
  v_current_balance NUMERIC;
  v_current_debit NUMERIC;
  v_current_credit NUMERIC;
  v_current_tx_count INTEGER;
BEGIN
  -- 1. إدراج العملية
  INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, contact_id, project_id, notes, currency_code, exchange_rate)
  VALUES (p_user_id, p_type::transaction_type, p_category, p_amount, p_description, p_date, p_fund_id, p_contact_id, p_project_id, p_notes, p_currency_code, p_exchange_rate)
  RETURNING id INTO v_tx_id;

  -- 2. تحديث رصيد الصندوق
  IF p_fund_id IS NOT NULL THEN
    SELECT balance INTO v_current_balance FROM funds WHERE id = p_fund_id FOR UPDATE;
    IF p_type = 'in' THEN
      UPDATE funds SET balance = v_current_balance + p_amount WHERE id = p_fund_id;
    ELSE
      UPDATE funds SET balance = v_current_balance - p_amount WHERE id = p_fund_id;
    END IF;
  END IF;

  -- 3. تحديث رصيد جهة الاتصال (= الحساب الدفتري)
  IF p_contact_id IS NOT NULL THEN
    SELECT total_debit, total_credit, total_transactions INTO v_current_debit, v_current_credit, v_current_tx_count
    FROM contacts WHERE id = p_contact_id FOR UPDATE;
    
    IF p_type = 'in' THEN
      -- وارد = تحصيل من العميل = credit
      v_current_credit := v_current_credit + p_amount;
    ELSE
      -- صادر = دفع للمورد = debit
      v_current_debit := v_current_debit + p_amount;
    END IF;
    
    UPDATE contacts SET
      total_debit = v_current_debit,
      total_credit = v_current_credit,
      balance = v_current_debit - v_current_credit,
      total_transactions = v_current_tx_count + 1
    WHERE id = p_contact_id;
  END IF;

  -- 4. تحويل بين صناديق
  IF p_category = 'fund_transfer' AND p_to_fund_id IS NOT NULL THEN
    SELECT balance INTO v_current_balance FROM funds WHERE id = p_to_fund_id FOR UPDATE;
    UPDATE funds SET balance = v_current_balance + p_amount WHERE id = p_to_fund_id;
  END IF;

  -- 5. تحديث المشروع
  IF p_project_id IS NOT NULL THEN
    IF p_type = 'out' THEN
      UPDATE projects SET 
        expenses = expenses + p_amount,
        profit = contract_value - (expenses + p_amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0)
      WHERE id = p_project_id;
    ELSE
      UPDATE projects SET 
        received_amount = received_amount + p_amount
      WHERE id = p_project_id;
    END IF;
  END IF;

  RETURN v_tx_id;
END;
$$;

-- ============= 2. دالة حذف عملية مالية ذرية =============
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx RECORD;
  v_current_balance NUMERIC;
  v_current_debit NUMERIC;
  v_current_credit NUMERIC;
  v_current_tx_count INTEGER;
BEGIN
  -- جلب بيانات العملية
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  -- 1. عكس رصيد الصندوق
  IF v_tx.fund_id IS NOT NULL THEN
    SELECT balance INTO v_current_balance FROM funds WHERE id = v_tx.fund_id FOR UPDATE;
    IF v_tx.type = 'in' THEN
      UPDATE funds SET balance = v_current_balance - v_tx.amount WHERE id = v_tx.fund_id;
    ELSE
      UPDATE funds SET balance = v_current_balance + v_tx.amount WHERE id = v_tx.fund_id;
    END IF;
  END IF;

  -- 2. عكس رصيد جهة الاتصال
  IF v_tx.contact_id IS NOT NULL THEN
    SELECT total_debit, total_credit, total_transactions INTO v_current_debit, v_current_credit, v_current_tx_count
    FROM contacts WHERE id = v_tx.contact_id FOR UPDATE;
    
    IF v_tx.type = 'in' THEN
      v_current_credit := GREATEST(0, v_current_credit - v_tx.amount);
    ELSE
      v_current_debit := GREATEST(0, v_current_debit - v_tx.amount);
    END IF;
    
    UPDATE contacts SET
      total_debit = v_current_debit,
      total_credit = v_current_credit,
      balance = v_current_debit - v_current_credit,
      total_transactions = GREATEST(0, v_current_tx_count - 1)
    WHERE id = v_tx.contact_id;
  END IF;

  -- 3. عكس تأثير المشروع
  IF v_tx.project_id IS NOT NULL THEN
    IF v_tx.type = 'out' THEN
      UPDATE projects SET
        expenses = GREATEST(0, expenses - v_tx.amount),
        profit = contract_value - GREATEST(0, expenses - v_tx.amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0)
      WHERE id = v_tx.project_id;
    ELSE
      UPDATE projects SET received_amount = GREATEST(0, received_amount - v_tx.amount)
      WHERE id = v_tx.project_id;
    END IF;
  END IF;

  -- 4. حذف العملية
  DELETE FROM transactions WHERE id = p_transaction_id;
END;
$$;

-- ============= 3. دالة دفع شحنة ذرية =============
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
BEGIN
  -- جلب بيانات الشحنة
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  -- إدراج الدفعة
  INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note)
  VALUES (p_user_id, p_shipment_id, p_amount, p_fund_id, p_note);

  -- تحديث الشحنة
  v_new_paid := v_shipment.amount_paid + p_amount;
  v_new_remaining := GREATEST(0, v_shipment.contract_price - v_new_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE shipments SET
    amount_paid = v_new_paid,
    remaining_amount = v_new_remaining,
    payment_status = v_new_status::payment_status
  WHERE id = p_shipment_id;

  -- تحديث رصيد الصندوق
  IF p_fund_id IS NOT NULL THEN
    SELECT balance INTO v_fund_balance FROM funds WHERE id = p_fund_id FOR UPDATE;
    UPDATE funds SET balance = v_fund_balance + p_amount WHERE id = p_fund_id;
  END IF;
END;
$$;
