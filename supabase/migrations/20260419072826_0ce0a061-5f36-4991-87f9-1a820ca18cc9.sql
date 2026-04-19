-- Add unit fields to production_services for time/quantity-based pricing
ALTER TABLE public.production_services
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS custom_unit text;

COMMENT ON COLUMN public.production_services.unit_type IS 'piece | hour | day | meter | custom';
COMMENT ON COLUMN public.production_services.custom_unit IS 'Used when unit_type = custom';