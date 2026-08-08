ALTER TABLE studycode_billing_payments
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS studycode_billing_subscription_idx
  ON studycode_billing_payments(subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS studycode_billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_payment_id UUID REFERENCES studycode_billing_payments(id) ON DELETE SET NULL,
  studycode_user_id UUID REFERENCES studycode_users(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES nexus_plans(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe', 'mercadopago')),
  checkout_session_id TEXT UNIQUE,
  invoice_id TEXT UNIQUE,
  payment_intent_id TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method TEXT,
  paid_at TIMESTAMPTZ,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studycode_billing_transactions_user_idx
  ON studycode_billing_transactions(studycode_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studycode_billing_transactions_subscription_idx
  ON studycode_billing_transactions(billing_payment_id, created_at DESC);
