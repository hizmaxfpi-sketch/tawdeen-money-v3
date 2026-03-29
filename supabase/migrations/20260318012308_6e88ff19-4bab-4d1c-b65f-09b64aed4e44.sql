
-- Create storage bucket for document attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for attachments bucket
CREATE POLICY "Users can upload own attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public can view attachments"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'attachments');

-- Add attachments column to tables that don't have it
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS attachments text[] DEFAULT NULL;
ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS attachments text[] DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS attachments text[] DEFAULT NULL;
