
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'شركتي',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Add company_id to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- 3. Helper: get current user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT company_id FROM user_roles WHERE user_id = auth.uid() AND is_active = true LIMIT 1 $$;

-- 4. Helper: get all active user_ids in same company
CREATE OR REPLACE FUNCTION public.company_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ur.user_id FROM user_roles ur
  WHERE ur.company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() AND is_active = true LIMIT 1)
  AND ur.is_active = true
$$;

-- 5. Backfill: create company for existing owners/admins
DO $$
DECLARE
  r RECORD;
  v_cid uuid;
BEGIN
  FOR r IN
    SELECT ur.user_id, ur.role, COALESCE(cs.company_name, 'شركتي') as cname
    FROM user_roles ur
    LEFT JOIN company_settings cs ON cs.user_id = ur.user_id
    WHERE ur.role IN ('owner', 'admin')
    AND ur.company_id IS NULL
  LOOP
    INSERT INTO companies (owner_user_id, name) VALUES (r.user_id, r.cname) RETURNING id INTO v_cid;
    UPDATE user_roles SET company_id = v_cid WHERE user_id = r.user_id;
  END LOOP;
  -- Link remaining unassigned users to first company
  UPDATE user_roles SET company_id = (SELECT id FROM companies ORDER BY created_at LIMIT 1)
  WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies);
END $$;

-- 6. RLS for companies
CREATE POLICY "View own company" ON public.companies FOR SELECT
USING (id IN (SELECT company_id FROM user_roles WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Owner can update company" ON public.companies FOR UPDATE
USING (owner_user_id = auth.uid());

CREATE POLICY "Owner can insert company" ON public.companies FOR INSERT
WITH CHECK (owner_user_id = auth.uid());
