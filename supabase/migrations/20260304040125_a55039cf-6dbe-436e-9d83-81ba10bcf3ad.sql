
-- Fix Security Definer Views → SECURITY INVOKER
ALTER VIEW public.v_account_ledger SET (security_invoker = on);
ALTER VIEW public.v_contact_balance SET (security_invoker = on);
ALTER VIEW public.v_invoice_balance SET (security_invoker = on);
