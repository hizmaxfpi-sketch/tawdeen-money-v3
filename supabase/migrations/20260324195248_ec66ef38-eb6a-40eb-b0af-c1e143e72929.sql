
-- 1. Add status to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'basic';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 5;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subscription_expires_at timestamp with time zone;

-- 2. Create platform_admins table
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Platform admins can view their own record
CREATE POLICY "Platform admins can view own record"
ON public.platform_admins FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3. Helper function to check if current user is a platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
  )
$$;

-- 4. Platform admins can manage companies (full access)
CREATE POLICY "Platform admins can view all companies"
ON public.companies FOR SELECT TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can update all companies"
ON public.companies FOR UPDATE TO authenticated
USING (is_platform_admin());

-- 5. Platform admins can view all user_roles
CREATE POLICY "Platform admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (is_platform_admin());

-- 6. Platform admins can view all profiles
CREATE POLICY "Platform admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_platform_admin());

-- 7. Function to get company status for blocking
CREATE OR REPLACE FUNCTION public.get_company_status()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT c.status FROM companies c
  JOIN user_roles ur ON ur.company_id = c.id
  WHERE ur.user_id = auth.uid() AND ur.is_active = true
  LIMIT 1
$$;
