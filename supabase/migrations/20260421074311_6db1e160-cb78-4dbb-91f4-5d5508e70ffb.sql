-- Update post_obligation_draft to forward account_id to the transaction
-- when the draft has exactly one item with a linked ledger account
-- (typical for rent/subscription/installment/other obligations that link to a vendor/landlord account).
-- For multi-item obligations (salaries), we keep the aggregate transaction without account_id
-- since each employee may map to a different account.

CREATE OR REPLACE FUNCTION public.post_obligation_draft(
  p_draft_id uuid, p_fund_id uuid, p_date date, p_user_id uuid, p_created_by_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_draft RECORD;
  v_obligation RECORD;
  v_tx_id UUID;
  v_description TEXT;
  v_account_id UUID;
  v_item_count INT;
BEGIN
  SELECT * INTO v_draft FROM public.obligation_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status = 'posted' THEN RAISE EXCEPTION 'Draft already posted'; END IF;

  SELECT * INTO v_obligation FROM public.recurring_obligations WHERE id = v_draft.obligation_id;

  v_description := v_obligation.name || ' - ' || v_draft.period_year || '/' || LPAD(v_draft.period_month::TEXT, 2, '0');

  -- Determine if this draft has a single linked account (typical for rent/installment/etc.)
  SELECT COUNT(*) INTO v_item_count FROM public.obligation_draft_items WHERE draft_id = p_draft_id;
  IF v_item_count = 1 THEN
    SELECT account_id INTO v_account_id FROM public.obligation_draft_items WHERE draft_id = p_draft_id LIMIT 1;
  ELSE
    -- For multi-item drafts (salaries), only attach account if all items share the same account
    SELECT MAX(account_id) INTO v_account_id
    FROM public.obligation_draft_items
    WHERE draft_id = p_draft_id AND account_id IS NOT NULL
    GROUP BY draft_id
    HAVING COUNT(DISTINCT account_id) = 1
       AND COUNT(*) = v_item_count;
  END IF;

  -- Create the expense transaction (trigger syncs fund balance and ledger account balance)
  INSERT INTO public.transactions(
    user_id, type, category, amount, fund_id, account_id,
    description, date, source_type, reference_id, created_by_name
  ) VALUES (
    p_user_id, 'out', v_obligation.category, v_draft.total_amount, p_fund_id, v_account_id,
    v_description, p_date, 'obligation', p_draft_id, p_created_by_name
  ) RETURNING id INTO v_tx_id;

  -- Mark draft as posted
  UPDATE public.obligation_drafts
  SET status = 'posted', transaction_id = v_tx_id, fund_id = p_fund_id, posted_at = now()
  WHERE id = p_draft_id;

  -- Increment posted_count
  UPDATE public.recurring_obligations
  SET posted_count = posted_count + 1
  WHERE id = v_draft.obligation_id;

  RETURN v_tx_id;
END;
$function$;