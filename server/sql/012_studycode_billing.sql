CREATE TABLE IF NOT EXISTS studycode_billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studycode_user_id UUID REFERENCES studycode_users(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES nexus_tenants(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL DEFAULT 'StudyCode',
  plan_id UUID REFERENCES nexus_plans(id) ON DELETE SET NULL,
  plan_slug TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'failed', 'past_due')),
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  subscription_id TEXT,
  payment_method TEXT,
  started_at TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studycode_billing_user_idx
  ON studycode_billing_payments(studycode_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studycode_billing_status_idx
  ON studycode_billing_payments(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS studycode_billing_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
