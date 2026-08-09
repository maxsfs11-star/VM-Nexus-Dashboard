-- Compras avulsas de CodeCoins. O provedor fica separado para permitir
-- adicionar Mercado Pago futuramente sem alterar o aplicativo.
CREATE TABLE IF NOT EXISTS studycode_codecoin_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studycode_user_id UUID NOT NULL REFERENCES studycode_users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES studycode_coin_packs(id) ON DELETE RESTRICT,
  pack_slug TEXT NOT NULL,
  coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  payment_method TEXT,
  paid_at TIMESTAMPTZ,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studycode_codecoin_purchase_user_idx
  ON studycode_codecoin_purchases(studycode_user_id, created_at DESC);

ALTER TABLE studycode_coin_transactions
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES studycode_codecoin_purchases(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS studycode_coin_transactions_purchase_idx
  ON studycode_coin_transactions(purchase_id)
  WHERE purchase_id IS NOT NULL;
