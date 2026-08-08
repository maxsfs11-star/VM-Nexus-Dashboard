import { useEffect, useMemo, useState } from "react";
import {
  atribuirPlanoTenant,
  atualizarCobrancaTenant,
  listarAssinaturas,
  listarPlanos,
  listarTenants,
} from "./api";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

const statusLabel = { active: "Ativa", trial: "Em teste", paused: "Pausada", cancelled: "Cancelada" };

export default function BillingSubscriptionsView({ token, onError, onOpenStudyCode }) {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load(nextStatus = status) {
    setLoading(true);
    try {
      const [subscriptions, tenantData] = await Promise.all([listarAssinaturas(token, nextStatus), listarTenants(token)]);
      setItems(subscriptions.subscriptions || []);
      setTenants(tenantData.tenants || []);
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(status); }, [token, status]);

  async function selectCreateTenant(tenantId) {
    const tenant = tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    try {
      const tenantPlans = (await listarPlanos(token, tenant.product_key)).plans || [];
      setPlans(tenantPlans);
      setSelected({
        mode: "create",
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_slug: tenant.slug,
        product_name: tenant.product_key,
        product_slug: tenant.product_key,
        plan_id: tenantPlans[0]?.id || "",
        status: "trial",
        billing_status: tenant.billing_status || "current",
        due_date: tenant.due_date,
        grace_period_until: tenant.grace_period_until,
      });
    } catch (error) {
      onError(error.message);
    }
  }

  async function startMesaMandaCreate() {
    const available = tenants.filter((tenant) => !items.some((item) => item.tenant_id === tenant.id && item.status !== "cancelled"));
    if (!available.length) {
      onError(tenants.length ? "Todos os clientes já possuem uma assinatura ativa ou em teste." : "Cadastre um cliente em Tenants Tauri antes de criar a assinatura.");
      return;
    }
    await selectCreateTenant(available[0].id);
  }

  function openCreate() {
    // Não escolher MesaManda silenciosamente: StudyCode usa alunos, não tenants.
    setSelected({ mode: "choose" });
  }

  async function openSubscription(item) {
    setSelected(item);
    try {
      setPlans((await listarPlanos(token, item.product_slug)).plans || []);
    } catch (error) {
      onError(error.message);
    }
  }

  async function saveSubscription(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get("planId")) {
      onError("Selecione um plano antes de salvar a assinatura.");
      return;
    }
    setSaving(true);
    try {
      await atribuirPlanoTenant(token, selected.tenant_id, {
        planId: form.get("planId"),
        status: form.get("status"),
        endsAt: form.get("endsAt") || null,
      });
      await load();
      setSelected(null);
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBilling(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await atualizarCobrancaTenant(token, selected.tenant_id, {
        billingStatus: form.get("billingStatus"),
        dueDate: form.get("dueDate") || null,
        gracePeriodUntil: form.get("gracePeriodUntil") || null,
      });
      await load();
      setSelected((current) => current ? {
        ...current,
        billing_status: form.get("billingStatus"),
        due_date: form.get("dueDate") || null,
        grace_period_until: form.get("gracePeriodUntil") || null,
      } : current);
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  }

  const active = items.filter((item) => item.status === "active").length;
  const trial = items.filter((item) => item.status === "trial").length;
  const pastDue = items.filter((item) => item.billing_status === "past_due").length;
  const mrr = items.filter((item) => item.status === "active").reduce((total, item) => total + Number(item.monthly_price || 0), 0);
  const availableTenants = useMemo(() => tenants.filter((tenant) => !items.some((item) => item.tenant_id === tenant.id && item.status !== "cancelled")), [items, tenants]);

  return (
    <section className="page-section detail-page billing-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">COBRANÇA E ASSINATURAS</span>
          <h1>Ciclo de clientes</h1>
          <p>Gerencie planos, status, vencimentos e situação financeira sem perder o histórico.</p>
        </div>
        <div className="control-filters">
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativas</option><option value="trial">Em teste</option><option value="paused">Pausadas</option><option value="cancelled">Canceladas</option></select></label>
          <button className="button-quiet" onClick={() => load()}>{loading ? "Atualizando..." : "Atualizar"}</button>
          <button className="button-primary" onClick={openCreate}>Nova assinatura</button>
        </div>
      </div>

      <div className="billing-kpis">
        <article><small>MRR filtrado</small><strong>{money(mrr)}</strong><span>assinaturas ativas</span></article>
        <article><small>Ativas</small><strong>{active}</strong><span>gerando receita</span></article>
        <article><small>Em teste</small><strong>{trial}</strong><span>período de avaliação</span></article>
        <article className={pastDue ? "billing-attention" : ""}><small>Em atraso</small><strong>{pastDue}</strong><span>cobrança precisa de ação</span></article>
      </div>

      <div className="subscription-table">
        <div className="subscription-head"><span>Cliente</span><span>Produto e plano</span><span>Valor</span><span>Status</span><span>Gestão</span></div>
        {items.map((item) => <div className="subscription-row" key={item.id}>
          <span><strong>{item.tenant_name}</strong><small>{item.tenant_slug}</small></span>
          <span><strong>{item.product_name}</strong><small>{item.plan_name}</small></span>
          <span>{money(item.monthly_price)}</span>
          <span><em className={`status-pill ${item.status === "active" ? "available" : "planned"}`}>{statusLabel[item.status] || item.status}</em><small>{item.billing_status === "past_due" ? "Em atraso" : item.billing_status}</small></span>
          <span><button className="button-quiet" onClick={() => openSubscription(item)}>Gerenciar</button></span>
        </div>)}
      </div>

      {!items.length && <div className="empty-card"><h3>Nenhuma assinatura encontrada.</h3><p>Crie a primeira assinatura vinculando um cliente a um plano.</p><button className="button-primary" onClick={openCreate}>Nova assinatura</button></div>}

      {selected?.mode === "choose" && <div className="billing-drawer billing-product-chooser">
        <div className="section-heading"><div><span className="eyebrow">NOVA ASSINATURA</span><h2>Escolha o produto</h2><p>O fluxo de empresas é do MesaManda; assinaturas de alunos pertencem ao StudyCode.</p></div><button className="button-quiet" onClick={() => setSelected(null)}>Fechar</button></div>
        <div className="quick-actions">
          <button className="button-primary" onClick={startMesaMandaCreate}>MesaManda · empresa</button>
          <button className="button-quiet" onClick={() => { setSelected(null); onOpenStudyCode?.(); }}>StudyCode · aluno</button>
        </div>
      </div>}
      {selected && selected.mode !== "choose" && <div className="billing-drawer">
        <div className="section-heading"><div><span className="eyebrow">{selected.mode === "create" ? "NOVA ASSINATURA" : "GESTÃO DA ASSINATURA"}</span><h2>{selected.tenant_name}</h2><p>{selected.product_name} · {selected.tenant_slug}</p></div><button className="button-quiet" onClick={() => setSelected(null)}>Fechar</button></div>
        <form className="billing-form" onSubmit={saveSubscription}>
          <h3>Plano e ciclo</h3>
          {selected.mode === "create" && <label>Cliente<select value={selected.tenant_id} onChange={(event) => selectCreateTenant(event.target.value)}>{availableTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.product_key}</option>)}</select></label>}
          <div className="editor-grid"><label>Plano<select key={`${selected.tenant_id}-${selected.plan_id}-${plans.length}`} name="planId" defaultValue={selected.plan_id}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.monthly_price)}</option>)}</select></label><label>Status<select name="status" defaultValue={selected.status}><option value="trial">Em teste</option><option value="active">Ativa</option><option value="paused">Pausada</option><option value="cancelled">Cancelada</option></select></label></div>
          <label>Encerramento previsto<input type="datetime-local" name="endsAt" defaultValue={dateInput(selected.ends_at)} /></label>
          <button className="button-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar assinatura"}</button>
        </form>
        <form className="billing-form" onSubmit={saveBilling}>
          <h3>Cobrança</h3>
          <div className="editor-grid"><label>Status financeiro<select name="billingStatus" defaultValue={selected.billing_status}><option value="current">Em dia</option><option value="paid">Pago</option><option value="past_due">Em atraso</option><option value="cancelled">Cancelado</option></select></label><label>Vencimento<input type="date" name="dueDate" defaultValue={selected.due_date ? String(selected.due_date).slice(0, 10) : ""} /></label></div>
          <label>Fim do período de carência<input type="date" name="gracePeriodUntil" defaultValue={selected.grace_period_until ? String(selected.grace_period_until).slice(0, 10) : ""} /></label>
          <button className="button-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar cobrança"}</button>
        </form>
      </div>}
    </section>
  );
}
