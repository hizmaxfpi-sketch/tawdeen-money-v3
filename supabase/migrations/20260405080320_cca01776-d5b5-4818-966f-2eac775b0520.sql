
-- Assets table for business section
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  depreciation_rate NUMERIC NOT NULL DEFAULT 0,
  monthly_depreciation NUMERIC NOT NULL DEFAULT 0,
  total_depreciation NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company view assets" ON public.assets FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert assets" ON public.assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update assets" ON public.assets FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete assets" ON public.assets FOR DELETE USING (user_id IN (SELECT company_user_ids()));

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
