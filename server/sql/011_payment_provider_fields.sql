ALTER TABLE nexus_billing_payments
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'stripe', 'mercadopago')),
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS nexus_billing_payments_provider_external_idx
  ON nexus_billing_payments(provider, external_id)
  WHERE external_id IS NOT NULL;
