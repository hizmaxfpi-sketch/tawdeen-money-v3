
-- 1. Add beneficiary and fund columns to container_expenses
ALTER TABLE public.container_expenses
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- 2. Backfill existing expenses with the container's shipping agent (best-effort)
UPDATE public.container_expenses ce
SET contact_id = c.shipping_agent_id
FROM public.containers c
WHERE ce.container_id = c.id
  AND ce.contact_id IS NULL
  AND c.shipping_agent_id IS NOT NULL;

-- 3. RPC: add container expense with accounting entry
CREATE OR REPLACE FUNCTION public.add_container_expense(
  p_container_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_contact_id UUID,
  p_fund_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_expense_id UUID;
  v_container_owner UUID;
  v_container_number TEXT;
  v_tx_id UUID;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_contact_id IS NULL THEN RAISE EXCEPTION 'Beneficiary contact is required'; END IF;
  IF LENGTH(TRIM(COALESCE(p_description, ''))) = 0 THEN RAISE EXCEPTION 'Description required'; END IF;

  -- Verify container access
  SELECT user_id, container_number INTO v_container_owner, v_container_number
  FROM containers WHERE id = p_container_id;
  IF v_container_owner IS NULL THEN RAISE EXCEPTION 'Container not found'; END IF;
  IF NOT verify_company_access(v_container_owner) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Verify contact access
  IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_contact_id AND user_id IN (SELECT company_user_ids())) THEN
    RAISE EXCEPTION 'Access denied: beneficiary not owned';
  END IF;

  -- Verify fund access
  IF p_fund_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM funds WHERE id = p_fund_id AND user_id IN (SELECT company_user_ids())) THEN
      RAISE EXCEPTION 'Access denied: fund not owned';
    END IF;
  END IF;

  -- Insert expense
  INSERT INTO container_expenses (container_id, user_id, amount, description, contact_id, fund_id, notes)
  VALUES (p_container_id, v_user_id, p_amount, p_description, p_contact_id, p_fund_id, p_notes)
  RETURNING id INTO v_expense_id;

  -- Post accounting transaction (debit beneficiary, optionally deduct fund)
  -- 'in' for ledger contact = increase what we owe them (credit increases for vendor)
  INSERT INTO transactions (
    user_id, type, category, amount, description, date,
    contact_id, fund_id, source_type, posting_batch_id,
    idempotency_key, notes, currency_code, exchange_rate
  ) VALUES (
    v_user_id, 'in', 'vendor_payment', p_amount,
    'مصروف حاوية [' || v_container_number || '] - ' || p_description,
    CURRENT_DATE, p_contact_id, p_fund_id, 'shipment_invoice', v_batch_id,
    'cex_' || v_expense_id::text, COALESCE(p_notes, 'مصروف إضافي على الحاوية'),
    'USD', 1
  ) RETURNING id INTO v_tx_id;

  -- Link transaction to expense
  UPDATE container_expenses SET transaction_id = v_tx_id WHERE id = v_expense_id;

  -- If paid from fund, deduct it
  IF p_fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - p_amount WHERE id = p_fund_id;
  END IF;

  -- Recalculate container total (handled by existing trigger)
  PERFORM sync_contact_balances();
  RETURN v_expense_id;
END;
$$;

