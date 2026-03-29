-- إضافة حقول جديدة لجدول المشاريع
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS commission numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency_difference numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_date date;

-- تحديث حقل الحالة ليشمل القيم المطلوبة
COMMENT ON COLUMN public.projects.status IS 'active (قيد التنفيذ), completed (منجز), paused (متوقف), cancelled (ملغي)';

-- إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_vendor_id ON public.projects(vendor_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);