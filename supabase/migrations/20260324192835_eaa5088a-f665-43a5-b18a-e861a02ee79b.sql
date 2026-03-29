
-- Seed existing users into companies and user_roles
DO $$
DECLARE
  v_company_id uuid;
  v_owner_id uuid := '68005ffa-2a61-40c3-ba5b-11160db33d54'; -- First user (Khaled)
  r RECORD;
BEGIN
  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM companies LIMIT 1) THEN
    RETURN;
  END IF;

  -- Create company for the first user
  INSERT INTO companies (owner_user_id, name)
  VALUES (v_owner_id, 'شركتي')
  RETURNING id INTO v_company_id;

  -- Assign owner role to first user
  INSERT INTO user_roles (user_id, role, is_active, company_id)
  VALUES (v_owner_id, 'owner', true, v_company_id)
  ON CONFLICT DO NOTHING;

  -- Assign all other existing users as viewers in the same company
  FOR r IN SELECT user_id FROM profiles WHERE user_id != v_owner_id LOOP
    INSERT INTO user_roles (user_id, role, is_active, company_id)
    VALUES (r.user_id, 'viewer', true, v_company_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
