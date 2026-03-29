
CREATE OR REPLACE FUNCTION public.update_transaction(
  p_transaction_id uuid,
  p_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_date date DEFAULT NULL,
  p_fund_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency_code text DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_old RECORD;
  v_new_type TEXT;
  v_new_amount NUMERIC;
  v_new_fund_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_old FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_old.user_id != v_user_id THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Only allow editing manual transactions
  IF v_old.source_type IS NOT NULL AND v_old.source_type != 'manual' THEN
    RAISE EXCEPTION 'Cannot edit auto-generated transactions';
  END IF;

  v_new_type := COALESCE(p_type, v_old.type::text);
  v_new_amount := COALESCE(p_amount, v_old.amount);
  v_new_fund_id := COALESCE(p_fund_id, v_old.fund_id);

  -- Reverse old fund effect
  IF v_old.fund_id IS NOT NULL THEN
    IF v_old.type = 'in' THEN
      UPDATE funds SET balance = balance - v_old.amount WHERE id = v_old.fund_id AND user_id = v_user_id;
    ELSE
      UPDATE funds SET balance = balance + v_old.amount WHERE id = v_old.fund_id AND user_id = v_user_id;
    END IF;
  END IF;

  -- Apply new fund effect
  IF v_new_fund_id IS NOT NULL THEN
    IF v_new_type = 'in' THEN
      UPDATE funds SET balance = balance + v_new_amount WHERE id = v_new_fund_id AND user_id = v_user_id;
    ELSE
      UPDATE funds SET balance = balance - v_new_amount WHERE id = v_new_fund_id AND user_id = v_user_id;
    END IF;
  END IF;

  -- Update the transaction row
  UPDATE transactions SET
    type = v_new_type::transaction_type,
    category = COALESCE(p_category, category),
    amount = v_new_amount,
    description = COALESCE(p_description, description),
    date = COALESCE(p_date, date),
    fund_id = v_new_fund_id,
    contact_id = p_contact_id,
    notes = COALESCE(p_notes, notes),
    currency_code = COALESCE(p_currency_code, currency_code),
    exchange_rate = COALESCE(p_exchange_rate, exchange_rate),
    updated_at = now()
  WHERE id = p_transaction_id;

  -- Sync contact balances
  PERFORM sync_contact_balances();
END;
$$;
