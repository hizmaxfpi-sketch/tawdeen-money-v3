
-- Add missing users to user_roles
INSERT INTO user_roles (user_id, role, is_active, company_id)
VALUES 
  ('2a3d5fbb-6cca-41b8-93a5-bba2b953c356', 'viewer', true, 'e0edfb46-1c5d-4121-b469-5de7318df02e'),
  ('11f435b1-ae43-410f-a36f-e9bed66e4ad5', 'viewer', true, 'e0edfb46-1c5d-4121-b469-5de7318df02e'),
  ('cb54bc71-4692-47c8-86da-46b6c524fa6e', 'viewer', true, 'e0edfb46-1c5d-4121-b469-5de7318df02e'),
  ('0afba91b-b4a5-4c86-8d6a-c3702b3cbdd2', 'viewer', true, 'e0edfb46-1c5d-4121-b469-5de7318df02e')
ON CONFLICT DO NOTHING;

-- Also add missing profiles
INSERT INTO profiles (user_id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE p.id IS NULL
ON CONFLICT DO NOTHING;
