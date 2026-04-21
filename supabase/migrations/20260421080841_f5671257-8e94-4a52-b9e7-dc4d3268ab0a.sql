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
  v_distinct_accounts INT;
  v_with_account INT;
BEGIN
  SELECT * INTO v_draft FROM public.obligation_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status = 'posted' THEN RAISE EXCEPTION 'Draft already posted'; END IF;

  SELECT * INTO v_obligation FROM public.recurring_obligations WHERE id = v_draft.obligation_id;

  v_description := v_obligation.name || ' - ' || v_draft.period_year || '/' || LPAD(v_draft.period_month::TEXT, 2, '0');

  -- Determine linked account safely (avoid MAX(uuid) which is unsupported)
  SELECT COUNT(*) INTO v_item_count FROM public.obligation_draft_items WHERE draft_id = p_draft_id;

  IF v_item_count = 1 THEN
    SELECT account_id INTO v_account_id FROM public.obligation_draft_items WHERE draft_id = p_draft_id LIMIT 1;
  ELSE
    -- Multi-item: only attach an account if ALL items share the SAME non-null account
    SELECT
      COUNT(DISTINCT account_id),
      COUNT(account_id)
    INTO v_distinct_accounts, v_with_account
    FROM public.obligation_draft_items
    WHERE draft_id = p_draft_id;

    IF v_distinct_accounts = 1 AND v_with_account = v_item_count THEN
      SELECT account_id INTO v_account_id
      FROM public.obligation_draft_items
      WHERE draft_id = p_draft_id
      LIMIT 1;
    ELSE
      v_account_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.transactions(
    user_id, type, category, amount, fund_id, account_id,
    description, date, source_type, reference_id, created_by_name
  ) VALUES (
    p_user_id, 'out', v_obligation.category, v_draft.total_amount, p_fund_id, v_account_id,
    v_description, p_date, 'obligation', p_draft_id, p_created_by_name
  ) RETURNING id INTO v_tx_id;

  UPDATE public.obligation_drafts
  SET status = 'posted', transaction_id = v_tx_id, fund_id = p_fund_id, posted_at = now()
  WHERE id = p_draft_id;

  UPDATE public.recurring_obligations
  SET posted_count = posted_count + 1
  WHERE id = v_draft.obligation_id;

  RETURN v_tx_id;
END;
$function$;