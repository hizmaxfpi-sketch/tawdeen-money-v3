CREATE OR REPLACE FUNCTION public.generate_obligation_drafts(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation RECORD;
  v_item RECORD;
  v_draft_id UUID;
  v_today DATE := CURRENT_DATE;
  v_period DATE;
  v_due_date DATE;
  v_count INTEGER := 0;
  v_company_users UUID[];
  v_start_period DATE;
  v_end_period DATE := date_trunc('month', v_today)::date;
  v_months_limit INTEGER;
  v_period_index INTEGER;
BEGIN
  SELECT array_agg(uid) INTO v_company_users
  FROM (SELECT company_user_ids() AS uid) sub
  WHERE uid IS NOT NULL;

  FOR v_obligation IN
    SELECT * FROM public.recurring_obligations
    WHERE is_active = true
      AND user_id = ANY(v_company_users)
      AND start_date <= v_today
      AND (total_months IS NULL OR posted_count < total_months)
  LOOP
    v_start_period := date_trunc('month', v_obligation.start_date)::date;
    v_months_limit := COALESCE(v_obligation.total_months, 1200);
    v_period_index := 0;
    v_period := v_start_period;

    WHILE v_period <= v_end_period AND v_period_index < v_months_limit LOOP
      v_due_date := (
        v_period
        + (LEAST(v_obligation.due_day, EXTRACT(DAY FROM (date_trunc('month', v_period) + interval '1 month - 1 day'))::int) - 1)
      )::date;

      IF v_due_date <= v_today THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.obligation_drafts
          WHERE obligation_id = v_obligation.id
            AND period_year = EXTRACT(YEAR FROM v_period)::INTEGER
            AND period_month = EXTRACT(MONTH FROM v_period)::INTEGER
        ) THEN
          INSERT INTO public.obligation_drafts(
            obligation_id, user_id, period_year, period_month,
            due_date, total_amount, status, fund_id
          ) VALUES (
            v_obligation.id,
            p_user_id,
            EXTRACT(YEAR FROM v_period)::INTEGER,
            EXTRACT(MONTH FROM v_period)::INTEGER,
            v_due_date,
            0,
            'draft',
            v_obligation.default_fund_id
          ) RETURNING id INTO v_draft_id;

          FOR v_item IN
            SELECT * FROM public.obligation_items
            WHERE obligation_id = v_obligation.id AND is_active = true
          LOOP
            INSERT INTO public.obligation_draft_items(
              draft_id, item_id, user_id, name, base_amount,
              absence_days, absence_deduction, advance_deduction, bonus, net_amount,
              account_id
            ) VALUES (
              v_draft_id, v_item.id, p_user_id, v_item.name, v_item.base_amount,
              0, 0, 0, 0, v_item.base_amount,
              v_item.account_id
            );
          END LOOP;

          UPDATE public.obligation_drafts
          SET total_amount = COALESCE((
            SELECT SUM(net_amount) FROM public.obligation_draft_items WHERE draft_id = v_draft_id
          ), 0)
          WHERE id = v_draft_id;

          v_count := v_count + 1;
        END IF;
      END IF;

      v_period := (v_period + interval '1 month')::date;
      v_period_index := v_period_index + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

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

  SELECT COUNT(*) INTO v_item_count FROM public.obligation_draft_items WHERE draft_id = p_draft_id;

  IF v_item_count = 1 THEN
    SELECT account_id INTO v_account_id
    FROM public.obligation_draft_items
    WHERE draft_id = p_draft_id
    LIMIT 1;
  ELSE
    SELECT COUNT(DISTINCT account_id), COUNT(account_id)
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