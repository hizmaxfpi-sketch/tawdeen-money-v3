CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_existing_profile_id uuid;
  v_existing_company_id uuid;
BEGIN
  SELECT id INTO v_existing_profile_id
  FROM public.profiles
  WHERE user_id = NEW.id
  LIMIT 1;

  IF v_existing_profile_id IS NULL THEN
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  END IF;

  SELECT company_id INTO v_existing_company_id
  FROM public.user_roles
  WHERE user_id = NEW.id
  LIMIT 1;

  IF v_existing_company_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE is_active = true) THEN
      INSERT INTO public.companies (owner_user_id, name, status)
      VALUES (NEW.id, 'شركتي', 'active')
      RETURNING id INTO v_company_id;
    ELSE
      INSERT INTO public.companies (owner_user_id, name, status)
      VALUES (NEW.id, 'شركة جديدة', 'pending')
      RETURNING id INTO v_company_id;
    END IF;

    INSERT INTO public.user_roles (user_id, role, is_active, company_id)
    VALUES (NEW.id, 'owner', true, v_company_id);
  ELSE
    v_company_id := v_existing_company_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.funds
    WHERE user_id = NEW.id AND name = 'الصندوق النقدي'
  ) THEN
    INSERT INTO public.funds (user_id, name, type, balance)
    VALUES (NEW.id, 'الصندوق النقدي', 'cash', 0);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for user %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();