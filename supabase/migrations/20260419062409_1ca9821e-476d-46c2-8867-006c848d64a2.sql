
-- ============================================
-- 1) عكس عملية بيع منتج (حذف كامل لأثرها)
-- ============================================
CREATE OR REPLACE FUNCTION public.reverse_production_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_sale FROM production_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT verify_company_access(v_sale.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- إعادة كمية المنتج للمخزون
  UPDATE production_products
  SET quantity = quantity + v_sale.quantity
  WHERE id = v_sale.product_id;

  -- إعادة المبلغ المحصّل إلى الصندوق (نقيض ما حدث عند البيع)
  IF v_sale.paid_amount > 0 AND v_sale.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - v_sale.paid_amount WHERE id = v_sale.fund_id;
  END IF;

  -- حذف كل القيود المحاسبية المرتبطة بهذه البيعة (الفاتورة + التحصيل)
  DELETE FROM transactions
  WHERE idempotency_key IN ('psl_' || p_sale_id::text, 'pslp_' || p_sale_id::text);

  -- حذف سجل البيع
  DELETE FROM production_sales WHERE id = p_sale_id;

  PERFORM sync_contact_balances();
END;
$$;

-- ============================================
-- 2) تعديل عملية بيع منتج (عكس + إعادة إنشاء بقيم جديدة)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_production_sale(
  p_sale_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_contact_id uuid DEFAULT NULL,
  p_fund_id uuid DEFAULT NULL,
  p_paid_amount numeric DEFAULT 0,
  p_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_old RECORD;
  v_product RECORD;
  v_total NUMERIC;
  v_cost NUMERIC;
  v_profit NUMERIC;
  v_tx_id UUID;
  v_batch UUID := gen_random_uuid();
  v_new_date DATE;
  v_available NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF p_unit_price < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;

  SELECT * INTO v_old FROM production_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT verify_company_access(v_old.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = v_old.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- التحقق من توفر مخزون كافٍ بعد إرجاع الكمية القديمة
  v_available := v_product.quantity + v_old.quantity;
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'مخزون المنتج غير كافٍ (المتاح: %, المطلوب: %)', v_available, p_quantity;
  END IF;

  v_new_date := COALESCE(p_date, v_old.date);

  -- 1) إرجاع كمية البيع القديمة للمنتج
  UPDATE production_products SET quantity = quantity + v_old.quantity WHERE id = v_old.product_id;

  -- 2) عكس المبلغ المحصّل القديم
  IF v_old.paid_amount > 0 AND v_old.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance - v_old.paid_amount WHERE id = v_old.fund_id;
  END IF;

  -- 3) حذف القيود القديمة
  DELETE FROM transactions
  WHERE idempotency_key IN ('psl_' || p_sale_id::text, 'pslp_' || p_sale_id::text);

  -- 4) تطبيق القيم الجديدة
  v_total := p_quantity * p_unit_price;
  v_cost := p_quantity * v_product.unit_cost;
  v_profit := v_total - v_cost;

  -- خصم المخزون بالكمية الجديدة
  UPDATE production_products SET quantity = quantity - p_quantity WHERE id = v_old.product_id;

  -- تحديث سجل البيع
  UPDATE production_sales
  SET quantity = p_quantity,
      unit_price = p_unit_price,
      total_amount = v_total,
      cost_at_sale = v_cost,
      profit = v_profit,
      paid_amount = p_paid_amount,
      contact_id = p_contact_id,
      fund_id = p_fund_id,
      date = v_new_date,
      notes = COALESCE(p_notes, v_old.notes),
      transaction_id = NULL
  WHERE id = p_sale_id;

  -- إعادة إنشاء قيد فاتورة العميل
  IF p_contact_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO transactions (
      user_id, type, category, amount, description, date,
      contact_id, source_type, posting_batch_id, idempotency_key, notes
    ) VALUES (
      v_user_id, 'out', 'client_collection', v_total,
      'بيع منتج: ' || v_product.name || ' (' || p_quantity || ' ' || v_product.unit || ')',
      v_new_date, p_contact_id, 'production_sale', v_batch,
      'psl_' || p_sale_id::text, 'قيد محدّث - بيع منتج'
    ) RETURNING id INTO v_tx_id;
    UPDATE production_sales SET transaction_id = v_tx_id WHERE id = p_sale_id;
  END IF;

  -- إعادة إنشاء قيد التحصيل + إضافة للصندوق
  IF p_paid_amount > 0 AND p_fund_id IS NOT NULL AND p_contact_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + p_paid_amount WHERE id = p_fund_id;
    INSERT INTO transactions (
      user_id, type, category, amount, description, date,
      contact_id, fund_id, source_type, posting_batch_id, idempotency_key, notes
    ) VALUES (
      v_user_id, 'in', 'client_collection', p_paid_amount,
      'تحصيل بيع منتج - ' || v_product.name,
      v_new_date, p_contact_id, p_fund_id, 'production_sale_payment', v_batch,
      'pslp_' || p_sale_id::text, 'دفعة محدّثة'
    );
  END IF;

  PERFORM sync_contact_balances();
