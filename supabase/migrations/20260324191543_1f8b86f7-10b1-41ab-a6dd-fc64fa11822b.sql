
-- Update delete_shipment_with_accounting
CREATE OR REPLACE FUNCTION public.delete_shipment_with_accounting(p_shipment_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_shipment RECORD; v_payment RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF NOT verify_company_access(v_shipment.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE containers SET used_capacity = GREATEST(0, used_capacity - v_shipment.cbm), total_revenue = GREATEST(0, total_revenue - v_shipment.contract_price), profit = GREATEST(0, total_revenue - v_shipment.contract_price) - total_cost WHERE id = v_shipment.container_id;

  FOR v_payment IN SELECT * FROM shipment_payments WHERE shipment_id = p_shipment_id LOOP
    IF v_payment.fund_id IS NOT NULL THEN UPDATE funds SET balance = balance - v_payment.amount WHERE id = v_payment.fund_id; END IF;
  END LOOP;

  DELETE FROM transactions WHERE shipment_id = p_shipment_id;
  DELETE FROM shipment_payments WHERE shipment_id = p_shipment_id;
  DELETE FROM shipments WHERE id = p_shipment_id;
  PERFORM sync_contact_balances();
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$function$;

-- Update delete_container_with_shipments
CREATE OR REPLACE FUNCTION public.delete_container_with_shipments(p_container_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_owner_id UUID; v_shipment RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT user_id INTO v_owner_id FROM containers WHERE id = p_container_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Container not found'; END IF;
  IF NOT verify_company_access(v_owner_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  FOR v_shipment IN SELECT id FROM shipments WHERE container_id = p_container_id LOOP
    PERFORM delete_shipment_with_accounting(v_shipment.id);
  END LOOP;

  DELETE FROM transactions WHERE idempotency_key = ('ci_' || p_container_id::text);
  DELETE FROM containers WHERE id = p_container_id;
  PERFORM sync_contact_balances();
END;
$function$;

-- Update delete_project_with_accounting
CREATE OR REPLACE FUNCTION public.delete_project_with_accounting(p_project_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_owner_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT user_id INTO v_owner_id FROM projects WHERE id = p_project_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT verify_company_access(v_owner_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE project_id = p_project_id);
  DELETE FROM debts WHERE project_id = p_project_id;
  DELETE FROM transactions WHERE project_id = p_project_id;
  DELETE FROM projects WHERE id = p_project_id;
  PERFORM sync_contact_balances();
END;
$function$;

-- Update process_shipment_payment
CREATE OR REPLACE FUNCTION public.process_shipment_payment(p_shipment_id uuid, p_amount numeric, p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_shipment RECORD; v_new_paid NUMERIC; v_new_remaining NUMERIC; v_new_status TEXT; v_payment_id UUID; v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_amount > 999999999 THEN RAISE EXCEPTION 'Amount exceeds maximum allowed'; END IF;

  IF p_fund_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM funds WHERE id = p_fund_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: fund not owned'; END IF;
  END IF;

  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF NOT verify_company_access(v_shipment.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note) VALUES (v_user_id, p_shipment_id, p_amount, p_fund_id, p_note) RETURNING id INTO v_payment_id;

  v_new_paid := v_shipment.amount_paid + p_amount;
  v_new_remaining := GREATEST(0, v_shipment.contract_price - v_new_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE shipments SET amount_paid = v_new_paid, remaining_amount = v_new_remaining, payment_status = v_new_status::payment_status WHERE id = p_shipment_id;

  IF p_fund_id IS NOT NULL THEN UPDATE funds SET balance = balance + p_amount WHERE id = p_fund_id; END IF;

  INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, contact_id, shipment_id, source_type, reference_id, posting_batch_id, idempotency_key, notes, currency_code, exchange_rate)
  VALUES (v_user_id, 'in', 'client_collection', p_amount, 'دفعة [' || v_shipment.manual_cargo_code || '] - ' || v_shipment.goods_type, CURRENT_DATE, p_fund_id, v_shipment.client_id, p_shipment_id, 'shipment_payment', v_payment_id, v_batch_id, 'sp_' || v_payment_id::text, COALESCE(p_note, 'دفعة شحن - كود: ' || v_shipment.manual_cargo_code), 'USD', 1);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$function$;

-- Update update_shipment_with_accounting
CREATE OR REPLACE FUNCTION public.update_shipment_with_accounting(p_shipment_id uuid, p_client_name text DEFAULT NULL, p_goods_type text DEFAULT NULL, p_length numeric DEFAULT NULL, p_width numeric DEFAULT NULL, p_height numeric DEFAULT NULL, p_quantity integer DEFAULT NULL, p_price_per_meter numeric DEFAULT NULL, p_amount_paid numeric DEFAULT NULL, p_tracking_number text DEFAULT NULL, p_notes text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_old RECORD; v_new_length NUMERIC; v_new_width NUMERIC; v_new_height NUMERIC; v_new_quantity INTEGER; v_new_price_per_meter NUMERIC; v_new_amount_paid NUMERIC; v_new_cbm NUMERIC; v_new_contract_price NUMERIC; v_new_remaining NUMERIC; v_new_status TEXT; v_price_changed BOOLEAN; v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_old FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF NOT verify_company_access(v_old.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_new_length := COALESCE(p_length, v_old.length); v_new_width := COALESCE(p_width, v_old.width); v_new_height := COALESCE(p_height, v_old.height);
  v_new_quantity := COALESCE(p_quantity, v_old.quantity); v_new_price_per_meter := COALESCE(p_price_per_meter, v_old.price_per_meter);
  v_new_amount_paid := COALESCE(p_amount_paid, v_old.amount_paid);
  v_new_cbm := v_new_length * v_new_width * v_new_height * v_new_quantity;
  v_new_contract_price := v_new_cbm * v_new_price_per_meter;
  v_new_remaining := GREATEST(0, v_new_contract_price - v_new_amount_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' WHEN v_new_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;
  v_price_changed := v_new_contract_price != v_old.contract_price;

  UPDATE shipments SET client_name = COALESCE(p_client_name, v_old.client_name), goods_type = COALESCE(p_goods_type, v_old.goods_type), length = v_new_length, width = v_new_width, height = v_new_height, quantity = v_new_quantity, cbm = v_new_cbm, price_per_meter = v_new_price_per_meter, contract_price = v_new_contract_price, amount_paid = v_new_amount_paid, remaining_amount = v_new_remaining, payment_status = v_new_status::payment_status, tracking_number = COALESCE(p_tracking_number, v_old.tracking_number), notes = COALESCE(p_notes, v_old.notes) WHERE id = p_shipment_id;

  UPDATE containers SET used_capacity = GREATEST(0, used_capacity - v_old.cbm + v_new_cbm), total_revenue = GREATEST(0, total_revenue - v_old.contract_price + v_new_contract_price), profit = GREATEST(0, total_revenue - v_old.contract_price + v_new_contract_price) - total_cost WHERE id = v_old.container_id;

  IF v_old.client_id IS NOT NULL AND v_price_changed THEN
    DELETE FROM transactions WHERE shipment_id = p_shipment_id AND source_type = 'shipment_invoice';
    IF v_new_contract_price > 0 THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, shipment_id, source_type, posting_batch_id, idempotency_key, notes, currency_code, exchange_rate)
      VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_price, 'أجور شحن - ' || COALESCE(p_goods_type, v_old.goods_type) || ' - ' || v_new_cbm || ' CBM', CURRENT_DATE, v_old.client_id, p_shipment_id, 'shipment_invoice', v_batch_id, 'si_' || p_shipment_id::text, 'قيد تلقائي من تعديل شحنة', 'USD', 1);
    END IF;
  END IF;
END;
$function$;
