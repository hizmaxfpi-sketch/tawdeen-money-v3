-- إضافة حقول جديدة لجدول الحاويات
ALTER TABLE public.containers
ADD COLUMN IF NOT EXISTS origin_country text DEFAULT 'الصين',
ADD COLUMN IF NOT EXISTS destination_country text DEFAULT 'السعودية',
ADD COLUMN IF NOT EXISTS rental_date date,
ADD COLUMN IF NOT EXISTS rental_days integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS loading_days integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS occupied_volume numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS occupied_area numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS container_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS glass_fees numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_per_meter numeric DEFAULT 0;

-- إضافة حقول جديدة لجدول الشحنات
ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS client_code text,
ADD COLUMN IF NOT EXISTS recipient_name text,
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS china_expenses numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS sea_freight numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS port_delivery_fees numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS customs_fees numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS internal_transport_fees numeric DEFAULT 0;