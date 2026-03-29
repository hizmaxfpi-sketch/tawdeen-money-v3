CREATE OR REPLACE FUNCTION public.delete_project_with_accounting(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT user_id INTO v_owner_id FROM projects WHERE id = p_project_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_owner_id != v_user_id THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Remove all financial traces linked to this project
  DELETE FROM debt_payments
  WHERE debt_id IN (
    SELECT id FROM debts
    WHERE project_id = p_project_id
      AND user_id = v_user_id
  );

  DELETE FROM debts
  WHERE project_id = p_project_id
    AND user_id = v_user_id;

  DELETE FROM transactions
  WHERE project_id = p_project_id
    AND user_id = v_user_id;

  DELETE FROM projects
  WHERE id = p_project_id
    AND user_id = v_user_id;

  -- Recompute all contact balances after deletion
  PERFORM sync_contact_balances();
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_shipment_with_accounting(p_shipment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_shipment RECORD;
  v_payment RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF v_shipment.user_id != v_user_id THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE containers SET
    used_capacity = GREATEST(0, used_capacity - v_shipment.cbm),
    total_revenue = GREATEST(0, total_revenue - v_shipment.contract_price),
    profit = GREATEST(0, total_revenue - v_shipment.contract_price) - total_cost
  WHERE id = v_shipment.container_id AND user_id = v_user_id;

  FOR v_payment IN SELECT * FROM shipment_payments WHERE shipment_id = p_shipment_id LOOP
    IF v_payment.fund_id IS NOT NULL THEN
      UPDATE funds SET balance = balance - v_payment.amount WHERE id = v_payment.fund_id AND user_id = v_user_id;
    END IF;
  END LOOP;

  DELETE FROM transactions WHERE shipment_id = p_shipment_id AND user_id = v_user_id;
  DELETE FROM shipment_payments WHERE shipment_id = p_shipment_id AND user_id = v_user_id;
  DELETE FROM shipments WHERE id = p_shipment_id AND user_id = v_user_id;

  -- Keep ledger/contact balances consistent after removing shipment entries
  PERFORM sync_contact_balances();
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_container_with_shipments(p_container_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_shipment RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT user_id INTO v_owner_id FROM containers WHERE id = p_container_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Container not found'; END IF;
  IF v_owner_id != v_user_id THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Remove all nested shipment records and their accounting traces
  FOR v_shipment IN
    SELECT id FROM shipments
    WHERE container_id = p_container_id
      AND user_id = v_user_id
  LOOP
    PERFORM delete_shipment_with_accounting(v_shipment.id);
  END LOOP;

  -- Remove container-level vendor posting created on container creation
  DELETE FROM transactions
  WHERE user_id = v_user_id
    AND idempotency_key = ('ci_' || p_container_id::text);

  -- Finally delete container itself
  DELETE FROM containers
  WHERE id = p_container_id
    AND user_id = v_user_id;

  -- Recompute balances after full cascade delete
  PERFORM sync_contact_balances();
END;
$function$;