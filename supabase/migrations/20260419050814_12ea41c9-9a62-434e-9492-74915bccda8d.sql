-- Add enabled_modules column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS enabled_modules text[] NOT NULL DEFAULT ARRAY['home','funds','accounts','projects','business','shipping','reports']::text[];

-- Add helpful comment
COMMENT ON COLUMN public.companies.enabled_modules IS 'List of enabled module keys for this company. Controls which sections appear in the UI.';

-- Helper function to check if a module is enabled for current user's company
CREATE OR REPLACE FUNCTION public.is_module_enabled(_module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT _module = ANY(c.enabled_modules)
     FROM companies c
     JOIN user_roles ur ON ur.company_id = c.id
     WHERE ur.user_id = auth.uid() AND ur.is_active = true
     LIMIT 1),
    true
  )
$$;

-- Helper function to get enabled modules for current user's company
CREATE OR REPLACE FUNCTION public.get_enabled_modules()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.enabled_modules, ARRAY['home','funds','accounts','projects','business','shipping','reports']::text[])
  FROM companies c
  JOIN user_roles ur ON ur.company_id = c.id
  WHERE ur.user_id = auth.uid() AND ur.is_active = true
  LIMIT 1
$$;