
-- إضافة حقول جديدة للشحنات: تكلفة شحن داخلي، تكلفة ترانزيت، رقم الباكج
ALTER TABLE public.shipments 
  ADD COLUMN IF NOT EXISTS domestic_shipping_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transit_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_number text DEFAULT NULL;

-- إنشاء تسلسل لرقم الباكج
CREATE SEQUENCE IF NOT EXISTS shipment_package_seq START WITH 1 INCREMENT BY 1;
