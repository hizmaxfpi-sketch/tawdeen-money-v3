
CREATE OR REPLACE FUNCTION public.create_project_with_accounting(p_user_id uuid, p_name text, p_client_id uuid DEFAULT NULL::uuid, p_vendor_id uuid DEFAULT NULL::uuid, p_contract_value numeric DEFAULT 0, p_expenses numeric DEFAULT 0, p_commission numeric DEFAULT 0, p_currency_difference numeric DEFAULT 0, p_status text DEFAULT 'active'::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_profit := p_contract_value - p_expenses + p_commission + p_currency_difference;

  INSERT INTO projects (user_id, name, client_id, vendor_id, contract_value, expenses, received_amount, commission, currency_difference, profit, status, start_date, end_date, notes)
  VALUES (p_user_id, p_name, p_client_id, p_vendor_id, p_contract_value, p_expenses, 0, p_commission, p_currency_difference, v_profit, p_status, p_start_date, p_end_date, p_notes)
  RETURNING id INTO v_project_id;

  -- قيد العميل: قيمة العقد تُسجل كـ credit (سالب/أحمر = عليه لنا)
  IF p_client_id IS NOT NULL AND p_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (p_user_id, 'out', 'client_collection', p_contract_value,
            'ترحيل تلقائي - قيمة عقد مشروع: ' || p_name,
            CURRENT_DATE, p_client_id, v_project_id, 'قيد تلقائي من المشروع');

    SELECT total_debit, total_credit, total_transactions
    INTO v_client_debit, v_client_credit, v_client_tx_count
    FROM contacts WHERE id = p_client_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = v_client_credit + p_contract_value,
      balance = v_client_debit - (v_client_credit + p_contract_value),
      total_transactions = v_client_tx_count + 1
    WHERE id = p_client_id;
  END IF;

  -- قيد المورد: التكلفة تُسجل كـ debit (موجب/أخضر = له عندنا)
  IF p_vendor_id IS NOT NULL AND p_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (p_user_id, 'in', 'vendor_payment', p_expenses,
            'ترحيل تلقائي - تكلفة مشروع: ' || p_name,
            CURRENT_DATE, p_vendor_id, v_project_id, 'قيد تلقائي من المشروع');

    SELECT total_debit, total_credit, total_transactions
    INTO v_vendor_debit, v_vendor_credit, v_vendor_tx_count
    FROM contacts WHERE id = p_vendor_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = v_vendor_debit + p_expenses,
      balance = (v_vendor_debit + p_expenses) - v_vendor_credit,
      total_transactions = v_vendor_tx_count + 1
    WHERE id = p_vendor_id;
  END IF;

  RETURN v_project_id;
END;
$function$;

-- تحديث دالة التعديل بنفس المنطق
CREATE OR REPLACE FUNCTION public.update_project_with_accounting(p_project_id uuid, p_name text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_vendor_id uuid DEFAULT NULL::uuid, p_contract_value numeric DEFAULT NULL::numeric, p_expenses numeric DEFAULT NULL::numeric, p_commission numeric DEFAULT NULL::numeric, p_currency_difference numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_received_amount numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_new_contract_value NUMERIC;
  v_new_expenses NUMERIC;
  v_new_commission NUMERIC;
  v_new_currency_difference NUMERIC;
  v_new_profit NUMERIC;
  v_client_debit NUMERIC;
  v_client_credit NUMERIC;
  v_client_tx INTEGER;
  v_vendor_debit NUMERIC;
  v_vendor_credit NUMERIC;
  v_vendor_tx INTEGER;
BEGIN
  SELECT * INTO v_old FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;

  v_new_contract_value := COALESCE(p_contract_value, v_old.contract_value);
  v_new_expenses := COALESCE(p_expenses, v_old.expenses);
  v_new_commission := COALESCE(p_commission, v_old.commission);
  v_new_currency_difference := COALESCE(p_currency_difference, v_old.currency_difference);
  v_new_profit := v_new_contract_value - v_new_expenses + v_new_commission + v_new_currency_difference;

  -- === عكس القيود القديمة ===

  -- عكس قيد العميل القديم (كان credit)
  IF v_old.client_id IS NOT NULL AND v_old.contract_value > 0 THEN
    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx
    FROM contacts WHERE id = v_old.client_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = GREATEST(0, v_client_credit - v_old.contract_value),
      balance = v_client_debit - GREATEST(0, v_client_credit - v_old.contract_value),
      total_transactions = GREATEST(0, v_client_tx - 1)
    WHERE id = v_old.client_id;

    DELETE FROM transactions
    WHERE project_id = p_project_id AND contact_id = v_old.client_id AND category = 'client_collection';
  END IF;

  -- عكس قيد المورد القديم (كان debit)
  IF v_old.vendor_id IS NOT NULL AND v_old.expenses > 0 THEN
    SELECT total_debit, total_credit, total_transactions INTO v_vendor_debit, v_vendor_credit, v_vendor_tx
    FROM contacts WHERE id = v_old.vendor_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = GREATEST(0, v_vendor_debit - v_old.expenses),
      balance = GREATEST(0, v_vendor_debit - v_old.expenses) - v_vendor_credit,
      total_transactions = GREATEST(0, v_vendor_tx - 1)
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

  -- العميل: credit (سالب/أحمر = عليه لنا)
  IF p_client_id IS NOT NULL AND v_new_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_value,
            'ترحيل تلقائي - قيمة عقد مشروع: ' || COALESCE(p_name, v_old.name),
            CURRENT_DATE, p_client_id, p_project_id, 'قيد تلقائي من تعديل المشروع');

    SELECT total_debit, total_credit, total_transactions INTO v_client_debit, v_client_credit, v_client_tx
    FROM contacts WHERE id = p_client_id FOR UPDATE;

    UPDATE contacts SET
      total_credit = v_client_credit + v_new_contract_value,
      balance = v_client_debit - (v_client_credit + v_new_contract_value),
      total_transactions = v_client_tx + 1
    WHERE id = p_client_id;
  END IF;

  -- المورد: debit (موجب/أخضر = له عندنا)
  IF p_vendor_id IS NOT NULL AND v_new_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, notes)
    VALUES (v_old.user_id, 'in', 'vendor_payment', v_new_expenses,
            'ترحيل تلقائي - تكلفة مشروع: ' || COALESCE(p_name, v_old.name),
            CURRENT_DATE, p_vendor_id, p_project_id, 'قيد تلقائي من تعديل المشروع');

    SELECT total_debit, total_credit, total_transactions INTO v_vendor_debit, v_vendor_credit, v_vendor_tx
    FROM contacts WHERE id = p_vendor_id FOR UPDATE;

    UPDATE contacts SET
      total_debit = v_vendor_debit + v_new_expenses,
      balance = (v_vendor_debit + v_new_expenses) - v_vendor_credit,
      total_transactions = v_vendor_tx + 1
    WHERE id = p_vendor_id;
  END IF;
END;
$function$;
