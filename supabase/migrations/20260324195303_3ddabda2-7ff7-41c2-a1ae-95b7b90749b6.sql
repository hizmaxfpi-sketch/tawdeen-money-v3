
-- Update handle_new_user to create companies as 'pending'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_company_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    -- First user: create company as active (initial setup)
    INSERT INTO public.companies (owner_user_id, name, status)
    VALUES (NEW.id, 'شركتي', 'active')
    RETURNING id INTO v_company_id;
    
    INSERT INTO public.user_roles (user_id, role, is_active, company_id)
    VALUES (NEW.id, 'owner', true, v_company_id);
  ELSE
    -- Subsequent self-registered users: create company as pending
    INSERT INTO public.companies (owner_user_id, name, status)
    VALUES (NEW.id, 'شركة جديدة', 'pending')
    RETURNING id INTO v_company_id;
    
    INSERT INTO public.user_roles (user_id, role, is_active, company_id)
    VALUES (NEW.id, 'owner', true, v_company_id);
  END IF;
  
  INSERT INTO public.funds (user_id, name, type, balance)
  VALUES (NEW.id, 'الصندوق النقدي', 'cash', 0);
  
  RETURN NEW;
END;
$function$;
