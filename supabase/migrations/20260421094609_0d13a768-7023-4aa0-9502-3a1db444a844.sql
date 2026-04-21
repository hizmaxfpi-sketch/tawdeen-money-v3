CREATE OR REPLACE FUNCTION public.post_obligation_draft(
  p_draft_id uuid,
  p_fund_id uuid,
  p_date date,
  p_user_id uuid,
  p_created_by_name text
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
  v_account_id UUID;       -- ledger_accounts (if exists)
  v_contact_id UUID;       -- contacts (UI dropdown is sourced from contacts)
  v_link_id UUID;          -- the raw account_id stored on items
  v_item_count INT;
  v_distinct_links INT;
  v_with_link INT;
BEGIN
  SELECT * INTO v_draft FROM public.obligation_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status = 'posted' THEN RAISE EXCEPTION 'Draft already posted'; END IF;

  SELECT * INTO v_obligation FROM public.recurring_obligations WHERE id = v_draft.obligation_id;

  v_description := v_obligation.name || ' - ' || v_draft.period_year || '/' || LPAD(v_draft.period_month::TEXT, 2, '0');

  SELECT COUNT(*) INTO v_item_count FROM public.obligation_draft_items WHERE draft_id = p_draft_id;

  -- Pick the linked id only if all items share the same link
  IF v_item_count = 1 THEN
    SELECT account_id INTO v_link_id
    FROM public.obligation_draft_items
    WHERE draft_id = p_draft_id
    LIMIT 1;
  ELSE
    SELECT COUNT(DISTINCT account_id), COUNT(account_id)
    INTO v_distinct_links, v_with_link
    FROM public.obligation_draft_items
    WHERE draft_id = p_draft_id;

    IF v_distinct_links = 1 AND v_with_link = v_item_count THEN
      SELECT account_id INTO v_link_id
      FROM public.obligation_draft_items
      WHERE draft_id = p_draft_id AND account_id IS NOT NULL
      LIMIT 1;
    ELSE
      v_link_id := NULL;
    END IF;
  END IF;

  -- Resolve link to either ledger_accounts or contacts (whichever exists)
  IF v_link_id IS NOT NULL THEN
    SELECT id INTO v_account_id FROM public.ledger_accounts WHERE id = v_link_id;
    IF v_account_id IS NULL THEN
      SELECT id INTO v_contact_id FROM public.contacts WHERE id = v_link_id;
    END IF;
  END IF;

  INSERT INTO public.transactions(
    user_id, type, category, amount, fund_id, account_id, contact_id,
    description, date, source_type, reference_id, created_by_name
  ) VALUES (
    p_user_id, 'out', v_obligation.category, v_draft.total_amount, p_fund_id, v_account_id, v_contact_id,
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

-- Backfill: link previously posted obligation transactions to their contact
UPDATE public.transactions t
SET contact_id = di.account_id
FROM public.obligation_drafts d
JOIN public.obligation_draft_items di ON di.draft_id = d.id
WHERE t.source_type = 'obligation'
  AND t.reference_id = d.id
  AND t.contact_id IS NULL
  AND t.account_id IS NULL
  AND di.account_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = di.account_id);