-- Fix #1: Vendor purchase entry direction
-- Previously the entry was inserted as type='in' which made the vendor appear
-- as a debtor (لنا) instead of a creditor (علينا). A purchase on credit means
-- we owe the vendor, so the entry must be 'out'.
CREATE OR REPLACE FUNCTION public.purchase_material(
  p_material_id uuid, p_quantity numeric, p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL::uuid, p_fund_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0, p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase_id UUID;
  v_total NUMERIC;
  v_material RECORD;
  v_new_qty NUMERIC;
  v_new_avg NUMERIC;
  v_tx_id UUID;
  v_batch UUID := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF p_unit_price < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF NOT verify_company_access(v_material.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_total := p_quantity * p_unit_price;
  v_new_qty := v_material.quantity + p_quantity;
  IF v_new_qty > 0 THEN
    v_new_avg := ((v_material.quantity * v_material.avg_cost) + (p_quantity * p_unit_price)) / v_new_qty;
  ELSE
    v_new_avg := p_unit_price;
  END IF;

  UPDATE production_materials
  SET quantity = v_new_qty, avg_cost = v_new_avg
  WHERE id = p_material_id;

  INSERT INTO material_purchases (user_id, material_id, contact_id, fund_id, quantity, unit_price, total_amount, paid_amount, date, notes)
  VALUES (v_user_id, p_material_id, p_contact_id, p_fund_id, p_quantity, p_unit_price, v_total, p_paid_amount, p_date, p_notes)
  RETURNING id INTO v_purchase_id;

  -- Vendor purchase on credit → we owe the vendor (credit balance) → type='out'
  IF p_contact_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'out', 'vendor_payment', v_total,
      'شراء مواد خام: ' || v_material.name || ' (' || p_quantity || ' ' || v_material.unit || ')',
      p_date, p_contact_id, 'production_purchase', v_batch,
      'pmp_' || v_purchase_id::text, 'قيد تلقائي - شراء مواد خام (التزام للمورد)')
    RETURNING id INTO v_tx_id;

    UPDATE material_purchases SET transaction_id = v_tx_id WHERE id = v_purchase_id;
  END IF;

  -- Immediate cash payment to vendor → settles part of the credit → type='in' for contact
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (user_id, type, category, amount, description, date, contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes)
    VALUES (v_user_id, 'in', 'vendor_payment', p_paid_amount,
      'سداد شراء مواد - ' || v_material.name,
      p_date, p_contact_id, p_fund_id, 'production_purchase_payment', v_batch,
      'pmpp_' || v_purchase_id::text, 'دفعة عند الشراء (تخفيض الالتزام)');
  END IF;

  PERFORM sync_contact_balances();
  RETURN v_purchase_id;
END;
$function$;