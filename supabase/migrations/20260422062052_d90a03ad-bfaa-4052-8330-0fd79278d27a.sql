
-- فهارس مركّبة على الجداول الحيوية لتسريع الاستعلامات والترتيب
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_fund ON public.transactions(fund_id) WHERE fund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON public.transactions(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_project ON public.transactions(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_shipment ON public.transactions(shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_source_type ON public.transactions(source_type) WHERE source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created ON public.activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_funds_user ON public.funds(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_user ON public.debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON public.debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(user_id, status);

CREATE INDEX IF NOT EXISTS idx_containers_user ON public.containers(user_id);
CREATE INDEX IF NOT EXISTS idx_containers_status ON public.containers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_container ON public.shipments(container_id);
CREATE INDEX IF NOT EXISTS idx_shipments_user ON public.shipments(user_id);
CREATE INDEX IF NOT EXISTS idx_shipment_payments_shipment ON public.shipment_payments(shipment_id);
CREATE INDEX IF NOT EXISTS idx_container_expenses_container ON public.container_expenses(container_id);

CREATE INDEX IF NOT EXISTS idx_assets_user ON public.assets(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_payments_asset ON public.asset_payments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_payments_status ON public.asset_payments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_obligation_drafts_user_status ON public.obligation_drafts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_obligation_drafts_obligation ON public.obligation_drafts(obligation_id);
CREATE INDEX IF NOT EXISTS idx_obligation_items_obligation ON public.obligation_items(obligation_id);
CREATE INDEX IF NOT EXISTS idx_obligation_draft_items_draft ON public.obligation_draft_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_recurring_obligations_user_active ON public.recurring_obligations(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_production_sales_user_date ON public.production_sales(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_production_sales_product ON public.production_sales(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_purchases_user_date ON public.material_purchases(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_material_purchases_material ON public.material_purchases(material_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_user_date ON public.production_runs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_product_bom_product ON public.product_bom(product_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON public.user_roles(user_id, is_active);
