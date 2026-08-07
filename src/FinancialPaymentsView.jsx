import { useEffect, useMemo, useState } from "react";
import { atualizarPagamento, criarPagamento, listarAssinaturas, listarFinanceiro, listarPagamentos, listarTenants } from "./api";
import StripeMonitorPanel from "./StripeMonitorPanel";

const statusLabel = { pending: "Pendente", paid: "Pago", past_due: "Em atraso", cancelled: "Cancelado", refunded: "Estornado" };

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

export default function FinancialPaymentsView({ token, onError }) {
  const [data, setData] = useState({ summary: {}, monthly: [], products: [] });
  const [payments, setPayments] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load(nextStatus = status) {
    setLoading(true);
    try {
      const [financial, paymentData, tenantData, subscriptionData] = await Promise.all([listarFinanceiro(token), listarPagamentos(token, nextStatus), listarTenants(token), listarAssinaturas(token, "all")]);
      setData(financial);
      setPayments(paymentData.payments || []);
      setTenants(tenantData.tenants || []);
      setSubscriptions(subscriptionData.subscriptions || []);
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(status); }, [token, status]);

  const received = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pending = payments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const overdue = payments.filter((payment) => payment.status === "past_due").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const tenantOptions = useMemo(() => tenants.filter((tenant) => tenant.status !== "closed"), [tenants]);
  const alerts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result = payments.filter((payment) => ["pending", "past_due"].includes(payment.status)).map((payment) => {
      const due = new Date(`${dateValue(payment.due_date)}T00:00:00`);
      const days = Math.ceil((due - today) / 86400000);
      const overduePayment = payment.status === "past_due" || days < 0;
      return { id: `payment-${payment.id}`, payment, type: "payment", severity: overduePayment ? "danger" : "warning", title: overduePayment ? "Cobrança atrasada" : days === 0 ? "Cobrança vence hoje" : "Cobrança próxima do vencimento", detail: `${payment.tenant_name} · ${money(payment.amount)} · ${dateValue(payment.due_date)}` };
    });
    subscriptions.filter((subscription) => ["active", "trial"].includes(subscription.status) && subscription.ends_at).forEach((subscription) => {
      const ends = new Date(subscription.ends_at); const days = Math.ceil((ends - today) / 86400000);
      if (days >= 0 && days <= 7) result.push({ id: `subscription-${subscription.id}`, type: "subscription", severity: "info", title: "Renovação próxima", detail: `${subscription.tenant_name} · ${subscription.plan_name} · ${dateValue(subscription.ends_at)}` });
    });
    return result.sort((left, right) => (left.severity === "danger" ? -1 : right.severity === "danger" ? 1 : 0)).slice(0, 12);
  }, [payments, subscriptions]);

  function openCreate() {
    if (!tenantOptions.length) {
      onError("Cadastre um cliente em Tenants Tauri antes de registrar uma cobrança.");
      return;
    }
    setEditing({ tenant_id: tenantOptions[0]?.id || "", amount: "", status: "pending", due_date: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
  }

  function openEdit(payment) {
    setEditing(payment);
  }

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      tenantId: form.get("tenantId"),
      amount: form.get("amount"),
      status: form.get("status"),
      dueDate: form.get("dueDate"),
      paidAt: form.get("paidAt") || null,
      reference: form.get("reference"),
      notes: form.get("notes"),
    };
    setSaving(true);
    try {
      if (editing.id) await atualizarPagamento(token, editing.id, payload);
      else await criarPagamento(token, payload);
      await load();
      setEditing(null);
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="page-section detail-page financial-page">
    <div className="page-heading"><div><span className="eyebrow">FINANCEIRO</span><h1>Receitas e cobranças</h1><p>Acompanhe o recorrente e registre cada cobrança por cliente.</p></div><div className="control-filters"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option><option value="past_due">Em atraso</option><option value="cancelled">Cancelados</option><option value="refunded">Estornados</option></select></label><button className="button-quiet" onClick={() => load()}>{loading ? "Atualizando..." : "Atualizar"}</button><button className="button-primary" onClick={openCreate}>Nova cobrança</button></div></div>
    <div className="billing-kpis"><article className="metric-highlight"><small>MRR atual</small><strong>{money(data.summary.mrr)}</strong><span>receita recorrente</span></article><article><small>Recebido</small><strong>{money(received)}</strong><span>registros pagos</span></article><article><small>A receber</small><strong>{money(pending)}</strong><span>cobranças pendentes</span></article><article className={overdue ? "billing-attention" : ""}><small>Em atraso</small><strong>{money(overdue)}</strong><span>precisa de ação</span></article></div>
    <StripeMonitorPanel token={token} payments={payments} onError={onError} />
    <section className="workspace-panel alert-center"><div className="section-heading"><div><span className="eyebrow">CENTRAL DE ALERTAS</span><h2>O que precisa de atenção</h2><p>Vencimentos e renovações dos próximos dias.</p></div><strong>{alerts.length} alerta(s)</strong></div><div className="finance-alert-list">{alerts.map((alert) => <article className={`finance-alert ${alert.severity}`} key={alert.id}><span className="alert-icon">!</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div>{alert.payment ? <button className="button-quiet" onClick={() => openEdit(alert.payment)}>Abrir cobrança</button> : <span className="alert-tag">Assinatura</span>}</article>)}{!alerts.length && <div className="empty-card"><h3>Nenhum alerta pendente.</h3><p>O financeiro está em dia nos próximos dias.</p></div>}</div></section>
    <div className="detail-columns"><section className="workspace-panel"><div className="section-heading"><div><span className="eyebrow">EVOLUÇÃO</span><h2>Receita por mês</h2></div></div><div className="data-list">{data.monthly.map((item) => <div key={item.month}><strong>{item.month}</strong><span>{money(item.revenue)} · {item.active_subscriptions} assinaturas</span></div>)}</div></section><section className="workspace-panel"><div className="section-heading"><div><span className="eyebrow">POR PRODUTO</span><h2>Receita atual</h2></div></div><div className="data-list">{data.products.map((item) => <div key={item.slug}><strong>{item.product_name}</strong><span>{money(item.mrr)} · {item.active_subscriptions} ativas</span></div>)}</div></section></div>
    <section className="workspace-panel payment-panel"><div className="section-heading"><div><span className="eyebrow">CONTAS A RECEBER</span><h2>Histórico de cobranças</h2><p>Registre pagamentos manualmente até conectar um gateway.</p></div><button className="button-primary" onClick={openCreate}>Registrar cobrança</button></div><div className="payment-table"><div className="payment-table-head"><span>Cliente</span><span>Vencimento</span><span>Valor</span><span>Status</span><span>Referência</span><span>Ação</span></div>{payments.map((payment) => <div className="payment-row" key={payment.id}><span><strong>{payment.tenant_name}</strong><small>{payment.tenant_slug}</small></span><span>{dateValue(payment.due_date)}</span><span>{money(payment.amount)}</span><span><em className={`status-pill ${payment.status === "paid" ? "available" : payment.status === "past_due" ? "planned" : "planned"}`}>{statusLabel[payment.status] || payment.status}</em></span><span>{payment.reference || "—"}</span><span><button className="button-quiet" onClick={() => openEdit(payment)}>Editar</button></span></div>)}</div>{!payments.length && <div className="empty-card"><h3>Nenhuma cobrança neste filtro.</h3><p>Registre a primeira cobrança para começar o histórico.</p><button className="button-primary" onClick={openCreate}>Nova cobrança</button></div>}</section>
    {editing && <div className="billing-drawer payment-drawer"><div className="section-heading"><div><span className="eyebrow">{editing.id ? "EDITAR COBRANÇA" : "NOVA COBRANÇA"}</span><h2>{editing.id ? editing.tenant_name : "Registrar cobrança"}</h2><p>Valor, vencimento e situação financeira.</p></div><button className="button-quiet" onClick={() => setEditing(null)}>Fechar</button></div><form className="billing-form" onSubmit={save} key={editing.id || "new"}><div className="editor-grid"><label>Cliente<select name="tenantId" defaultValue={editing.tenant_id} required>{tenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.product_key}</option>)}</select></label><label>Valor (R$)<input name="amount" type="number" min="0" step="0.01" defaultValue={editing.amount} required /></label><label>Status<select name="status" defaultValue={editing.status}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="past_due">Em atraso</option><option value="cancelled">Cancelado</option><option value="refunded">Estornado</option></select></label><label>Vencimento<input name="dueDate" type="date" defaultValue={dateValue(editing.due_date)} required /></label><label>Pago em<input name="paidAt" type="datetime-local" defaultValue={editing.paid_at ? new Date(editing.paid_at).toISOString().slice(0, 16) : ""} /></label><label>Referência<input name="reference" defaultValue={editing.reference || ""} placeholder="Ex.: PIX-2026-001" /></label></div><label>Observações<textarea name="notes" rows="3" defaultValue={editing.notes || ""} placeholder="Informações internas da cobrança" /></label><button className="button-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar cobrança"}</button></form></div>}
  </section>;
}
