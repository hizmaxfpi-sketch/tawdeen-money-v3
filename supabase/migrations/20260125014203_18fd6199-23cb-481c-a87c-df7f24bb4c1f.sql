-- ============================================
-- 1. إنشاء أنواع الصلاحيات
-- ============================================
CREATE TYPE public.app_role AS ENUM ('admin', 'accountant', 'shipping_staff', 'viewer');
CREATE TYPE public.fund_type AS ENUM ('cash', 'bank', 'wallet', 'safe', 'other');
CREATE TYPE public.account_type AS ENUM ('client', 'vendor', 'partner', 'investor', 'employee', 'custom');
CREATE TYPE public.contact_type AS ENUM ('client', 'vendor', 'shipping_agent', 'employee', 'partner', 'other');
CREATE TYPE public.transaction_type AS ENUM ('in', 'out');
CREATE TYPE public.container_status AS ENUM ('loading', 'shipped', 'arrived', 'cleared', 'delivered');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE public.debt_type AS ENUM ('receivable', 'payable');
CREATE TYPE public.debt_status AS ENUM ('pending', 'partial', 'paid', 'overdue');

-- ============================================
-- 2. جدول الملفات الشخصية للمستخدمين
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 3. جدول الصلاحيات (منفصل عن الملفات الشخصية)
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- دالة للتحقق من الصلاحيات (Security Definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
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
  )
$$;

-- دالة للتحقق من أي صلاحية
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 4. جدول الصناديق (Funds)
-- ============================================
CREATE TABLE public.funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type fund_type NOT NULL DEFAULT 'cash',
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funds"
  ON public.funds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own funds"
  ON public.funds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own funds"
  ON public.funds FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own funds"
  ON public.funds FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 5. جدول الحسابات الدفترية (Ledger Accounts)
-- ============================================
CREATE TABLE public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL DEFAULT 'client',
  custom_type TEXT,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts"
  ON public.ledger_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON public.ledger_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON public.ledger_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON public.ledger_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 6. جدول جهات الاتصال (Contacts)
-- ============================================
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type contact_type NOT NULL DEFAULT 'client',
  phone TEXT,
  email TEXT,
  company TEXT,
  address TEXT,
  notes TEXT,
  total_debit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  parent_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  linked_contacts UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts"
  ON public.contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
  ON public.contacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON public.contacts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 7. جدول المشاريع (Projects)
-- ============================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contract_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  received_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  expenses DECIMAL(15, 2) NOT NULL DEFAULT 0,
  profit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 8. جدول العمليات المالية (Transactions)
-- ============================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  category TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.ledger_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  description TEXT,
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  attachments TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 9. جدول الحاويات (Containers)
-- ============================================
CREATE TABLE public.containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  container_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '40ft',
  capacity DECIMAL(10, 2) NOT NULL DEFAULT 67,
  used_capacity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  route TEXT NOT NULL,
  status container_status NOT NULL DEFAULT 'loading',
  departure_date DATE,
  arrival_date DATE,
  clearance_date DATE,
  shipping_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  customs_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  port_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  other_costs DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
  profit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own containers"
  ON public.containers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own containers"
  ON public.containers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own containers"
  ON public.containers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own containers"
  ON public.containers FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 10. جدول الشحنات (Shipments)
-- ============================================
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  container_id UUID NOT NULL REFERENCES public.containers(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  goods_type TEXT NOT NULL,
  length DECIMAL(10, 2) NOT NULL DEFAULT 0,
  width DECIMAL(10, 2) NOT NULL DEFAULT 0,
  height DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  cbm DECIMAL(10, 4) NOT NULL DEFAULT 0,
  price_per_meter DECIMAL(15, 2) NOT NULL DEFAULT 0,
  contract_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  remaining_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  tracking_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shipments"
  ON public.shipments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shipments"
  ON public.shipments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shipments"
  ON public.shipments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 11. جدول دفعات الشحن (Shipment Payments)
-- ============================================
CREATE TABLE public.shipment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  amount DECIMAL(15, 2) NOT NULL,
  note TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shipment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON public.shipment_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payments"
  ON public.shipment_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 12. جدول المديونيات (Debts)
-- ============================================
CREATE TABLE public.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type debt_type NOT NULL,
  account_id UUID REFERENCES public.ledger_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  original_amount DECIMAL(15, 2) NOT NULL,
  remaining_amount DECIMAL(15, 2) NOT NULL,
  status debt_status NOT NULL DEFAULT 'pending',
  description TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own debts"
  ON public.debts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own debts"
  ON public.debts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own debts"
  ON public.debts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own debts"
  ON public.debts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 13. جدول دفعات المديونيات (Debt Payments)
-- ============================================
CREATE TABLE public.debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  amount DECIMAL(15, 2) NOT NULL,
  note TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own debt payments"
  ON public.debt_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own debt payments"
  ON public.debt_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 14. دوال التحديث التلقائي (Triggers)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- تطبيق الـ Trigger على جميع الجداول
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_funds_updated_at
  BEFORE UPDATE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ledger_accounts_updated_at
  BEFORE UPDATE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_containers_updated_at
  BEFORE UPDATE ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 15. دالة إنشاء ملف شخصي للمستخدم الجديد
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 16. تفعيل Realtime للجداول الأساسية
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.funds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.containers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;