END;
$$;

-- ============================================
-- 3) عكس عملية إنتاج (إرجاع المواد + خصم المنتج)
-- ============================================
CREATE OR REPLACE FUNCTION public.reverse_production_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
  v_product RECORD;
  v_bom RECORD;
  v_returned NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_run FROM production_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF NOT verify_company_access(v_run.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT * INTO v_product FROM production_products WHERE id = v_run.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- التأكد أن المنتج لم يُبَع بالكامل (يجب أن يكون المخزون ≥ كمية الإنتاج المراد عكسها)
  IF v_product.quantity < v_run.quantity THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الإنتاج: تم بيع جزء منه. المتبقي بالمخزون: %, المطلوب إرجاعه: %', v_product.quantity, v_run.quantity;
  END IF;

  -- إرجاع المواد الخام إلى مخزونها
  FOR v_bom IN SELECT * FROM product_bom WHERE product_id = v_run.product_id LOOP
    v_returned := v_bom.qty_per_unit * v_run.quantity;
    UPDATE production_materials
    SET quantity = quantity + v_returned
    WHERE id = v_bom.material_id;
  END LOOP;

  -- خصم الكمية من المنتج
  UPDATE production_products
  SET quantity = quantity - v_run.quantity
  WHERE id = v_run.product_id;

  -- حذف سجل الإنتاج
  DELETE FROM production_runs WHERE id = p_run_id;
END;
$$;

-- ============================================
-- 4) عكس شراء مواد (إرجاع المخزون + إعادة المبالغ)
-- ============================================
CREATE OR REPLACE FUNCTION public.reverse_material_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase RECORD;
  v_material RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_purchase FROM material_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF NOT verify_company_access(v_purchase.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT * INTO v_material FROM production_materials WHERE id = v_purchase.material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;

  IF v_material.quantity < v_purchase.quantity THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الشراء: تم استهلاك بعض الكمية في الإنتاج';
  END IF;

  -- خصم الكمية من المادة
  UPDATE production_materials
  SET quantity = quantity - v_purchase.quantity
  WHERE id = v_purchase.material_id;

  -- إرجاع المبلغ المدفوع إلى الصندوق
  IF v_purchase.paid_amount > 0 AND v_purchase.fund_id IS NOT NULL THEN
    UPDATE funds SET balance = balance + v_purchase.paid_amount WHERE id = v_purchase.fund_id;
  END IF;

  -- حذف القيود المحاسبية
  DELETE FROM transactions
  WHERE idempotency_key IN ('mp_' || p_purchase_id::text, 'mpp_' || p_purchase_id::text);

  -- حذف سجل الشراء
  DELETE FROM material_purchases WHERE id = p_purchase_id;

  PERFORM sync_contact_balances();
END;
$$;
