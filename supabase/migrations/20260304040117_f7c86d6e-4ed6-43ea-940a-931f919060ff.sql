
-- ============================================================
-- المرحلة 1: إضافة أعمدة الدفتر الموحد إلى transactions
-- ============================================================

-- 1.1 إضافة نوع المصدر
DO $$ BEGIN
  CREATE TYPE public.posting_source AS ENUM (
    'manual',           -- عملية يدوية
    'shipment_invoice', -- قيد تلقائي من إنشاء شحنة
    'shipment_payment', -- دفعة شحنة
    'project_client',   -- قيد عميل مشروع
    'project_vendor',   -- قيد مورد مشروع
    'debt_payment',     -- سداد مديونية
    'fund_transfer'     -- تحويل بين صناديق
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1.2 إضافة الأعمدة الجديدة
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reference_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS posting_batch_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shipment_id uuid DEFAULT NULL;

-- 1.3 فهرسة للبحث السريع
CREATE INDEX IF NOT EXISTS idx_transactions_source_type ON public.transactions(source_type);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON public.transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_transactions_posting_batch_id ON public.transactions(posting_batch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shipment_id ON public.transactions(shipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency ON public.transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 1.4 Foreign Key للشحنات
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_shipment_id_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_shipment_id_fkey
  FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE SET NULL;

-- ============================================================
-- المرحلة 2: إنشاء الـ Views الموحدة
-- ============================================================

-- 2.1 كشف حساب موحد (v_account_ledger)
CREATE OR REPLACE VIEW public.v_account_ledger AS
SELECT
  t.id,
  t.user_id,
  t.contact_id,
  t.date,
  t.type,
  t.category,
  t.source_type,
  t.amount,
  -- signed_amount: موجب = مدين (debit/له)، سالب = دائن (credit/عليه)
  CASE
    WHEN t.type = 'in' THEN t.amount    -- تحصيل = مدين (debit)
    WHEN t.type = 'out' THEN -t.amount  -- صادر = دائن (credit)
    ELSE 0
  END AS signed_amount,
  t.description,
  t.notes,
  t.fund_id,
  t.project_id,
  t.shipment_id,
  t.reference_id,
  t.posting_batch_id,
  t.created_at
FROM public.transactions t
WHERE t.category != 'fund_transfer';

-- 2.2 ملخص أرصدة العملاء من الدفتر (v_contact_balance)
CREATE OR REPLACE VIEW public.v_contact_balance AS
SELECT
  contact_id,
  user_id,
  COUNT(*) AS total_transactions,
  COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS total_debit,
  COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS total_credit,
  COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS balance
FROM public.transactions
WHERE contact_id IS NOT NULL AND category != 'fund_transfer'
GROUP BY contact_id, user_id;

-- 2.3 ملخص أرصدة الشحنات (v_invoice_balance)
CREATE OR REPLACE VIEW public.v_invoice_balance AS
SELECT
  s.id AS shipment_id,
  s.user_id,
  s.container_id,
  s.client_id,
  s.client_name,
  s.goods_type,
  s.cbm,
  s.contract_price,
  s.contract_price AS invoice_amount,
  COALESCE(paid.total_paid, 0) AS total_paid,
  s.contract_price - COALESCE(paid.total_paid, 0) AS remaining,
  CASE
    WHEN s.contract_price - COALESCE(paid.total_paid, 0) <= 0 THEN 'paid'
    WHEN COALESCE(paid.total_paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS calc_status
FROM public.shipments s
LEFT JOIN (
  SELECT shipment_id, SUM(amount) AS total_paid
  FROM public.shipment_payments
  GROUP BY shipment_id
) paid ON paid.shipment_id = s.id;

-- ============================================================
-- المرحلة 3: إعادة كتابة الدوال (RPC Functions)
-- ============================================================

-- 3.1 إنشاء شحنة مع محاسبة صحيحة
CREATE OR REPLACE FUNCTION public.create_shipment_with_accounting(
  p_user_id uuid, p_container_id uuid,
  p_client_id uuid DEFAULT NULL, p_client_name text DEFAULT '',
  p_client_code text DEFAULT NULL, p_recipient_name text DEFAULT NULL,
  p_goods_type text DEFAULT '', p_length numeric DEFAULT 0,
  p_width numeric DEFAULT 0, p_height numeric DEFAULT 0,
  p_quantity integer DEFAULT 1, p_weight numeric DEFAULT 0,
  p_cbm numeric DEFAULT NULL, p_price_per_meter numeric DEFAULT 0,
  p_amount_paid numeric DEFAULT 0, p_tracking_number text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_china_expenses numeric DEFAULT 0,
  p_sea_freight numeric DEFAULT 0, p_port_delivery_fees numeric DEFAULT 0,
  p_customs_fees numeric DEFAULT 0, p_internal_transport_fees numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment_id UUID;
  v_cbm NUMERIC;
  v_contract_price NUMERIC;
  v_remaining NUMERIC;
  v_payment_status TEXT;
  v_batch_id UUID := gen_random_uuid();
  v_is_closed BOOLEAN;
BEGIN
  SELECT is_manually_closed INTO v_is_closed FROM containers WHERE id = p_container_id;
  IF v_is_closed THEN RAISE EXCEPTION 'Container is manually closed'; END IF;

  v_cbm := COALESCE(NULLIF(p_cbm, 0), p_length * p_width * p_height * p_quantity);
  v_contract_price := v_cbm * p_price_per_meter;
  v_remaining := GREATEST(0, v_contract_price - p_amount_paid);
  v_payment_status := CASE WHEN v_remaining <= 0 THEN 'paid' WHEN p_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  -- إدراج الشحنة
  INSERT INTO shipments (user_id, container_id, client_id, client_name, client_code, recipient_name,
    goods_type, length, width, height, quantity, weight, cbm, price_per_meter,
    contract_price, amount_paid, remaining_amount, payment_status, tracking_number, notes,
    china_expenses, sea_freight, port_delivery_fees, customs_fees, internal_transport_fees)
  VALUES (p_user_id, p_container_id, p_client_id, p_client_name, p_client_code, p_recipient_name,
    p_goods_type, p_length, p_width, p_height, p_quantity, p_weight, v_cbm, p_price_per_meter,
    v_contract_price, p_amount_paid, v_remaining, v_payment_status::payment_status, p_tracking_number, p_notes,
    p_china_expenses, p_sea_freight, p_port_delivery_fees, p_customs_fees, p_internal_transport_fees)
  RETURNING id INTO v_shipment_id;

  -- تحديث الحاوية
  UPDATE containers SET
    used_capacity = used_capacity + v_cbm,
    total_revenue = total_revenue + v_contract_price,
    profit = (total_revenue + v_contract_price) - total_cost
  WHERE id = p_container_id;

  -- قيد محاسبي واحد: قيمة الشحنة (credit على العميل = عليه لنا)
  IF p_client_id IS NOT NULL AND v_contract_price > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, shipment_id, source_type, posting_batch_id,
      idempotency_key, notes, currency_code, exchange_rate)
    VALUES (p_user_id, 'out', 'client_collection', v_contract_price,
      'أجور شحن - ' || p_goods_type || ' - ' || v_cbm || ' CBM',
      CURRENT_DATE, p_client_id, v_shipment_id, 'shipment_invoice', v_batch_id,
      'shipment_invoice_' || v_shipment_id::text,
      'قيد تلقائي من إنشاء شحنة', 'USD', 1);
  END IF;

  RETURN v_shipment_id;
END;
$function$;

-- 3.2 دفعة شحنة - بدون Double Posting
CREATE OR REPLACE FUNCTION public.process_shipment_payment(
  p_user_id uuid, p_shipment_id uuid, p_amount numeric,
  p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment RECORD;
  v_new_paid NUMERIC;
  v_new_remaining NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  -- 1. إدراج الدفعة
  INSERT INTO shipment_payments (user_id, shipment_id, amount, fund_id, note)
  VALUES (p_user_id, p_shipment_id, p_amount, p_fund_id, p_note)
  RETURNING id INTO v_payment_id;

  -- 2. تحديث الشحنة
  v_new_paid := v_shipment.amount_paid + p_amount;
  v_new_remaining := GREATEST(0, v_shipment.contract_price - v_new_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE shipments SET
    amount_paid = v_new_paid,
    remaining_amount = v_new_remaining,
    payment_status = v_new_status::payment_status
  WHERE id = p_shipment_id;

  -- 3. تحديث رصيد الصندوق (تحصيل)
  IF p_fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_amount WHERE id = p_fund_id;
  END IF;

  -- 4. قيد محاسبي واحد فقط: الدفعة = تحصيل (debit على العميل = سدد جزء)
  -- هذا القيد يعكس جزئياً القيد الأصلي (shipment_invoice) لذلك الرصيد ينخفض
  INSERT INTO transactions (user_id, type, category, amount, description, date,
    fund_id, contact_id, shipment_id, source_type, reference_id, posting_batch_id,
    idempotency_key, notes, currency_code, exchange_rate)
  VALUES (p_user_id, 'in', 'client_collection', p_amount,
    'دفعة - ' || v_shipment.goods_type,
    CURRENT_DATE, p_fund_id, v_shipment.client_id, p_shipment_id,
    'shipment_payment', v_payment_id, v_batch_id,
    'shipment_payment_' || v_payment_id::text,
    COALESCE(p_note, 'دفعة شحن'), 'USD', 1);

  -- ملاحظة مهمة: لا نحدث contacts مباشرة!
  -- الأرصدة تُحسب من الـ View الموحدة v_contact_balance
END;
$function$;

-- 3.3 حذف شحنة مع عكس ذري بالـ ID
CREATE OR REPLACE FUNCTION public.delete_shipment_with_accounting(p_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment RECORD;
  v_payment RECORD;
BEGIN
  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  -- 1. عكس تأثير الحاوية
  UPDATE containers SET
    used_capacity = GREATEST(0, used_capacity - v_shipment.cbm),
    total_revenue = GREATEST(0, total_revenue - v_shipment.contract_price),
    profit = GREATEST(0, total_revenue - v_shipment.contract_price) - total_cost
  WHERE id = v_shipment.container_id;

  -- 2. عكس رصيد الصناديق من الدفعات
  FOR v_payment IN SELECT * FROM shipment_payments WHERE shipment_id = p_shipment_id LOOP
    IF v_payment.fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance - v_payment.amount WHERE id = v_payment.fund_id;
    END IF;
  END LOOP;

  -- 3. حذف كل القيود المحاسبية المرتبطة بهذه الشحنة عبر shipment_id (بدلاً من LIKE)
  DELETE FROM transactions WHERE shipment_id = p_shipment_id;

  -- 4. حذف الدفعات والشحنة
  DELETE FROM shipment_payments WHERE shipment_id = p_shipment_id;
  DELETE FROM shipments WHERE id = p_shipment_id;
END;
$function$;

-- 3.4 حذف حاوية مع كل شحناتها
CREATE OR REPLACE FUNCTION public.delete_container_with_shipments(p_container_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment RECORD;
BEGIN
  FOR v_shipment IN SELECT id FROM shipments WHERE container_id = p_container_id LOOP
    PERFORM delete_shipment_with_accounting(v_shipment.id);
  END LOOP;
  DELETE FROM containers WHERE id = p_container_id;
END;
$function$;

-- 3.5 تعديل شحنة مع محاسبة ذرية
CREATE OR REPLACE FUNCTION public.update_shipment_with_accounting(
  p_shipment_id uuid, p_client_name text DEFAULT NULL,
  p_goods_type text DEFAULT NULL, p_length numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL, p_height numeric DEFAULT NULL,
  p_quantity integer DEFAULT NULL, p_price_per_meter numeric DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL, p_tracking_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_new_length NUMERIC; v_new_width NUMERIC; v_new_height NUMERIC;
  v_new_quantity INTEGER; v_new_price_per_meter NUMERIC; v_new_amount_paid NUMERIC;
  v_new_cbm NUMERIC; v_new_contract_price NUMERIC; v_new_remaining NUMERIC;
  v_new_status TEXT;
  v_price_changed BOOLEAN;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_old FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  v_new_length := COALESCE(p_length, v_old.length);
  v_new_width := COALESCE(p_width, v_old.width);
  v_new_height := COALESCE(p_height, v_old.height);
  v_new_quantity := COALESCE(p_quantity, v_old.quantity);
  v_new_price_per_meter := COALESCE(p_price_per_meter, v_old.price_per_meter);
  v_new_amount_paid := COALESCE(p_amount_paid, v_old.amount_paid);
  v_new_cbm := v_new_length * v_new_width * v_new_height * v_new_quantity;
  v_new_contract_price := v_new_cbm * v_new_price_per_meter;
  v_new_remaining := GREATEST(0, v_new_contract_price - v_new_amount_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'paid' WHEN v_new_amount_paid > 0 THEN 'partial' ELSE 'unpaid' END;
  v_price_changed := v_new_contract_price != v_old.contract_price;

  -- تحديث الشحنة
  UPDATE shipments SET
    client_name = COALESCE(p_client_name, v_old.client_name),
    goods_type = COALESCE(p_goods_type, v_old.goods_type),
    length = v_new_length, width = v_new_width, height = v_new_height,
    quantity = v_new_quantity, cbm = v_new_cbm,
    price_per_meter = v_new_price_per_meter, contract_price = v_new_contract_price,
    amount_paid = v_new_amount_paid, remaining_amount = v_new_remaining,
    payment_status = v_new_status::payment_status,
    tracking_number = COALESCE(p_tracking_number, v_old.tracking_number),
    notes = COALESCE(p_notes, v_old.notes)
  WHERE id = p_shipment_id;

  -- تحديث الحاوية
  UPDATE containers SET
    used_capacity = GREATEST(0, used_capacity - v_old.cbm + v_new_cbm),
    total_revenue = GREATEST(0, total_revenue - v_old.contract_price + v_new_contract_price),
    profit = GREATEST(0, total_revenue - v_old.contract_price + v_new_contract_price) - total_cost
  WHERE id = v_old.container_id;

  -- إذا تغير السعر: حذف القيد القديم عبر ID وإنشاء جديد
  IF v_old.client_id IS NOT NULL AND v_price_changed THEN
    -- حذف قيد الفاتورة القديم عبر shipment_id + source_type (بدلاً من LIKE)
    DELETE FROM transactions
    WHERE shipment_id = p_shipment_id AND source_type = 'shipment_invoice';

    -- إنشاء قيد جديد
    IF v_new_contract_price > 0 THEN
      INSERT INTO transactions (user_id, type, category, amount, description, date,
        contact_id, shipment_id, source_type, posting_batch_id,
        idempotency_key, notes, currency_code, exchange_rate)
      VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_price,
        'أجور شحن - ' || COALESCE(p_goods_type, v_old.goods_type) || ' - ' || v_new_cbm || ' CBM',
        CURRENT_DATE, v_old.client_id, p_shipment_id, 'shipment_invoice', v_batch_id,
        'shipment_invoice_' || p_shipment_id::text,
        'قيد تلقائي من تعديل شحنة', 'USD', 1);
    END IF;
  END IF;
END;
$function$;

-- 3.6 إنشاء مشروع مع محاسبة
CREATE OR REPLACE FUNCTION public.create_project_with_accounting(
  p_user_id uuid, p_name text,
  p_client_id uuid DEFAULT NULL, p_vendor_id uuid DEFAULT NULL,
  p_contract_value numeric DEFAULT 0, p_expenses numeric DEFAULT 0,
  p_commission numeric DEFAULT 0, p_currency_difference numeric DEFAULT 0,
  p_status text DEFAULT 'active', p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_profit NUMERIC;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  v_profit := p_contract_value - p_expenses + p_commission + p_currency_difference;

  INSERT INTO projects (user_id, name, client_id, vendor_id, contract_value, expenses,
    received_amount, commission, currency_difference, profit, status, start_date, end_date, notes)
  VALUES (p_user_id, p_name, p_client_id, p_vendor_id, p_contract_value, p_expenses,
    0, p_commission, p_currency_difference, v_profit, p_status, p_start_date, p_end_date, p_notes)
  RETURNING id INTO v_project_id;

  -- قيد العميل: credit (عليه لنا)
  IF p_client_id IS NOT NULL AND p_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id,
      idempotency_key, notes)
    VALUES (p_user_id, 'out', 'client_collection', p_contract_value,
      'قيمة عقد مشروع: ' || p_name,
      CURRENT_DATE, p_client_id, v_project_id, 'project_client', v_batch_id,
      'project_client_' || v_project_id::text,
      'قيد تلقائي من المشروع');
  END IF;

  -- قيد المورد: debit (له عندنا)
  IF p_vendor_id IS NOT NULL AND p_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id,
      idempotency_key, notes)
    VALUES (p_user_id, 'in', 'vendor_payment', p_expenses,
      'تكلفة مشروع: ' || p_name,
      CURRENT_DATE, p_vendor_id, v_project_id, 'project_vendor', v_batch_id,
      'project_vendor_' || v_project_id::text,
      'قيد تلقائي من المشروع');
  END IF;

  RETURN v_project_id;
END;
$function$;

-- 3.7 تعديل مشروع مع محاسبة ذرية
CREATE OR REPLACE FUNCTION public.update_project_with_accounting(
  p_project_id uuid, p_name text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL, p_vendor_id uuid DEFAULT NULL,
  p_contract_value numeric DEFAULT NULL, p_expenses numeric DEFAULT NULL,
  p_commission numeric DEFAULT NULL, p_currency_difference numeric DEFAULT NULL,
  p_status text DEFAULT NULL, p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL, p_notes text DEFAULT NULL,
  p_received_amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_new_contract_value NUMERIC;
  v_new_expenses NUMERIC;
  v_new_commission NUMERIC;
  v_new_currency_difference NUMERIC;
  v_new_profit NUMERIC;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_old FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;

  v_new_contract_value := COALESCE(p_contract_value, v_old.contract_value);
  v_new_expenses := COALESCE(p_expenses, v_old.expenses);
  v_new_commission := COALESCE(p_commission, v_old.commission);
  v_new_currency_difference := COALESCE(p_currency_difference, v_old.currency_difference);
  v_new_profit := v_new_contract_value - v_new_expenses + v_new_commission + v_new_currency_difference;

  -- حذف القيود القديمة عبر project_id + source_type (بدلاً من LIKE)
  DELETE FROM transactions
  WHERE project_id = p_project_id AND source_type IN ('project_client', 'project_vendor');

  -- تحديث المشروع
  UPDATE projects SET
    name = COALESCE(p_name, v_old.name),
    client_id = p_client_id,
    vendor_id = p_vendor_id,
    contract_value = v_new_contract_value,
    expenses = v_new_expenses,
    received_amount = COALESCE(p_received_amount, v_old.received_amount),
    commission = v_new_commission,
    currency_difference = v_new_currency_difference,
    profit = v_new_profit,
    status = COALESCE(p_status, v_old.status),
    start_date = COALESCE(p_start_date, v_old.start_date),
    end_date = COALESCE(p_end_date, v_old.end_date),
    notes = COALESCE(p_notes, v_old.notes)
  WHERE id = p_project_id;

  -- إنشاء القيود الجديدة
  IF p_client_id IS NOT NULL AND v_new_contract_value > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id,
      idempotency_key, notes)
    VALUES (v_old.user_id, 'out', 'client_collection', v_new_contract_value,
      'قيمة عقد مشروع: ' || COALESCE(p_name, v_old.name),
      CURRENT_DATE, p_client_id, p_project_id, 'project_client', v_batch_id,
      'project_client_' || p_project_id::text,
      'قيد تلقائي من تعديل المشروع');
  END IF;

  IF p_vendor_id IS NOT NULL AND v_new_expenses > 0 THEN
    INSERT INTO transactions (user_id, type, category, amount, description, date,
      contact_id, project_id, source_type, posting_batch_id,
      idempotency_key, notes)
    VALUES (v_old.user_id, 'in', 'vendor_payment', v_new_expenses,
      'تكلفة مشروع: ' || COALESCE(p_name, v_old.name),
      CURRENT_DATE, p_vendor_id, p_project_id, 'project_vendor', v_batch_id,
      'project_vendor_' || p_project_id::text,
      'قيد تلقائي من تعديل المشروع');
  END IF;
END;
$function$;

-- 3.8 عكس عملية (reverse_transaction) - محدث
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  -- 1. عكس رصيد الصندوق
  IF v_tx.fund_id IS NOT NULL THEN
    IF v_tx.type = 'in' THEN
      UPDATE funds SET balance = balance - v_tx.amount WHERE id = v_tx.fund_id;
    ELSE
      UPDATE funds SET balance = balance + v_tx.amount WHERE id = v_tx.fund_id;
    END IF;
  END IF;

  -- 2. عكس تأثير المشروع
  IF v_tx.project_id IS NOT NULL THEN
    IF v_tx.type = 'out' THEN
      UPDATE projects SET
        expenses = GREATEST(0, expenses - v_tx.amount),
        profit = contract_value - GREATEST(0, expenses - v_tx.amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0)
      WHERE id = v_tx.project_id;
    ELSE
      UPDATE projects SET received_amount = GREATEST(0, received_amount - v_tx.amount)
      WHERE id = v_tx.project_id;
    END IF;
  END IF;

  -- 3. حذف العملية (الرصيد في contacts يُحسب من الـ View تلقائياً)
  DELETE FROM transactions WHERE id = p_transaction_id;
END;
$function$;

-- 3.9 process_transaction - محدث بدون تحديث contacts مباشرة
CREATE OR REPLACE FUNCTION public.process_transaction(
  p_user_id uuid, p_type text, p_category text, p_amount numeric,
  p_description text, p_date date,
  p_fund_id uuid DEFAULT NULL, p_contact_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL, p_notes text DEFAULT NULL,
  p_currency_code text DEFAULT 'USD', p_exchange_rate numeric DEFAULT 1,
  p_original_amount numeric DEFAULT NULL, p_to_fund_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id UUID;
BEGIN
  -- 1. إدراج العملية
  INSERT INTO transactions (user_id, type, category, amount, description, date,
    fund_id, contact_id, project_id, notes, currency_code, exchange_rate,
    source_type)
  VALUES (p_user_id, p_type::transaction_type, p_category, p_amount, p_description, p_date,
    p_fund_id, p_contact_id, p_project_id, p_notes, p_currency_code, p_exchange_rate,
    'manual')
  RETURNING id INTO v_tx_id;

  -- 2. تحديث رصيد الصندوق
  IF p_fund_id IS NOT NULL THEN
    IF p_type = 'in' THEN
      UPDATE funds SET balance = balance + p_amount WHERE id = p_fund_id;
    ELSE
      UPDATE funds SET balance = balance - p_amount WHERE id = p_fund_id;
    END IF;
  END IF;

  -- 3. تحويل بين صناديق
  IF p_category = 'fund_transfer' AND p_to_fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_amount WHERE id = p_to_fund_id;
  END IF;

  -- 4. تحديث المشروع
  IF p_project_id IS NOT NULL THEN
    IF p_type = 'out' THEN
      UPDATE projects SET
        expenses = expenses + p_amount,
        profit = contract_value - (expenses + p_amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0)
      WHERE id = p_project_id;
    ELSE
      UPDATE projects SET received_amount = received_amount + p_amount
      WHERE id = p_project_id;
    END IF;
  END IF;

  -- ملاحظة: لا نحدث contacts مباشرة - الأرصدة من الـ View
  RETURN v_tx_id;
END;
$function$;

-- 3.10 تحديث get_financial_summary ليعتمد على الدفتر الموحد
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
  v_total_liquidity NUMERIC;
  v_total_in NUMERIC;
  v_total_out NUMERIC;
  v_total_expenses NUMERIC;
  v_total_receivables NUMERIC;
  v_total_payables NUMERIC;
  v_shipping_receivables NUMERIC;
BEGIN
  -- 1. السيولة = مجموع أرصدة الصناديق
  SELECT COALESCE(SUM(balance), 0) INTO v_total_liquidity FROM funds WHERE user_id = p_user_id;

  -- 2. الإيرادات والمصروفات من الدفتر الموحد
  SELECT
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_total_in, v_total_out, v_total_expenses
  FROM transactions
  WHERE user_id = p_user_id AND category != 'fund_transfer';

  -- 3. المستحقات والالتزامات من الديون
  SELECT
    COALESCE(SUM(CASE WHEN type = 'receivable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'payable' AND status != 'paid' THEN remaining_amount ELSE 0 END), 0)
  INTO v_total_receivables, v_total_payables
  FROM debts WHERE user_id = p_user_id;

  -- 4. مستحقات الشحن من الـ View
  SELECT COALESCE(SUM(remaining), 0) INTO v_shipping_receivables
  FROM v_invoice_balance WHERE user_id = p_user_id AND calc_status != 'paid';

  v_result := json_build_object(
    'totalLiquidity', v_total_liquidity,
    'netCompanyProfit', v_total_in - v_total_out,
    'totalExpenses', v_total_expenses,
    'totalReceivables', v_total_receivables + v_shipping_receivables,
    'totalPayables', v_total_payables,
    'totalIncome', v_total_in,
    'totalOutcome', v_total_out,
    'shippingReceivables', v_shipping_receivables
  );

  RETURN v_result;
END;
$function$;

-- ============================================================
-- المرحلة 4: دالة مزامنة أرصدة contacts من الدفتر
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_contact_balances(p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE contacts c SET
    total_debit = COALESCE(v.total_debit, 0),
    total_credit = COALESCE(v.total_credit, 0),
    balance = COALESCE(v.balance, 0),
    total_transactions = COALESCE(v.total_transactions, 0)
  FROM v_contact_balance v
  WHERE c.id = v.contact_id
    AND (p_user_id IS NULL OR c.user_id = p_user_id);

  -- تصفير الحسابات التي ليس لها قيود
  UPDATE contacts SET
    total_debit = 0, total_credit = 0, balance = 0, total_transactions = 0
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND id NOT IN (SELECT contact_id FROM v_contact_balance WHERE contact_id IS NOT NULL);
END;
$function$;
