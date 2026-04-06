
-- Extend assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fund_id uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS vendor_id uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'full';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS installment_count integer NOT NULL DEFAULT 1;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_fund_id uuid;

-- Asset payments for installments
CREATE TABLE IF NOT EXISTS asset_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  fund_id uuid,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  paid_date date,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE asset_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company view asset_payments" ON asset_payments FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert asset_payments" ON asset_payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update asset_payments" ON asset_payments FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete asset_payments" ON asset_payments FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- Asset improvements (تطوير)
CREATE TABLE IF NOT EXISTS asset_improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric NOT NULL,
  fund_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE asset_improvements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company view asset_improvements" ON asset_improvements FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert asset_improvements" ON asset_improvements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update asset_improvements" ON asset_improvements FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete asset_improvements" ON asset_improvements FOR DELETE USING (user_id IN (SELECT company_user_ids()));
