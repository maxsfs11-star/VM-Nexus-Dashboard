import { useEffect, useMemo, useState } from "react";
import { consultarStripeStatus } from "./api";

function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function StripeMonitorPanel({ token, payments, onError }) {
  const [status, setStatus] = useState(null);
  useEffect(() => { consultarStripeStatus(token).then(setStatus).catch((error) => onError(error.message)); }, [token, onError]);
  const stripePayments = useMemo(() => payments.filter((payment) => payment.provider === "stripe"), [payments]);
  const paid = stripePayments.filter((payment) => payment.status === "paid").reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const webhookUrl = `${import.meta.env.VITE_API_URL || "https://vm-nexus-api.onrender.com"}/api/webhooks/stripe`;
  return <section className="workspace-panel stripe-monitor-panel"><div className="section-heading"><div><span className="eyebrow">STRIPE · MONITORAMENTO</span><h2>Pagamentos recebidos</h2><p>O checkout acontece no produto; o dashboard apenas acompanha os eventos confirmados.</p></div><span className={`status-pill ${status?.configured ? "available" : "planned"}`}>{status?.configured ? "Conectado" : "Não configurado"}</span></div><div className="stripe-monitor-metrics"><article><small>Eventos Stripe</small><strong>{stripePayments.length}</strong></article><article><small>Confirmados</small><strong>{money(paid)}</strong></article><article><small>Ambiente</small><strong>{status?.testMode ? "Teste" : "Produção"}</strong></article></div><div className="stripe-webhook-line"><small>Webhook para configurar na Stripe</small><code>{webhookUrl}</code></div><div className="payment-table stripe-history"><div className="payment-table-head"><span>Cliente</span><span>Valor</span><span>Método</span><span>Status</span><span>Evento</span></div>{stripePayments.slice(0, 10).map((payment) => <div className="payment-row" key={payment.id}><span><strong>{payment.tenant_name}</strong><small>{payment.tenant_slug}</small></span><span>{money(payment.amount)}</span><span>{payment.payment_method || "Aguardando"}</span><span><em className={`status-pill ${payment.status === "paid" ? "available" : "planned"}`}>{payment.status}</em></span><span><small>{payment.external_id || "Sem evento externo"}</small></span></div>)}</div>{!stripePayments.length && <div className="empty-card"><h3>Nenhum pagamento Stripe recebido.</h3><p>Quando o webhook confirmar um checkout, o histórico aparecerá aqui.</p></div>}</section>;
}
