
-- Add created_by_name column to all main tables
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by_name text;

-- Create a helper function to get the current user's display name
CREATE OR REPLACE FUNCTION public.get_current_user_name()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(full_name, 'مستخدم')
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Auto-populate created_by_name on INSERT for transactions
CREATE OR REPLACE FUNCTION public.set_created_by_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.created_by_name IS NULL OR NEW.created_by_name = '' THEN
    NEW.created_by_name := (SELECT COALESCE(full_name, 'مستخدم') FROM profiles WHERE user_id = auth.uid() LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers for all tables
CREATE TRIGGER trg_transactions_set_created_by
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_created_by_name();

CREATE TRIGGER trg_projects_set_created_by
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION set_created_by_name();

CREATE TRIGGER trg_containers_set_created_by
  BEFORE INSERT ON containers
  FOR EACH ROW EXECUTE FUNCTION set_created_by_name();

CREATE TRIGGER trg_shipments_set_created_by
  BEFORE INSERT ON shipments
  FOR EACH ROW EXECUTE FUNCTION set_created_by_name();

CREATE TRIGGER trg_debts_set_created_by
  BEFORE INSERT ON debts
  FOR EACH ROW EXECUTE FUNCTION set_created_by_name();

CREATE TRIGGER trg_contacts_set_created_by
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_created_by_name();
