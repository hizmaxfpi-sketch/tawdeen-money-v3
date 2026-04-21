CREATE OR REPLACE FUNCTION public.post_obligation_draft(p_draft_id uuid, p_fund_id uuid, p_date date, p_user_id uuid, p_created_by_name text)
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
BEGIN
  SELECT * INTO v_draft FROM public.obligation_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status = 'posted' THEN RAISE EXCEPTION 'Draft already posted'; END IF;

  SELECT * INTO v_obligation FROM public.recurring_obligations WHERE id = v_draft.obligation_id;

  v_description := v_obligation.name || ' - ' || v_draft.period_year || '/' || LPAD(v_draft.period_month::TEXT, 2, '0');

  -- Create the expense transaction (trigger trg_sync_fund_balances_from_transactions will sync fund balance)
  INSERT INTO public.transactions(
    user_id, type, category, amount, fund_id,
    description, date, source_type, reference_id, created_by_name
  ) VALUES (
    p_user_id, 'out', v_obligation.category, v_draft.total_amount, p_fund_id,
    v_description, p_date, 'obligation', p_draft_id, p_created_by_name
  ) RETURNING id INTO v_tx_id;

  -- DO NOT manually update fund balance — the trigger handles it (was causing double-deduction)

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