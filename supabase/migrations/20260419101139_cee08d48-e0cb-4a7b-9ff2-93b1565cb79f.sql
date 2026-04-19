-- إصلاح حذف قيود شراء المواد الخام:
-- عند حذف القيد من سجل العمليات، يجب أن يستدعي reverse_material_purchase لمحو الأثر بالكامل
-- (المخزون + المتوسط + رصيد المورّد + الصندوق + كل القيود المرتبطة + الفاتورة الأصلية)

CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_user_id UUID; 
  v_tx RECORD;
  v_purchase_id UUID;
  v_sale_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT verify_company_access(v_tx.user_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- تحويل: إذا كان القيد ناتج عن شراء مواد خام، استدعِ الدالة المتخصصة لمحو الأثر بالكامل
  IF v_tx.source_type IN ('production_purchase','production_purchase_payment') 
     AND v_tx.idempotency_key IS NOT NULL THEN
    -- استخراج معرّف الفاتورة من idempotency_key (pmp_<uuid> أو pmpp_<uuid>)
    BEGIN
      v_purchase_id := substring(v_tx.idempotency_key from '[0-9a-f-]{36}')::uuid;
    EXCEPTION WHEN OTHERS THEN v_purchase_id := NULL;
    END;
    IF v_purchase_id IS NULL THEN
      SELECT id INTO v_purchase_id FROM material_purchases WHERE transaction_id = p_transaction_id LIMIT 1;
    END IF;
    IF v_purchase_id IS NOT NULL AND EXISTS (SELECT 1 FROM material_purchases WHERE id = v_purchase_id) THEN
      PERFORM reverse_material_purchase(v_purchase_id);
      RETURN;
    END IF;
  END IF;

  -- تحويل: إذا كان القيد ناتج عن بيع إنتاج، استدعِ الدالة المتخصصة
  IF v_tx.source_type IN ('production_sale','production_sale_payment','production_cogs','production_sale_expense') 
     AND v_tx.idempotency_key IS NOT NULL THEN
    BEGIN
      v_sale_id := substring(v_tx.idempotency_key from '[0-9a-f-]{36}')::uuid;
    EXCEPTION WHEN OTHERS THEN v_sale_id := NULL;
    END;
    IF v_sale_id IS NULL THEN
      SELECT id INTO v_sale_id FROM production_sales WHERE transaction_id = p_transaction_id LIMIT 1;
    END IF;
    IF v_sale_id IS NOT NULL AND EXISTS (SELECT 1 FROM production_sales WHERE id = v_sale_id) THEN
      PERFORM reverse_production_sale(v_sale_id);
      RETURN;
    END IF;
  END IF;

  -- المنطق الافتراضي للقيود اليدوية
  IF v_tx.fund_id IS NOT NULL THEN
    IF v_tx.type = 'in' THEN UPDATE funds SET balance = balance - v_tx.amount WHERE id = v_tx.fund_id;
    ELSE UPDATE funds SET balance = balance + v_tx.amount WHERE id = v_tx.fund_id; END IF;
  END IF;
  IF v_tx.project_id IS NOT NULL THEN
    IF v_tx.type = 'out' THEN
      UPDATE projects SET expenses = GREATEST(0, expenses - v_tx.amount), 
        profit = contract_value - GREATEST(0, expenses - v_tx.amount) + COALESCE(commission, 0) + COALESCE(currency_difference, 0) 
        WHERE id = v_tx.project_id;
    ELSE UPDATE projects SET received_amount = GREATEST(0, received_amount - v_tx.amount) WHERE id = v_tx.project_id; END IF;
  END IF;
  DELETE FROM transactions WHERE id = p_transaction_id;
  PERFORM sync_contact_balances();
END;
$function$;