-- 4. RPC: delete container expense and reverse accounting
CREATE OR REPLACE FUNCTION public.delete_container_expense(p_expense_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_expense RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_expense FROM container_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT verify_company_access(v_expense.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Reverse fund deduction
  IF v_expense.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + v_expense.amount WHERE id = v_expense.fund_id;
  END IF;

  -- Delete linked transaction (also any stragglers by idempotency_key)
  DELETE FROM transactions WHERE id = v_expense.transaction_id OR idempotency_key = ('cex_' || p_expense_id::text);

  -- Delete expense (trigger will recalc container total)
  DELETE FROM container_expenses WHERE id = p_expense_id;

  PERFORM sync_contact_balances();
END;
$$;

-- 5. Enhanced delete_container_with_shipments: also clean container_expenses transactions
CREATE OR REPLACE FUNCTION public.delete_container_with_shipments(p_container_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_shipment RECORD;
  v_expense RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT user_id INTO v_owner_id FROM containers WHERE id = p_container_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Container not found'; END IF;
  IF NOT verify_company_access(v_owner_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Delete all shipments (which cascades their accounting)
  FOR v_shipment IN SELECT id FROM shipments WHERE container_id = p_container_id LOOP
    PERFORM delete_shipment_with_accounting(v_shipment.id);
  END LOOP;

  -- Reverse all container expenses (refund funds, delete transactions)
  FOR v_expense IN SELECT * FROM container_expenses WHERE container_id = p_container_id LOOP
    IF v_expense.fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance + v_expense.amount WHERE id = v_expense.fund_id;
    END IF;
    DELETE FROM transactions WHERE id = v_expense.transaction_id OR idempotency_key = ('cex_' || v_expense.id::text);
  END LOOP;
  DELETE FROM container_expenses WHERE container_id = p_container_id;

  -- Delete container's own cost transaction (to shipping agent)
  DELETE FROM transactions WHERE idempotency_key = ('ci_' || p_container_id::text);

  -- Finally delete the container
  DELETE FROM containers WHERE id = p_container_id;
  PERFORM sync_contact_balances();
END;
$$;

-- 6. RPC: update container with accounting (for cost changes)
CREATE OR REPLACE FUNCTION public.update_container_with_accounting(
  p_container_id UUID,
  p_container_number TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_capacity NUMERIC DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_origin_country TEXT DEFAULT NULL,
  p_destination_country TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_shipping_agent_id UUID DEFAULT NULL,
  p_shipping_cost NUMERIC DEFAULT NULL,
  p_customs_cost NUMERIC DEFAULT NULL,
  p_port_cost NUMERIC DEFAULT NULL,
  p_other_costs NUMERIC DEFAULT NULL,
  p_container_price NUMERIC DEFAULT NULL,
  p_glass_fees NUMERIC DEFAULT NULL,
  p_departure_date DATE DEFAULT NULL,
  p_arrival_date DATE DEFAULT NULL,
  p_clearance_date DATE DEFAULT NULL,
  p_rental_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old RECORD;
  v_new_container_price NUMERIC;
  v_new_shipping_cost NUMERIC;
  v_new_customs_cost NUMERIC;
  v_new_port_cost NUMERIC;
  v_new_glass_fees NUMERIC;
  v_new_other_costs NUMERIC;
  v_new_agent UUID;
  v_base_cost NUMERIC;
  v_extra_expenses NUMERIC;
  v_new_total NUMERIC;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_old FROM containers WHERE id = p_container_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Container not found'; END IF;
  IF NOT verify_company_access(v_old.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_new_container_price := COALESCE(p_container_price, v_old.container_price, 0);
  v_new_shipping_cost := COALESCE(p_shipping_cost, v_old.shipping_cost);
  v_new_customs_cost := COALESCE(p_customs_cost, v_old.customs_cost);
  v_new_port_cost := COALESCE(p_port_cost, v_old.port_cost);
  v_new_glass_fees := COALESCE(p_glass_fees, v_old.glass_fees, 0);
  v_new_other_costs := COALESCE(p_other_costs, v_old.other_costs);
  v_new_agent := COALESCE(p_shipping_agent_id, v_old.shipping_agent_id);

  v_base_cost := v_new_container_price + v_new_shipping_cost + v_new_customs_cost + v_new_port_cost + v_new_glass_fees + v_new_other_costs;
  SELECT COALESCE(SUM(amount), 0) INTO v_extra_expenses FROM container_expenses WHERE container_id = p_container_id;
  v_new_total := v_base_cost + v_extra_expenses;

  -- Update container
  UPDATE containers SET
    container_number = COALESCE(p_container_number, container_number),
    type = COALESCE(p_type, type),
    capacity = COALESCE(p_capacity, capacity),
    route = COALESCE(p_route, route),
    origin_country = COALESCE(p_origin_country, origin_country),
    destination_country = COALESCE(p_destination_country, destination_country),
    status = COALESCE(p_status::container_status, status),
    shipping_agent_id = v_new_agent,
    shipping_cost = v_new_shipping_cost,
    customs_cost = v_new_customs_cost,
    port_cost = v_new_port_cost,
    other_costs = v_new_other_costs,
    container_price = v_new_container_price,
    glass_fees = v_new_glass_fees,
    departure_date = COALESCE(p_departure_date, departure_date),
    arrival_date = COALESCE(p_arrival_date, arrival_date),
    clearance_date = COALESCE(p_clearance_date, clearance_date),
    rental_date = COALESCE(p_rental_date, rental_date),
    total_cost = v_new_total,
    profit = total_revenue - v_new_total,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_container_id;

  -- Reverse old shipping_agent transaction
  DELETE FROM transactions WHERE idempotency_key = ('ci_' || p_container_id::text);

  -- Re-post if agent + base cost
  IF v_new_agent IS NOT NULL AND v_base_cost > 0 THEN
    INSERT INTO transactions (
      user_id, type, category, amount, description, date,
      contact_id, source_type, posting_batch_id,
      idempotency_key, notes, currency_code, exchange_rate
    ) VALUES (
      v_user_id, 'in', 'vendor_payment', v_base_cost,
      'تكلفة حاوية - ' || COALESCE(p_container_number, v_old.container_number),
      CURRENT_DATE, v_new_agent, 'shipment_invoice', v_batch_id,
      'ci_' || p_container_id::text, 'قيد محدّث - تكلفة حاوية', 'USD', 1
    );
  END IF;

  PERFORM sync_contact_balances();
END;
$$;
