-- إنشاء Trigger لإنشاء ملف شخصي وصلاحيات وصندوق افتراضي للمستخدم الجديد
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- إنشاء ملف شخصي
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  -- إنشاء صلاحية افتراضية (admin للمستخدم الأول)
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');
  END IF;
  
  -- إنشاء صندوق افتراضي
  INSERT INTO public.funds (user_id, name, type, balance)
  VALUES (NEW.id, 'الصندوق النقدي', 'cash', 0);
  
  RETURN NEW;
END;
$$;

-- إنشاء الـ Trigger على جدول auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();