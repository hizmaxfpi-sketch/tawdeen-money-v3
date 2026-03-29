
-- Update process_transaction: ownership checks use company
CREATE OR REPLACE FUNCTION public.process_transaction(p_type text, p_category text, p_amount numeric, p_description text, p_date date, p_fund_id uuid DEFAULT NULL, p_contact_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL, p_notes text DEFAULT NULL, p_currency_code text DEFAULT 'USD', p_exchange_rate numeric DEFAULT 1, p_original_amount numeric DEFAULT NULL, p_to_fund_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_tx_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_amount > 999999999 THEN RAISE EXCEPTION 'Amount exceeds maximum allowed'; END IF;
  IF p_type NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Invalid transaction type'; END IF;
  IF LENGTH(COALESCE(p_category, '')) = 0 OR LENGTH(p_category) > 100 THEN RAISE EXCEPTION 'Invalid category'; END IF;
  IF LENGTH(COALESCE(p_description, '')) > 500 THEN RAISE EXCEPTION 'Description too long'; END IF;
  IF LENGTH(COALESCE(p_notes, '')) > 1000 THEN RAISE EXCEPTION 'Notes too long'; END IF;
  IF p_exchange_rate IS NOT NULL AND (p_exchange_rate <= 0 OR p_exchange_rate > 999999) THEN RAISE EXCEPTION 'Invalid exchange rate'; END IF;

  IF p_fund_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM funds WHERE id = p_fund_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: fund not owned'; END IF;
  END IF;
  IF p_to_fund_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM funds WHERE id = p_to_fund_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: target fund not owned'; END IF;
  END IF;
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: project not owned'; END IF;
  END IF;
  IF p_contact_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_contact_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: contact not owned'; END IF;
  END IF;

  INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, contact_id, project_id, notes, currency_code, exchange_rate, source_type)
  VALUES (v_user_id, p_type::transaction_type, p_category, p_amount, p_description, p_date, p_fund_id, p_contact_id, p_project_id, p_notes, p_currency_code, p_exchange_rate, 'manual')
  RETURNING id INTO v_tx_id;

  IF p_fund_id IS NOT NULL THEN
    IF p_type = 'in' THEN UPDATE funds SET balance = balance + p_amount WHERE id = p_fund_id;
    ELSE UPDATE funds SET balance = balance - p_amount WHERE id = p_fund_id; END IF;
  END IF;
  IF p_category = 'fund_transfer' AND p_to_fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_amount WHERE id = p_to_fund_id;
  END IF;
  IF p_project_id IS NOT NULL THEN
    IF p_type = 'out' THEN
      UPDATE projects SET expenses = expenses + p_amount, profit = contract_value - (expenses + p_amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0) WHERE id = p_project_id;
    ELSE UPDATE projects SET received_amount = received_amount + p_amount WHERE id = p_project_id; END IF;
  END IF;
  RETURN v_tx_id;
END;
$function$;

-- Update reverse_transaction
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_tx RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT verify_company_access(v_tx.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF v_tx.fund_id IS NOT NULL THEN
    IF v_tx.type = 'in' THEN UPDATE funds SET balance = balance - v_tx.amount WHERE id = v_tx.fund_id;
    ELSE UPDATE funds SET balance = balance + v_tx.amount WHERE id = v_tx.fund_id; END IF;
  END IF;
  IF v_tx.project_id IS NOT NULL THEN
    IF v_tx.type = 'out' THEN
      UPDATE projects SET expenses = GREATEST(0, expenses - v_tx.amount), profit = contract_value - GREATEST(0, expenses - v_tx.amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0) WHERE id = v_tx.project_id;
    ELSE UPDATE projects SET received_amount = GREATEST(0, received_amount - v_tx.amount) WHERE id = v_tx.project_id; END IF;
  END IF;
  DELETE FROM transactions WHERE id = p_transaction_id;
END;
$function$;

-- Update update_transaction
CREATE OR REPLACE FUNCTION public.update_transaction(p_transaction_id uuid, p_type text DEFAULT NULL, p_category text DEFAULT NULL, p_amount numeric DEFAULT NULL, p_description text DEFAULT NULL, p_date date DEFAULT NULL, p_fund_id uuid DEFAULT NULL, p_contact_id uuid DEFAULT NULL, p_notes text DEFAULT NULL, p_currency_code text DEFAULT NULL, p_exchange_rate numeric DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_old RECORD; v_new_type TEXT; v_new_amount NUMERIC; v_new_fund_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_old FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT verify_company_access(v_old.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_old.source_type IS NOT NULL AND v_old.source_type != 'manual' THEN RAISE EXCEPTION 'Cannot edit auto-generated transactions'; END IF;

  v_new_type := COALESCE(p_type, v_old.type::text);
  v_new_amount := COALESCE(p_amount, v_old.amount);
  v_new_fund_id := COALESCE(p_fund_id, v_old.fund_id);

  IF v_old.fund_id IS NOT NULL THEN
    IF v_old.type = 'in' THEN UPDATE funds SET balance = balance - v_old.amount WHERE id = v_old.fund_id;
    ELSE UPDATE funds SET balance = balance + v_old.amount WHERE id = v_old.fund_id; END IF;
  END IF;
  IF v_new_fund_id IS NOT NULL THEN
    IF v_new_type = 'in' THEN UPDATE funds SET balance = balance + v_new_amount WHERE id = v_new_fund_id;
    ELSE UPDATE funds SET balance = balance - v_new_amount WHERE id = v_new_fund_id; END IF;
  END IF;

  UPDATE transactions SET type = v_new_type::transaction_type, category = COALESCE(p_category, category), amount = v_new_amount, description = COALESCE(p_description, description), date = COALESCE(p_date, date), fund_id = v_new_fund_id, contact_id = p_contact_id, notes = COALESCE(p_notes, notes), currency_code = COALESCE(p_currency_code, currency_code), exchange_rate = COALESCE(p_exchange_rate, exchange_rate), updated_at = now() WHERE id = p_transaction_id;
  PERFORM sync_contact_balances();
END;
$function$;
