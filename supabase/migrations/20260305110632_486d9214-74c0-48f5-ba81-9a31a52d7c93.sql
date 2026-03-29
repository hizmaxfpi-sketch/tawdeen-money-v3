
CREATE OR REPLACE FUNCTION public.create_shipment_with_accounting(
  p_container_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_client_name text DEFAULT '',
  p_client_code text DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_goods_type text DEFAULT '',
  p_length numeric DEFAULT 0,
  p_width numeric DEFAULT 0,
  p_height numeric DEFAULT 0,
  p_quantity integer DEFAULT 1,
  p_weight numeric DEFAULT 0,
  p_cbm numeric DEFAULT NULL,
  p_price_per_meter numeric DEFAULT 0,
  p_amount_paid numeric DEFAULT 0,
  p_tracking_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_china_expenses numeric DEFAULT 0,
  p_sea_freight numeric DEFAULT 0,
  p_port_delivery_fees numeric DEFAULT 0,
  p_customs_fees numeric DEFAULT 0,
  p_internal_transport_fees numeric DEFAULT 0,
  p_fund_id uuid DEFAULT NULL,
  p_manual_cargo_code text DEFAULT NULL,
  p_domestic_shipping_cost numeric DEFAULT 0,
  p_transit_cost numeric DEFAULT 0,
  p_package_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_shipment_id UUID; v_cbm NUMERIC; v_contract_price NUMERIC;
  v_remaining NUMERIC; v_payment_status TEXT;
  v_batch_id UUID := gen_random_uuid();
  v_is_closed BOOLEAN; v_payment_id UUID;
  v_pass_through NUMERIC;
  v_cargo_code TEXT;
  v_container_owner UUID;
  v_pkg_num TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Input validation
  IF p_length < 0 OR p_width < 0 OR p_height < 0 THEN RAISE EXCEPTION 'Dimensions cannot be negative'; END IF;
  IF p_length > 99999 OR p_width > 99999 OR p_height > 99999 THEN RAISE EXCEPTION 'Dimension exceeds maximum'; END IF;
  IF p_quantity IS NOT NULL AND (p_quantity < 0 OR p_quantity > 99999) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF p_price_per_meter < 0 OR p_price_per_meter > 999999 THEN RAISE EXCEPTION 'Invalid price per meter'; END IF;
  IF p_amount_paid < 0 OR p_amount_paid > 999999999 THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
  IF p_china_expenses < 0 OR p_sea_freight < 0 OR p_port_delivery_fees < 0
     OR p_customs_fees < 0 OR p_internal_transport_fees < 0 THEN
    RAISE EXCEPTION 'Expense values cannot be negative';
  END IF;
  IF LENGTH(COALESCE(p_client_name, '')) > 200 THEN RAISE EXCEPTION 'Client name too long'; END IF;
  IF LENGTH(COALESCE(p_goods_type, '')) > 200 THEN RAISE EXCEPTION 'Goods type too long'; END IF;
  IF LENGTH(COALESCE(p_notes, '')) > 1000 THEN RAISE EXCEPTION 'Notes too long'; END IF;
  IF LENGTH(COALESCE(p_tracking_number, '')) > 100 THEN RAISE EXCEPTION 'Tracking number too long'; END IF;

  -- OWNERSHIP VALIDATION: container
  SELECT user_id, is_manually_closed INTO v_container_owner, v_is_closed FROM containers WHERE id = p_container_id;
  IF v_container_owner IS NULL THEN RAISE EXCEPTION 'Container not found'; END IF;
  IF v_container_owner != v_user_id THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_is_closed THEN RAISE EXCEPTION 'Container is manually closed'; END IF;

  -- OWNERSHIP VALIDATION: fund
  IF p_fund_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM funds WHERE id = p_fund_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Access denied: fund not owned by user';
    END IF;
  END IF;

  -- OWNERSHIP VALIDATION: client contact
  IF p_client_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_client_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Access denied: client not owned by user';
    END IF;
  END IF;

  v_cbm := COALESCE(NULLIF(p_cbm, 0), p_length * p_width * p_height * p_quantity);
  v_contract_price := v_cbm * p_price_per_meter;
  v_remaining := GREATEST(0, v_contract_price - p_amount_paid);
  v_payment_status := CASE WHEN v_remaining <= 0 THEN 'paid' WHEN p_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;
  v_pass_through := p_china_expenses + p_sea_freight + p_port_delivery_fees + p_customs_fees + p_internal_transport_fees;
  v_cargo_code := COALESCE(NULLIF(TRIM(p_manual_cargo_code), ''), 'CARGO-' || SUBSTRING(gen_random_uuid()::text, 1, 8));
  v_pkg_num := COALESCE(NULLIF(TRIM(p_package_number), ''), 'PKG-' || LPAD(EXTRACT(EPOCH FROM now())::bigint::text, 10, '0'));

  INSERT INTO shipments (user_id, container_id, client_id, client_name, client_code, recipient_name,
    goods_type, length, width, height, quantity, weight, cbm, price_per_meter,
    contract_price, amount_paid, remaining_amount, payment_status, tracking_number, notes,
    china_expenses, sea_freight, port_delivery_fees, customs_fees, internal_transport_fees,
    manual_cargo_code, domestic_shipping_cost, transit_cost, package_number)
  VALUES (v_user_id, p_container_id, p_client_id, p_client_name, p_client_code, p_recipient_name,
    p_goods_type, p_length, p_width, p_height, p_quantity, p_weight, v_cbm, p_price_per_meter,
    v_contract_price, p_amount_paid, v_remaining, v_payment_status::payment_status, p_tracking_number, p_notes,
    p_china_expenses, p_sea_freight, p_port_delivery_fees, p_customs_fees, p_internal_transport_fees,
    v_cargo_code, COALESCE(p_domestic_shipping_cost, 0), COALESCE(p_transit_cost, 0), v_pkg_num)
  RETURNING id INTO v_shipment_id;

  UPDATE containers SET
    used_capacity = used_capacity + v_cbm,
    total_revenue = total_revenue + v_contract_price,
    profit = (total_revenue + v_contract_price) - total_cost
  WHERE id = p_container_id;

  IF p_client_id IS NOT NULL AND v_contract_price > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, shipment_id, source_type, posting_batch_id,
      idempotency_key, notes, currency_code, exchange_rate)
    VALUES (v_user_id, 'out', 'client_collection', v_contract_price,
      'أجور شحن [' || v_cargo_code || '] - ' || p_goods_type || ' - ' || v_cbm || ' CBM',
      CURRENT_DATE, p_client_id, v_shipment_id, 'shipment_invoice', v_batch_id,
      'si_' || v_shipment_id::text, 'قيد إيرادات - كود: ' || v_cargo_code, 'USD', 1);
  END IF;

  IF p_client_id IS NOT NULL AND v_pass_through > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, shipment_id, source_type, posting_batch_id,
      idempotency_key, notes, currency_code, exchange_rate)
    VALUES (v_user_id, 'out', 'expense', v_pass_through,
      'مصاريف شحن [' || v_cargo_code || '] - ' || p_goods_type,
      CURRENT_DATE, p_client_id, v_shipment_id, 'shipment_invoice', v_batch_id,
      'spt_' || v_shipment_id::text, 'مصاريف إضافية - كود: ' || v_cargo_code, 'USD', 1);
  END IF;

  IF p_amount_paid > 0 THEN
    INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note)
    VALUES (v_user_id, v_shipment_id, p_amount_paid, p_fund_id, 'دفعة أولى - كود: ' || v_cargo_code)
    RETURNING id INTO v_payment_id;

    IF p_fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance + p_amount_paid WHERE id = p_fund_id;
    END IF;

    IF p_client_id IS NOT NULL THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date,
        fund_id, contact_id, shipment_id, source_type, reference_id, posting_batch_id,
        idempotency_key, notes, currency_code, exchange_rate)
      VALUES (v_user_id, 'in', 'client_collection', p_amount_paid,
        'دفعة أولى [' || v_cargo_code || '] - ' || p_goods_type,
        CURRENT_DATE, p_fund_id, p_client_id, v_shipment_id,
        'shipment_payment', v_payment_id, v_batch_id,
        'sp_' || v_payment_id::text, 'دفعة أولى - كود: ' || v_cargo_code, 'USD', 1);
    END IF;
  END IF;

  -- Sync contact balances
  PERFORM sync_contact_balances();

  RETURN v_shipment_id;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

-- Also fix sync_contact_balances to not require p_user_id parameter (use auth.uid() internally)
-- It's already correct per the existing definition, no change needed.
