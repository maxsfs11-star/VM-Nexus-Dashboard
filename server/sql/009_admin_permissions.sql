ALTER TABLE nexus_admin_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';

ALTER TABLE nexus_admin_users
  DROP CONSTRAINT IF EXISTS nexus_admin_users_role_check;

ALTER TABLE nexus_admin_users
  ADD CONSTRAINT nexus_admin_users_role_check CHECK (role IN ('owner', 'admin', 'editor', 'finance', 'support'));
