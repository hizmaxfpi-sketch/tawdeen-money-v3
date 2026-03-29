
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

  -- Delete all transactions linked to this project
  DELETE FROM transactions WHERE project_id = p_project_id AND user_id = v_user_id;

  -- Delete all debts linked to this project
  DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE project_id = p_project_id AND user_id = v_user_id);
  DELETE FROM debts WHERE project_id = p_project_id AND user_id = v_user_id;

  -- Delete the project
  DELETE FROM projects WHERE id = p_project_id AND user_id = v_user_id;

  -- Sync contact balances to reflect removed transactions
  PERFORM sync_contact_balances();
END;
$function$;
