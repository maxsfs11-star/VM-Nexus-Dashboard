CREATE TABLE IF NOT EXISTS nexus_billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES nexus_tenants(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'past_due', 'cancelled', 'refunded')),
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at TIMESTAMPTZ,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nexus_billing_payments_tenant_idx ON nexus_billing_payments(tenant_id, due_date DESC);
CREATE INDEX IF NOT EXISTS nexus_billing_payments_status_idx ON nexus_billing_payments(status, due_date);
