import { useEffect, useState } from "react";
import { consultarStripeStatus, criarStripeCheckout } from "./api";

export default function StripeTestPanel({ token, tenants, subscriptions, onError }) {
  const [configured, setConfigured] = useState(false);
  const [tenantId, setTenantId] = useState(tenants[0]?.id || "");
  const [amount, setAmount] = useState("10.00");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  // The status endpoint never exposes the secret key, only whether the API is ready.
  useEffect(() => {
    consultarStripeStatus(token).then((result) => setConfigured(result.configured && result.testMode)).catch((error) => onError(error.message)).finally(() => setStatusLoading(false));
  }, [token, onError]);

  function suggestedAmount(nextTenantId) {
    const subscription = subscriptions.find((item) => item.tenant_id === nextTenantId && ["active", "trial"].includes(item.status));
    return subscription?.monthly_price ? Number(subscription.monthly_price).toFixed(2) : "10.00";
  }

  async function startCheckout() {
    const selectedTenantId = tenantId || tenants[0]?.id || "";
    if (!selectedTenantId) { onError("Cadastre um tenant antes de testar o Stripe."); return; }
    setLoading(true);
    try {
      const result = await criarStripeCheckout(token, { tenantId: selectedTenantId, amount, description: "Checkout de teste VM Nexus", successUrl: `${window.location.origin}/?stripe_test=success`, cancelUrl: `${window.location.origin}/?stripe_test=cancelled` });
      if (result.checkoutUrl) window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (error) { onError(error.message); } finally { setLoading(false); }
  }

  return <section className="workspace-panel stripe-test-panel"><div className="section-heading"><div><span className="eyebrow">STRIPE SANDBOX</span><h2>Testar checkout</h2><p>Abra uma cobrança simulada sem movimentar dinheiro real.</p></div><span className={`status-pill ${configured ? "available" : "planned"}`}>{statusLoading ? "Verificando..." : configured ? "Configurado" : "Aguardando chave"}</span></div><div className="stripe-test-form"><label>Cliente<select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setAmount(suggestedAmount(event.target.value)); }}>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.product_key}</option>)}</select></label><label>Valor de teste (R$)<input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><button className="button-primary" onClick={startCheckout} disabled={loading || statusLoading || !configured || !tenants.length}>{loading ? "Abrindo checkout..." : "Abrir checkout Stripe"}</button></div>{!configured && !statusLoading && <small className="stripe-test-hint">Adicione STRIPE_SECRET_KEY com uma chave sk_test_ no serviço da API e faça um novo deploy.</small>}<small className="stripe-test-hint">No checkout Stripe, use os cartões de teste oficiais. Nenhuma cobrança real será processada.</small></section>;
}
