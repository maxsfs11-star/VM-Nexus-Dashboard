-- Billing controls are kept on the tenant so every product can evaluate
-- access without depending on a payment provider during this first phase.
ALTER TABLE nexus_tenants
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS grace_period_until DATE,
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'current'
    CHECK (billing_status IN ('current', 'past_due', 'paid', 'cancelled'));

CREATE INDEX IF NOT EXISTS nexus_tenants_billing_idx
  ON nexus_tenants (due_date, grace_period_until, billing_status);
