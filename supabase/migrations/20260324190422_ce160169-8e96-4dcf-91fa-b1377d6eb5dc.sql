
-- Update handle_new_user to assign 'owner' to the first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role, is_active)
    VALUES (NEW.id, 'owner', true);
  ELSE
    INSERT INTO public.user_roles (user_id, role, is_active)
    VALUES (NEW.id, 'viewer', true);
  END IF;
  
  INSERT INTO public.funds (user_id, name, type, balance)
  VALUES (NEW.id, 'الصندوق النقدي', 'cash', 0);
  
  RETURN NEW;
END;
$function$;

-- Update has_role to check is_active
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
  )
$$;

-- Update has_any_role to check is_active
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND is_active = true
  )
$$;
