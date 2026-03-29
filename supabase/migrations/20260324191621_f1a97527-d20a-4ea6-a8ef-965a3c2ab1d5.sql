
-- Update create_container_with_accounting
CREATE OR REPLACE FUNCTION public.create_container_with_accounting(p_container_number text, p_type text DEFAULT '40ft', p_capacity numeric DEFAULT 67, p_route text DEFAULT '', p_origin_country text DEFAULT 'الصين', p_destination_country text DEFAULT 'السعودية', p_status text DEFAULT 'loading', p_shipping_agent_id uuid DEFAULT NULL, p_shipping_cost numeric DEFAULT 0, p_customs_cost numeric DEFAULT 0, p_port_cost numeric DEFAULT 0, p_other_costs numeric DEFAULT 0, p_container_price numeric DEFAULT 0, p_glass_fees numeric DEFAULT 0, p_rental_days integer DEFAULT 0, p_loading_days integer DEFAULT 0, p_cost_per_meter numeric DEFAULT 0, p_departure_date date DEFAULT NULL, p_rental_date date DEFAULT NULL, p_arrival_date date DEFAULT NULL, p_notes text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_container_id UUID; v_total_cost NUMERIC; v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF LENGTH(TRIM(COALESCE(p_container_number, ''))) = 0 THEN RAISE EXCEPTION 'Container number is required'; END IF;
  IF p_shipping_cost < 0 OR p_customs_cost < 0 OR p_port_cost < 0 OR p_other_costs < 0 OR p_container_price < 0 OR p_glass_fees < 0 THEN RAISE EXCEPTION 'Cost values cannot be negative'; END IF;

  IF p_shipping_agent_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_shipping_agent_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: shipping agent not owned'; END IF;
  END IF;

  v_total_cost := p_container_price + p_shipping_cost + p_customs_cost + p_port_cost + p_glass_fees + p_other_costs;

  INSERT INTO containers (user_id, container_number, type, capacity, used_capacity, route, origin_country, destination_country, status, shipping_agent_id, shipping_cost, customs_cost, port_cost, other_costs, container_price, glass_fees, rental_days, loading_days, cost_per_meter, total_cost, total_revenue, profit, departure_date, rental_date, arrival_date, notes)
  VALUES (v_user_id, p_container_number, p_type, p_capacity, 0, p_route, p_origin_country, p_destination_country, p_status::container_status, p_shipping_agent_id, p_shipping_cost, p_customs_cost, p_port_cost, p_other_costs, p_container_price, p_glass_fees, p_rental_days, p_loading_days, p_cost_per_meter, v_total_cost, 0, -v_total_cost, p_departure_date, p_rental_date, p_arrival_date, p_notes)
  RETURNING id INTO v_container_id;

  IF p_shipping_agent_id IS NOT NULL AND v_total_cost > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes, currency_code, exchange_rate)
    VALUES (v_user_id, 'in', 'vendor_payment', v_total_cost, 'تكلفة حاوية - ' || p_container_number, CURRENT_DATE, p_shipping_agent_id, 'shipment_invoice', v_batch_id, 'ci_' || v_container_id::text, 'قيد تلقائي - تكلفة حاوية', 'USD', 1);
  END IF;
  RETURN v_container_id;
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$function$;

