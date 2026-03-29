
CREATE OR REPLACE FUNCTION public.create_project_with_accounting(
  p_user_id UUID,
  p_name TEXT,
  p_client_id UUID DEFAULT NULL,
  p_vendor_id UUID DEFAULT NULL,
  p_contract_value NUMERIC DEFAULT 0,
  p_expenses NUMERIC DEFAULT 0,
  p_commission NUMERIC DEFAULT 0,
  p_currency_difference NUMERIC DEFAULT 0,
  p_status TEXT DEFAULT 'active',
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id UUID;
  v_profit NUMERIC;
  v_client_debit NUMERIC;
  v_client_credit NUMERIC;
  v_client_tx_count INTEGER;
  v_vendor_debit NUMERIC;
  v_vendor_credit NUMERIC;
  v_vendor_tx_count INTEGER;
BEGIN
  -- حساب الربح
  v_profit := p_contract_value - p_expenses + p_commission + p_currency_difference;

  -- 1. إنشاء المشروع
  INSERT INTO projects (user_id, name, client_id, vendor_id, contract_value, expenses, received_amount, commission, currency_difference, profit, status, start_date, end_date, notes)
  VALUES (p_user_id, p_name, p_client_id, p_vendor_id, p_contract_value, p_expenses, 0, p_commission, p_currency_difference, v_profit, p_status, p_start_date, p_end_date, p_notes)
  RETURNING id INTO v_project_id;

  -- 2. قيد مدين للعميل (العميل مدين لنا بقيمة العقد)
  IF p_client_id IS NOT NULL AND p_contract_value > 0 THEN
    -- تسجيل عملية وارد (تحصيل مستحق من العميل)
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (p_user_id, 'in', 'client_collection', p_contract_value,
            'ترحيل تلقائي - قيمة عقد مشروع: ' || p_name,
            CURRENT_DATE, p_client_id, v_project_id, 'قيد تلقائي من المشروع');

    -- تحديث رصيد العميل (مدين = عليه لنا)
    SELECT total_debit, total_credit, total_transactions
    INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = p_client_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = v_client_debit + p_contract_value,
      total_credit = v_client_credit,
      balance = (v_client_debit + p_contract_value) - v_client_credit,
      total_transactions = v_client_tx_count + 1
    WHERE id = p_client_id;
  END IF;

  -- 3. قيد دائن للمورد (نحن مدينون للمورد بسعر التكلفة)
  IF p_vendor_id IS NOT NULL AND p_expenses > 0 THEN
    -- تسجيل عملية صادر (التزام تجاه المورد)
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (p_user_id, 'out', 'vendor_payment', p_expenses,
            'ترحيل تلقائي - تكلفة مشروع: ' || p_name,
            CURRENT_DATE, p_vendor_id, v_project_id, 'قيد تلقائي من المشروع');

    -- تحديث رصيد المورد (دائن = لنا عنده)
    SELECT total_debit, total_credit, total_transactions
    INTO v_vendor_debit, v_vendor_credit, v_vendor_tx_count
    FROM contacts WHERE id = p_vendor_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = v_vendor_debit,
      total_credit = v_vendor_credit + p_expenses,
      balance = v_vendor_debit - (v_vendor_credit + p_expenses),
      total_transactions = v_vendor_tx_count + 1
    WHERE id = p_vendor_id;
  END IF;

  RETURN v_project_id;
END;
$$;
