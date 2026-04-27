
-- Optimization Indexes for Financial Consistency and Performance

-- Transactions: Fundamental for Snapshot and Ledger
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fund_id ON public.transactions(fund_id) WHERE fund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_contact_id ON public.transactions(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON public.transactions(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_source_type ON public.transactions(source_type);
CREATE INDEX IF NOT EXISTS idx_transactions_shipment_id ON public.transactions(shipment_id) WHERE shipment_id IS NOT NULL;

-- Shipments: Filtering and sorting
CREATE INDEX IF NOT EXISTS idx_shipments_container_id ON public.shipments(container_id);
CREATE INDEX IF NOT EXISTS idx_shipments_payment_status ON public.shipments(payment_status);
CREATE INDEX IF NOT EXISTS idx_shipments_client_id ON public.shipments(client_id) WHERE client_id IS NOT NULL;

-- Production: Snapshot performance
CREATE INDEX IF NOT EXISTS idx_production_sales_user_id ON public.production_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_production_materials_user_id ON public.production_materials(user_id);
CREATE INDEX IF NOT EXISTS idx_production_products_user_id ON public.production_products(user_id);
