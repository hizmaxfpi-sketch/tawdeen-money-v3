
-- Fix: Allow owner role to manage user_roles (currently only admin can)
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins and owners can manage all roles"
ON public.user_roles
FOR ALL
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
);

-- Also allow company members to view all roles in their company
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view company roles"
ON public.user_roles
FOR SELECT
TO public
USING (
  company_id = get_user_company_id()
);

-- Fix profiles RLS so admins/owners can see other company members' profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view company profiles"
ON public.profiles
FOR SELECT
TO public
USING (
  user_id IN (SELECT company_user_ids())
  OR auth.uid() = user_id
);