-- Update create_project_with_accounting
CREATE OR REPLACE FUNCTION public.create_project_with_accounting(p_name text, p_client_id uuid DEFAULT NULL, p_vendor_id uuid DEFAULT NULL, p_contract_value numeric DEFAULT 0, p_expenses numeric DEFAULT 0, p_commission numeric DEFAULT 0, p_currency_difference numeric DEFAULT 0, p_status text DEFAULT 'active', p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL, p_notes text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_project_id UUID; v_profit NUMERIC; v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_client_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_client_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: client not owned'; END IF;
  END IF;
  IF p_vendor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_vendor_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: vendor not owned'; END IF;
  END IF;

  v_profit := p_contract_value - p_expenses + p_commission + p_currency_difference;
  INSERT INTO projects (user_id, name, client_id, vendor_id, contract_value, expenses, received_amount, commission, currency_difference, profit, status, start_date, end_date, notes)
  VALUES (v_user_id, p_name, p_client_id, p_vendor_id, p_contract_value, p_expenses, 0, p_commission, p_currency_difference, v_profit, p_status, p_start_date, p_end_date, p_notes)
  RETURNING id INTO v_project_id;

  IF p_client_id IS NOT NULL AND p_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'client_collection', p_contract_value, 'قيمة عقد مشروع: ' || p_name, CURRENT_DATE, p_client_id, v_project_id, 'project_client', v_batch_id, 'pc_' || v_project_id::text, 'قيد تلقائي');
  END IF;
  IF p_vendor_id IS NOT NULL AND p_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'vendor_payment', p_expenses, 'تكلفة مشروع: ' || p_name, CURRENT_DATE, p_vendor_id, v_project_id, 'project_vendor', v_batch_id, 'pv_' || v_project_id::text, 'قيد تلقائي');
  END IF;
  RETURN v_project_id;
END;
$function$;

-- Update update_project_with_accounting
CREATE OR REPLACE FUNCTION public.update_project_with_accounting(p_project_id uuid, p_name text DEFAULT NULL, p_client_id uuid DEFAULT NULL, p_vendor_id uuid DEFAULT NULL, p_contract_value numeric DEFAULT NULL, p_expenses numeric DEFAULT NULL, p_commission numeric DEFAULT NULL, p_currency_difference numeric DEFAULT NULL, p_status text DEFAULT NULL, p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL, p_notes text DEFAULT NULL, p_received_amount numeric DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_old RECORD; v_new_contract_value NUMERIC; v_new_expenses NUMERIC; v_new_commission NUMERIC; v_new_currency_difference NUMERIC; v_new_profit NUMERIC; v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_old FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT verify_company_access(v_old.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF p_client_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_client_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: client not owned'; END IF;
  END IF;
  IF p_vendor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_vendor_id AND user_id IN (SELECT company_user_ids())) THEN RAISE EXCEPTION 'Access denied: vendor not owned'; END IF;
  END IF;

  v_new_contract_value := COALESCE(p_contract_value, v_old.contract_value);
  v_new_expenses := COALESCE(p_expenses, v_old.expenses);
  v_new_commission := COALESCE(p_commission, v_old.commission);
  v_new_currency_difference := COALESCE(p_currency_difference, v_old.currency_difference);
  v_new_profit := v_new_contract_value - v_new_expenses + v_new_commission + v_new_currency_difference;

  DELETE FROM transactions WHERE project_id = p_project_id AND source_type IN ('project_client', 'project_vendor');

  UPDATE projects SET name = COALESCE(p_name, v_old.name), client_id = p_client_id, vendor_id = p_vendor_id, contract_value = v_new_contract_value, expenses = v_new_expenses, received_amount = COALESCE(p_received_amount, v_old.received_amount), commission = v_new_commission, currency_difference = v_new_currency_difference, profit = v_new_profit, status = COALESCE(p_status, v_old.status), start_date = COALESCE(p_start_date, v_old.start_date), end_date = COALESCE(p_end_date, v_old.end_date), notes = COALESCE(p_notes, v_old.notes) WHERE id = p_project_id;

  IF p_client_id IS NOT NULL AND v_new_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'client_collection', v_new_contract_value, 'قيمة عقد مشروع: ' || COALESCE(p_name, v_old.name), CURRENT_DATE, p_client_id, p_project_id, 'project_client', v_batch_id, 'pc_' || p_project_id::text, 'قيد تلقائي من تعديل المشروع');
  END IF;
  IF p_vendor_id IS NOT NULL AND v_new_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, project_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'vendor_payment', v_new_expenses, 'تكلفة مشروع: ' || COALESCE(p_name, v_old.name), CURRENT_DATE, p_vendor_id, p_project_id, 'project_vendor', v_batch_id, 'pv_' || p_project_id::text, 'قيد تلقائي من تعديل المشروع');
  END IF;
END;
$function$;
