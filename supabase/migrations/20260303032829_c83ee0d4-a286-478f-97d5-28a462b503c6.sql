-- سياسة وصول عامة لتتبع الشحنات بدون تسجيل دخول (قراءة فقط عبر رقم الباكج)
CREATE POLICY "Public can read shipments by package_number"
ON public.shipments
FOR SELECT
TO anon
USING (package_number IS NOT NULL);

-- سماح للزائر بقراءة حالة الحاوية المرتبطة
CREATE POLICY "Public can read containers for tracking"
ON public.containers
FOR SELECT
TO anon
USING (true);
