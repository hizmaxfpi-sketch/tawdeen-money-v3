CREATE POLICY "Platform admins can delete companies"
ON public.companies
FOR DELETE
TO authenticated
USING (is_platform_admin());