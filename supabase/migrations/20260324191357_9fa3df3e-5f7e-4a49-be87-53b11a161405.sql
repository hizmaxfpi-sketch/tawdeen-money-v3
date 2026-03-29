
-- SHIPMENTS
DROP POLICY IF EXISTS "Users can view own shipments" ON public.shipments;
DROP POLICY IF EXISTS "Users can insert own shipments" ON public.shipments;
DROP POLICY IF EXISTS "Users can update own shipments" ON public.shipments;
DROP POLICY IF EXISTS "Users can delete own shipments" ON public.shipments;
CREATE POLICY "Company view shipments" ON public.shipments FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert shipments" ON public.shipments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update shipments" ON public.shipments FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete shipments" ON public.shipments FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- SHIPMENT_PAYMENTS
DROP POLICY IF EXISTS "Users can view own payments" ON public.shipment_payments;
DROP POLICY IF EXISTS "Users can insert own payments" ON public.shipment_payments;
CREATE POLICY "Company view shipment_payments" ON public.shipment_payments FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert shipment_payments" ON public.shipment_payments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DEBTS
DROP POLICY IF EXISTS "Users can view own debts" ON public.debts;
DROP POLICY IF EXISTS "Users can insert own debts" ON public.debts;
DROP POLICY IF EXISTS "Users can update own debts" ON public.debts;
DROP POLICY IF EXISTS "Users can delete own debts" ON public.debts;
CREATE POLICY "Company view debts" ON public.debts FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert debts" ON public.debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update debts" ON public.debts FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete debts" ON public.debts FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- DEBT_PAYMENTS
DROP POLICY IF EXISTS "Users can view own debt payments" ON public.debt_payments;
DROP POLICY IF EXISTS "Users can insert own debt payments" ON public.debt_payments;
CREATE POLICY "Company view debt_payments" ON public.debt_payments FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert debt_payments" ON public.debt_payments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- CURRENCIES
DROP POLICY IF EXISTS "Users can view own currencies" ON public.currencies;
DROP POLICY IF EXISTS "Users can insert own currencies" ON public.currencies;
DROP POLICY IF EXISTS "Users can update own currencies" ON public.currencies;
DROP POLICY IF EXISTS "Users can delete own currencies" ON public.currencies;
CREATE POLICY "Company view currencies" ON public.currencies FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert currencies" ON public.currencies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update currencies" ON public.currencies FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete currencies" ON public.currencies FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- COMPANY_SETTINGS
DROP POLICY IF EXISTS "Users can view own settings" ON public.company_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.company_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.company_settings;
CREATE POLICY "Company view settings" ON public.company_settings FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert settings" ON public.company_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update settings" ON public.company_settings FOR UPDATE USING (user_id IN (SELECT company_user_ids()));

-- LEDGER_ACCOUNTS
DROP POLICY IF EXISTS "Users can view own accounts" ON public.ledger_accounts;
DROP POLICY IF EXISTS "Users can insert own accounts" ON public.ledger_accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON public.ledger_accounts;
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.ledger_accounts;
CREATE POLICY "Company view ledger_accounts" ON public.ledger_accounts FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert ledger_accounts" ON public.ledger_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update ledger_accounts" ON public.ledger_accounts FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete ledger_accounts" ON public.ledger_accounts FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- ACTIVITY_LOG
DROP POLICY IF EXISTS "Users can view own activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Users can insert own activity logs" ON public.activity_log;
CREATE POLICY "Company view activity_log" ON public.activity_log FOR SELECT TO authenticated USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert activity_log" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
