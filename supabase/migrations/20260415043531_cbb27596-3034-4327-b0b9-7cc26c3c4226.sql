
-- Create container_expenses table
CREATE TABLE public.container_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  container_id UUID NOT NULL REFERENCES public.containers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.container_expenses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company view container_expenses"
ON public.container_expenses FOR SELECT
USING (user_id IN (SELECT company_user_ids()));

CREATE POLICY "Company insert container_expenses"
ON public.container_expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Company update container_expenses"
ON public.container_expenses FOR UPDATE
USING (user_id IN (SELECT company_user_ids()));

CREATE POLICY "Company delete container_expenses"
ON public.container_expenses FOR DELETE
USING (user_id IN (SELECT company_user_ids()));

-- Trigger to update container total_cost and profit when expenses change
CREATE OR REPLACE FUNCTION public.sync_container_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_container_id UUID;
  v_extra_expenses NUMERIC;
  v_base_cost NUMERIC;
  v_new_total NUMERIC;
BEGIN
  -- Determine which container was affected
  IF TG_OP = 'DELETE' THEN
    v_container_id := OLD.container_id;
  ELSE
    v_container_id := NEW.container_id;
  END IF;

  -- Sum all extra expenses for this container
  SELECT COALESCE(SUM(amount), 0) INTO v_extra_expenses
  FROM container_expenses WHERE container_id = v_container_id;

  -- Get base costs from container
  SELECT (COALESCE(container_price, 0) + shipping_cost + customs_cost + port_cost + COALESCE(glass_fees, 0) + other_costs)
  INTO v_base_cost FROM containers WHERE id = v_container_id;

  v_new_total := v_base_cost + v_extra_expenses;

  UPDATE containers SET
    total_cost = v_new_total,
    profit = total_revenue - v_new_total
  WHERE id = v_container_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_container_expenses
AFTER INSERT OR UPDATE OR DELETE ON public.container_expenses
FOR EACH ROW EXECUTE FUNCTION public.sync_container_expenses();

-- Updated_at trigger
CREATE TRIGGER update_container_expenses_updated_at
BEFORE UPDATE ON public.container_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
