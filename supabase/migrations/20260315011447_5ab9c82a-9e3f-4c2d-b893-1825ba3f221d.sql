
-- Create activity_log table for persistent audit trail
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'transaction_created', 'transaction_modified', 'transaction_deleted', 'account_deleted', 'fund_deleted'
  entity_type TEXT NOT NULL, -- 'transaction', 'account', 'fund'
  entity_id TEXT, -- original entity ID
  entity_name TEXT, -- name/description for display
  details JSONB DEFAULT '{}'::jsonb, -- store amount, type, category etc.
  status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'deleted'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own activity logs" ON public.activity_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity logs" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
