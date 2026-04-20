
-- 1) دالة إعادة احتساب رصيد صندوق واحد من القيود الفعلية
CREATE OR REPLACE FUNCTION public.recalculate_fund_balance(p_fund_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric := 0;
BEGIN
  IF p_fund_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'in' THEN amount
      WHEN type = 'out' THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_balance
  FROM public.transactions
  WHERE fund_id = p_fund_id;

  UPDATE public.funds
  SET balance = v_balance,
      updated_at = now()
  WHERE id = p_fund_id;
END;
$$;

-- 2) دالة إعادة احتساب كل الصناديق (للإصلاح الشامل)
CREATE OR REPLACE FUNCTION public.recalculate_all_fund_balances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  cnt integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.funds LOOP
    PERFORM public.recalculate_fund_balance(r.id);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

-- 3) دالة مشغّل (Trigger) لمزامنة الأرصدة تلقائياً عند أي تغيير في العمليات
CREATE OR REPLACE FUNCTION public.trg_sync_fund_balance_on_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fund_id IS NOT NULL THEN
      PERFORM public.recalculate_fund_balance(NEW.fund_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.fund_id IS DISTINCT FROM OLD.fund_id THEN
      IF OLD.fund_id IS NOT NULL THEN
        PERFORM public.recalculate_fund_balance(OLD.fund_id);
      END IF;
      IF NEW.fund_id IS NOT NULL THEN
        PERFORM public.recalculate_fund_balance(NEW.fund_id);
      END IF;
    ELSIF NEW.fund_id IS NOT NULL THEN
      PERFORM public.recalculate_fund_balance(NEW.fund_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.fund_id IS NOT NULL THEN
      PERFORM public.recalculate_fund_balance(OLD.fund_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 4) ربط المشغّل بجدول العمليات
DROP TRIGGER IF EXISTS trg_sync_fund_balances_from_transactions ON public.transactions;
CREATE TRIGGER trg_sync_fund_balances_from_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_fund_balance_on_tx();

-- 5) إعادة تسوية فورية لكل أرصدة الصناديق في النظام
SELECT public.recalculate_all_fund_balances();
