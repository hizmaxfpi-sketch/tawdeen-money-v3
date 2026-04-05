
-- 1. Add 'general_ledger' to posting_source enum
ALTER TYPE public.posting_source ADD VALUE IF NOT EXISTS 'general_ledger';

-- 2. Create transaction_categories table
CREATE TABLE IF NOT EXISTS public.transaction_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type public.transaction_type NOT NULL, -- 'in' for income, 'out' for expense
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, name, type)
);

-- Enable RLS
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own categories"
    ON public.transaction_categories
    FOR ALL
    USING (user_id = auth.uid());

-- 3. Update process_transaction to support p_source_type
CREATE OR REPLACE FUNCTION public.process_transaction(
    p_type text,
    p_category text,
    p_amount numeric,
    p_description text,
    p_date date,
    p_fund_id uuid DEFAULT NULL,
    p_contact_id uuid DEFAULT NULL,
    p_project_id uuid DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_currency_code text DEFAULT 'USD',
    p_exchange_rate numeric DEFAULT 1,
    p_original_amount numeric DEFAULT NULL,
    p_to_fund_id uuid DEFAULT NULL,
    p_source_type text DEFAULT 'manual'
)
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

  INSERT INTO transactions (user_id, type, category, amount, description, date, fund_id, contact_id, project_id, notes, currency_code, exchange_rate, source_type, original_amount)
  VALUES (v_user_id, p_type::transaction_type, p_category, p_amount, p_description, p_date, p_fund_id, p_contact_id, p_project_id, p_notes, p_currency_code, p_exchange_rate, p_source_type, p_original_amount)
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
