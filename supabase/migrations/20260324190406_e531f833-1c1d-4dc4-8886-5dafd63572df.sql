
-- Add 'owner' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

-- Add is_active column to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
