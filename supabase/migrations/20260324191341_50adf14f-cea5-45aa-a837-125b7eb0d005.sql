
-- CONTACTS
DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can update own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;
CREATE POLICY "Company view contacts" ON public.contacts FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert contacts" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update contacts" ON public.contacts FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete contacts" ON public.contacts FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- FUNDS
DROP POLICY IF EXISTS "Users can view own funds" ON public.funds;
DROP POLICY IF EXISTS "Users can insert own funds" ON public.funds;
DROP POLICY IF EXISTS "Users can update own funds" ON public.funds;
DROP POLICY IF EXISTS "Users can delete own funds" ON public.funds;
CREATE POLICY "Company view funds" ON public.funds FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert funds" ON public.funds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update funds" ON public.funds FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete funds" ON public.funds FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- TRANSACTIONS
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;
CREATE POLICY "Company view transactions" ON public.transactions FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update transactions" ON public.transactions FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete transactions" ON public.transactions FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- PROJECTS
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Company view projects" ON public.projects FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update projects" ON public.projects FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete projects" ON public.projects FOR DELETE USING (user_id IN (SELECT company_user_ids()));

-- CONTAINERS
DROP POLICY IF EXISTS "Users can view own containers" ON public.containers;
DROP POLICY IF EXISTS "Users can insert own containers" ON public.containers;
DROP POLICY IF EXISTS "Users can update own containers" ON public.containers;
DROP POLICY IF EXISTS "Users can delete own containers" ON public.containers;
CREATE POLICY "Company view containers" ON public.containers FOR SELECT USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company insert containers" ON public.containers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Company update containers" ON public.containers FOR UPDATE USING (user_id IN (SELECT company_user_ids()));
CREATE POLICY "Company delete containers" ON public.containers FOR DELETE USING (user_id IN (SELECT company_user_ids()));
