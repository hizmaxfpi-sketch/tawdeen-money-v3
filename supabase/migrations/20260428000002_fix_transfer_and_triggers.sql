
-- Enhanced Trigger System for Automatic Balance Synchronization

-- 1. Function to recalculate a SINGLE contact's balance
CREATE OR REPLACE FUNCTION public.sync_single_contact_balance(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_contact_id IS NULL THEN RETURN; END IF;

  UPDATE contacts c
  SET
    total_debit = COALESCE(v.total_debit, 0),
    total_credit = COALESCE(v.total_credit, 0),
    balance = COALESCE(v.balance, 0),
    total_transactions = COALESCE(v.total_transactions, 0),
    updated_at = now()
  FROM (
    SELECT
      contact_id,
      COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS total_debit,
      COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS total_credit,
      COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE -amount END), 0) AS balance,
      COUNT(*)::bigint AS total_transactions
    FROM transactions
    WHERE contact_id = p_contact_id
    GROUP BY contact_id
  ) v
  WHERE c.id = v.contact_id;

  -- Handle case with no transactions left
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE contact_id = p_contact_id) THEN
    UPDATE contacts SET
      total_debit = 0, total_credit = 0, balance = 0, total_transactions = 0,
      updated_at = now()
    WHERE id = p_contact_id;
  END IF;
END;
$$;

-- 2. Unified Transaction Trigger to handle both Funds and Contacts
CREATE OR REPLACE FUNCTION public.trg_sync_balances_on_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Handle INSERT
  IF (TG_OP = 'INSERT') THEN
    IF NEW.fund_id IS NOT NULL THEN
      PERFORM public.recalculate_fund_balance(NEW.fund_id);
    END IF;
    IF NEW.contact_id IS NOT NULL THEN
      PERFORM public.sync_single_contact_balance(NEW.contact_id);
    END IF;
    RETURN NEW;

  -- Handle UPDATE
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Fund changes
    IF OLD.fund_id IS DISTINCT FROM NEW.fund_id THEN
      IF OLD.fund_id IS NOT NULL THEN PERFORM public.recalculate_fund_balance(OLD.fund_id); END IF;
      IF NEW.fund_id IS NOT NULL THEN PERFORM public.recalculate_fund_balance(NEW.fund_id); END IF;
    ELSIF NEW.fund_id IS NOT NULL THEN
      PERFORM public.recalculate_fund_balance(NEW.fund_id);
    END IF;

    -- Contact changes
    IF OLD.contact_id IS DISTINCT FROM NEW.contact_id THEN
      IF OLD.contact_id IS NOT NULL THEN PERFORM public.sync_single_contact_balance(OLD.contact_id); END IF;
      IF NEW.contact_id IS NOT NULL THEN PERFORM public.sync_single_contact_balance(NEW.contact_id); END IF;
    ELSIF NEW.contact_id IS NOT NULL THEN
      PERFORM public.sync_single_contact_balance(NEW.contact_id);
    END IF;
    RETURN NEW;

  -- Handle DELETE
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.fund_id IS NOT NULL THEN
      PERFORM public.recalculate_fund_balance(OLD.fund_id);
    END IF;
    IF OLD.contact_id IS NOT NULL THEN
      PERFORM public.sync_single_contact_balance(OLD.contact_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Re-attach trigger
DROP TRIGGER IF EXISTS trg_sync_fund_balances_from_transactions ON public.transactions;
DROP TRIGGER IF EXISTS trg_sync_balances_from_transactions ON public.transactions;

CREATE TRIGGER trg_sync_balances_from_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_balances_on_transaction();

-- 4. Correct the Fund Transfer logic in the RPC to avoid drift
CREATE OR REPLACE FUNCTION public.process_transaction(p_type text, p_category text, p_amount numeric, p_description text, p_date date, p_fund_id uuid DEFAULT NULL, p_contact_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL, p_notes text DEFAULT NULL, p_currency_code text DEFAULT 'USD', p_exchange_rate numeric DEFAULT 1, p_original_amount numeric DEFAULT NULL, p_to_fund_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_tx_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Validation logic remains same...
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Insert primary transaction
  INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, contact_id, project_id, notes, currency_code, exchange_rate, source_type)
  VALUES (v_user_id, p_type::transaction_type, p_category, p_amount, p_description, p_date, p_fund_id, p_contact_id, p_project_id, p_notes, p_currency_code, p_exchange_rate, 'manual')
  RETURNING id INTO v_tx_id;

  -- If it's a transfer, insert the SECOND leg (the 'in' transaction for the target fund)
  IF p_category = 'fund_transfer' AND p_to_fund_id IS NOT NULL THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, source_type, reference_id, currency_code, exchange_rate)
    VALUES (v_user_id, 'in', 'fund_transfer', p_amount, 'استلام تحويل: ' || p_description, p_date, p_to_fund_id, 'manual', v_tx_id, p_currency_code, p_exchange_rate);
  END IF;

  -- Trigger handles the balance updates on funds and contacts automatically now.
  -- We just need to handle the project updates if any.
  IF p_project_id IS NOT NULL THEN
    IF p_type = 'out' THEN
      UPDATE projects SET expenses = expenses + p_amount, profit = contract_value - (expenses + p_amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0) WHERE id = p_project_id;
    ELSE UPDATE projects SET received_amount = received_amount + p_amount WHERE id = p_project_id; END IF;
  END IF;

  RETURN v_tx_id;
END;
$function$;
