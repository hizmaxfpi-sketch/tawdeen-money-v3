
-- ============= recurring_obligations =============
CREATE TABLE public.recurring_obligations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  obligation_type TEXT NOT NULL DEFAULT 'salary', -- salary | rent | subscription | installment | other
  category TEXT NOT NULL DEFAULT 'salaries', -- maps to business expense categories
  default_fund_id UUID,
  due_day INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_months INTEGER, -- NULL = unlimited; otherwise stops after N postings
  posted_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_obligations_user ON public.recurring_obligations(user_id);
CREATE INDEX idx_recurring_obligations_active ON public.recurring_obligations(is_active) WHERE is_active = true;

ALTER TABLE public.recurring_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company view recurring_obligations" ON public.recurring_obligations
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert recurring_obligations" ON public.recurring_obligations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update recurring_obligations" ON public.recurring_obligations
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete recurring_obligations" ON public.recurring_obligations
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- ============= obligation_items =============
CREATE TABLE public.obligation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obligation_id UUID NOT NULL REFERENCES public.recurring_obligations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  base_amount NUMERIC NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 30, -- used to compute daily rate for absence deduction
  account_id UUID, -- optional link to ledger_accounts (employee account)
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_obligation_items_obligation ON public.obligation_items(obligation_id);
CREATE INDEX idx_obligation_items_user ON public.obligation_items(user_id);

ALTER TABLE public.obligation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company view obligation_items" ON public.obligation_items
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert obligation_items" ON public.obligation_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update obligation_items" ON public.obligation_items
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete obligation_items" ON public.obligation_items
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- ============= obligation_drafts =============
CREATE TABLE public.obligation_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obligation_id UUID NOT NULL REFERENCES public.recurring_obligations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  due_date DATE NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | posted | skipped
  fund_id UUID,
  transaction_id UUID, -- the resulting expense transaction
  posted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, period_year, period_month)
);

CREATE INDEX idx_obligation_drafts_user ON public.obligation_drafts(user_id);
CREATE INDEX idx_obligation_drafts_status ON public.obligation_drafts(status);

ALTER TABLE public.obligation_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company view obligation_drafts" ON public.obligation_drafts
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert obligation_drafts" ON public.obligation_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update obligation_drafts" ON public.obligation_drafts
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete obligation_drafts" ON public.obligation_drafts
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- ============= obligation_draft_items =============
CREATE TABLE public.obligation_draft_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.obligation_drafts(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.obligation_items(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  base_amount NUMERIC NOT NULL DEFAULT 0,
  absence_days NUMERIC NOT NULL DEFAULT 0,
  absence_deduction NUMERIC NOT NULL DEFAULT 0,
  advance_deduction NUMERIC NOT NULL DEFAULT 0,
  bonus NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  account_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_obligation_draft_items_draft ON public.obligation_draft_items(draft_id);
CREATE INDEX idx_obligation_draft_items_user ON public.obligation_draft_items(user_id);

ALTER TABLE public.obligation_draft_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company view obligation_draft_items" ON public.obligation_draft_items
  FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert obligation_draft_items" ON public.obligation_draft_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update obligation_draft_items" ON public.obligation_draft_items
  FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete obligation_draft_items" ON public.obligation_draft_items
  FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- updated_at triggers
CREATE TRIGGER trg_recurring_obligations_updated
  BEFORE UPDATE ON public.recurring_obligations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_obligation_items_updated
  BEFORE UPDATE ON public.obligation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_obligation_drafts_updated
  BEFORE UPDATE ON public.obligation_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_obligations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.obligation_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.obligation_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.obligation_draft_items;

-- =====================================================
-- RPC: generate_obligation_drafts
-- Creates draft entries for all active obligations whose due_day has arrived this month
-- and don't already have a draft. Returns count of drafts created.
-- =====================================================
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
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
  v_due_date DATE;
  v_count INTEGER := 0;
  v_company_users UUID[];
BEGIN
  -- Get all users in the same company
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
    v_due_date := make_date(v_year, v_month, LEAST(v_obligation.due_day, 28));
    
    -- Only generate if due day has passed this month
    IF v_today < v_due_date THEN CONTINUE; END IF;
    
    -- Skip if draft already exists
    IF EXISTS (
      SELECT 1 FROM public.obligation_drafts
      WHERE obligation_id = v_obligation.id
        AND period_year = v_year
        AND period_month = v_month
    ) THEN CONTINUE; END IF;

    INSERT INTO public.obligation_drafts(
      obligation_id, user_id, period_year, period_month,
      due_date, total_amount, status, fund_id
    ) VALUES (
      v_obligation.id, p_user_id, v_year, v_month,
      v_due_date, 0, 'draft', v_obligation.default_fund_id
    ) RETURNING id INTO v_draft_id;

    -- Snapshot active items
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

    -- Update draft total
    UPDATE public.obligation_drafts
    SET total_amount = COALESCE((
      SELECT SUM(net_amount) FROM public.obligation_draft_items WHERE draft_id = v_draft_id
    ), 0)
    WHERE id = v_draft_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =====================================================
-- RPC: post_obligation_draft
-- Posts an approved draft as an expense transaction
-- =====================================================
CREATE OR REPLACE FUNCTION public.post_obligation_draft(
  p_draft_id UUID,
  p_fund_id UUID,
  p_date DATE,
  p_user_id UUID,
  p_created_by_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft RECORD;
  v_obligation RECORD;
  v_tx_id UUID;
  v_description TEXT;
BEGIN
  SELECT * INTO v_draft FROM public.obligation_drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status = 'posted' THEN RAISE EXCEPTION 'Draft already posted'; END IF;

  SELECT * INTO v_obligation FROM public.recurring_obligations WHERE id = v_draft.obligation_id;

  v_description := v_obligation.name || ' - ' || v_draft.period_year || '/' || LPAD(v_draft.period_month::TEXT, 2, '0');

  -- Create the expense transaction
  INSERT INTO public.transactions(
    user_id, type, category, amount, fund_id,
    description, date, source_type, reference_id, created_by_name
  ) VALUES (
    p_user_id, 'out', v_obligation.category, v_draft.total_amount, p_fund_id,
    v_description, p_date, 'obligation', p_draft_id, p_created_by_name
  ) RETURNING id INTO v_tx_id;

  -- Update fund balance
  UPDATE public.funds SET balance = balance - v_draft.total_amount WHERE id = p_fund_id;

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
$$;
