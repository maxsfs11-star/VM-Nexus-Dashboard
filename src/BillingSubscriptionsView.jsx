import { useEffect, useMemo, useState } from "react";
import {
  alterarStatusPlano,
  atribuirPlanoTenant,
  atualizarCobrancaTenant,
  atualizarPlano,
  criarPlano,
  excluirPlano,
  listarAssinaturas,
  listarPlanos,
  listarStudyCodeCobrancas,
  listarTenants,
} from "./api";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

const statusLabel = { active: "Ativa", trial: "Em teste", paused: "Pausada", cancelled: "Cancelada" };
const paymentStatusLabel = {
  pending: "Pendente",
  active: "Ativo",
  paid: "Pago",
  past_due: "Vencido",
  failed: "Falhou",
  cancelled: "Cancelado",
};

function readFeatures(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function StudyCodeBillingPanel({ token, onError, onBack }) {
  const [data, setData] = useState({ plans: [], payments: [] });
  const [editing, setEditing] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setData(await listarStudyCodeCobrancas(token)); }
    catch (error) { onError(error.message); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [token]);

  async function savePlan(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentFeatures = readFeatures(editing?.features);
    const billingType = String(form.get("billingType") || "recurring");
    const payload = {
      productKey: "studycode",
      name: form.get("name"),
      slug: form.get("slug"),
      description: form.get("description"),
      monthlyPrice: Number(form.get("price") || 0),
      displayOrder: Number(form.get("displayOrder") || 0),
      features: {
        ...currentFeatures,
        billingType,
        durationMonths: billingType === "lifetime" ? null : Number(form.get("durationMonths") || 1),
        benefits: String(form.get("benefits") || "").split("\n").map((item) => item.trim()).filter(Boolean),
      },
    };
    setSaving(true);
    try {
      if (editing?.id) await atualizarPlano(token, editing.id, payload);
      else await criarPlano(token, payload);
      setEditing(undefined);
      await load();
    } catch (error) { onError(error.message); }
    finally { setSaving(false); }
  }

  async function togglePlan(plan) {
    try { await alterarStatusPlano(token, plan.id, !plan.active); await load(); }
    catch (error) { onError(error.message); }
  }

  async function deletePlan(plan) {
    const confirmed = window.confirm(`Excluir o plano "${plan.name}"? Essa ação só é permitida quando não há assinaturas vinculadas.`);
    if (!confirmed) return;
    try { await excluirPlano(token, plan.id); await load(); }
    catch (error) { onError(error.message); }
  }

  const activeSubscriptions = data.payments.filter((item) => item.status === "active").length;
  const pendingPayments = data.payments.filter((item) => item.status === "pending" || item.status === "past_due").length;

  return <section className="page-section detail-page billing-page studycode-billing-page">
    <div className="page-heading"><div><span className="eyebrow">STUDYCODE · ASSINATURAS</span><h1>Planos e pagamentos</h1><p>Defina os valores exibidos no aplicativo e acompanhe cada pagamento confirmado pelo servidor.</p></div><div className="control-filters"><button className="button-quiet" onClick={onBack}>Voltar aos produtos</button><button className="button-quiet" onClick={load}>{loading ? "Atualizando..." : "Atualizar"}</button><button className="button-primary" onClick={() => setEditing(null)}>Novo plano</button></div></div>

    <div className="billing-kpis"><article><small>Planos ativos</small><strong>{data.plans.filter((item) => item.active).length}</strong><span>disponíveis no aplicativo</span></article><article><small>Assinaturas ativas</small><strong>{activeSubscriptions}</strong><span>acessos Premium e vitalícios</span></article><article className={pendingPayments ? "billing-attention" : ""}><small>Pagamentos pendentes</small><strong>{pendingPayments}</strong><span>aguardando confirmação</span></article><article><small>Histórico</small><strong>{data.payments.length}</strong><span>transações registradas</span></article></div>

    {editing !== undefined && <form className="billing-form studycode-plan-form" onSubmit={savePlan}>
      <div className="section-heading"><div><span className="eyebrow">{editing?.id ? "EDITAR PLANO" : "NOVO PLANO"}</span><h2>{editing?.name || "Configure um novo plano"}</h2><p>Preço e modalidade são definidos aqui; o aplicativo apenas consulta estes dados.</p></div><button className="button-quiet" type="button" onClick={() => setEditing(undefined)}>Fechar</button></div>
      <div className="editor-grid"><label>Nome<input name="name" required defaultValue={editing?.name || ""} placeholder="Ex.: Premium" /></label><label>Identificador<input name="slug" required disabled={Boolean(editing?.id)} defaultValue={editing?.slug || ""} placeholder="premium" /></label></div>
      <label>Descrição<textarea name="description" rows="2" defaultValue={editing?.description || ""} placeholder="O que este plano oferece" /></label>
      <div className="editor-grid"><label>Preço (R$)<input name="price" type="number" min="0" step="0.01" required defaultValue={editing?.monthly_price ?? 0} /></label><label>Modalidade<select name="billingType" defaultValue={readFeatures(editing?.features).billingType || "recurring"}><option value="recurring">Assinatura mensal</option><option value="lifetime">Acesso vitalício</option></select></label><label>Duração de acesso (meses)<input name="durationMonths" type="number" min="1" defaultValue={readFeatures(editing?.features).durationMonths || 1} /></label><label>Ordem de exibição<input name="displayOrder" type="number" min="0" defaultValue={editing?.display_order || 0} /></label></div>
      <label>Benefícios, um por linha<textarea name="benefits" rows="4" defaultValue={(readFeatures(editing?.features).benefits || []).join("\n")} placeholder={'Todas as linguagens\nIA com limite maior\nCertificados'} /></label>
      <div className="action-row"><button className="button-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar plano"}</button>{editing?.id && <button className="button-quiet danger-button" type="button" onClick={() => deletePlan(editing)}>Excluir plano</button>}</div>
    </form>}

    <section className="workspace-panel"><div className="section-heading"><div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2>Planos do StudyCode</h2><p>Edite preços, prazo, benefícios e disponibilidade sem alterar o aplicativo.</p></div></div><div className="plan-grid">{data.plans.map((plan) => { const features = readFeatures(plan.features); const lifetime = features.billingType === "lifetime"; return <article className="monetization-card" key={plan.id}><div><span className={`status-pill ${plan.active ? "available" : "planned"}`}>{plan.active ? "ATIVO" : "PAUSADO"}</span><h3>{plan.name}</h3><p>{plan.description || "Sem descrição cadastrada."}</p></div><strong>{money(plan.monthly_price)}<small>{lifetime ? " pagamento único" : "/mês"}</small></strong><div className="coin-line">{lifetime ? "Acesso vitalício" : `${features.durationMonths || 1} mês(es) de acesso`}</div><ul>{(features.benefits || []).map((benefit) => <li key={benefit}>{benefit}</li>)}</ul><small>{plan.subscribers || 0} aluno(s) neste plano</small><div className="action-row"><button className="button-quiet" onClick={() => setEditing(plan)}>Editar preço e plano</button><button className="button-quiet" onClick={() => togglePlan(plan)}>{plan.active ? "Pausar" : "Ativar"}</button></div></article>; })}</div>{!data.plans.length && <div className="empty-card"><h3>Nenhum plano cadastrado.</h3><p>Use “Novo plano” para criar a primeira oferta do StudyCode.</p></div>}</section>

    <section className="workspace-panel"><div className="section-heading"><div><span className="eyebrow">HISTÓRICO FINANCEIRO</span><h2>Pagamentos do StudyCode</h2><p>Data, horário, plano, valor, método e vencimento registrados pelo backend.</p></div></div><div className="payment-table studycode-payment-history"><div className="payment-table-head"><span>Assinante</span><span>Plano</span><span>Valor</span><span>Status</span><span>Pagamento</span><span>Próxima cobrança</span></div>{data.payments.map((payment) => <div className="payment-row" key={payment.id}><span><strong>{payment.student_name || "Conta removida"}</strong><small>{payment.student_email || "—"}</small></span><span><strong>{payment.plan_name || payment.plan_slug}</strong><small>{readFeatures(payment.plan_features).billingType === "lifetime" ? "Vitalício" : "Mensal"}</small></span><span>{money(payment.amount)}</span><span><em className={`status-pill ${["active", "paid"].includes(payment.status) ? "available" : "planned"}`}>{paymentStatusLabel[payment.status] || payment.status}</em></span><span><strong>{payment.payment_method || payment.provider}</strong><small>{dateTime(payment.created_at)}</small></span><span>{dateTime(payment.next_billing_at)}</span></div>)}</div>{!data.payments.length && <div className="empty-card"><h3>Nenhum pagamento registrado.</h3><p>As transações aparecerão aqui depois que o webhook confirmar ou atualizar o pagamento.</p></div>}</section>
  </section>;
}

export default function BillingSubscriptionsView({ token, onError }) {
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
    setPlans([]);
    setSelected({
      mode: "create",
      tenant_id: "",
      tenant_name: "",
      tenant_slug: "",
      product_name: "MesaManda",
      product_slug: "mesamanda",
      plan_id: "",
      status: "trial",
      billing_status: "current",
      due_date: null,
      grace_period_until: null,
    });
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
    if (!selected.tenant_id) {
      onError("Selecione a empresa que receberá a assinatura.");
      return;
    }
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

  if (selected?.mode === "studycode") return <StudyCodeBillingPanel token={token} onError={onError} onBack={() => setSelected(null)} />;

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

      {!items.length && <div className="empty-card"><h3>Nenhuma assinatura encontrada.</h3><p>Escolha um produto para configurar seus planos e assinaturas.</p><button className="button-primary" onClick={openCreate}>Nova assinatura</button></div>}

      {selected?.mode === "choose" && <div className="billing-drawer billing-product-chooser">
        <div className="section-heading"><div><span className="eyebrow">CENTRAL DE ASSINATURAS</span><h2>Escolha o produto</h2><p>Cada produto possui seus próprios planos, preços, assinaturas e histórico financeiro.</p></div><button className="button-quiet" onClick={() => setSelected(null)}>Fechar</button></div>
        <div className="quick-actions">
          <button className="button-primary" onClick={startMesaMandaCreate}>MesaManda · empresa</button>
          <button className="button-quiet" onClick={() => setSelected({ mode: "studycode" })}>StudyCode · assinaturas</button>
        </div>
      </div>}
      {selected && selected.mode !== "choose" && <div className="billing-drawer">
        <div className="section-heading"><div><span className="eyebrow">{selected.mode === "create" ? "NOVA ASSINATURA" : "GESTÃO DA ASSINATURA"}</span><h2>{selected.tenant_name || "Selecione uma empresa"}</h2><p>{selected.tenant_name ? `${selected.product_name} · ${selected.tenant_slug}` : "Escolha qualquer empresa cadastrada no MesaManda."}</p></div><button className="button-quiet" onClick={() => setSelected(null)}>Fechar</button></div>
        <form className="billing-form" onSubmit={saveSubscription}>
          <h3>Plano e ciclo</h3>
          {selected.mode === "create" && <label>Empresa<select value={selected.tenant_id} onChange={(event) => selectCreateTenant(event.target.value)}><option value="">Selecione uma empresa</option>{availableTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.product_key}</option>)}</select></label>}
          <div className="editor-grid"><label>Plano<select key={`${selected.tenant_id}-${selected.plan_id}-${plans.length}`} name="planId" defaultValue={selected.plan_id} disabled={!selected.tenant_id}>{!plans.length && <option value="">Selecione primeiro a empresa</option>}{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.monthly_price)}</option>)}</select></label><label>Status<select name="status" defaultValue={selected.status}><option value="trial">Em teste</option><option value="active">Ativa</option><option value="paused">Pausada</option><option value="cancelled">Cancelada</option></select></label></div>
          <label>Encerramento previsto<input type="datetime-local" name="endsAt" defaultValue={dateInput(selected.ends_at)} /></label>
          <button className="button-primary" disabled={saving || !selected.tenant_id || !plans.length}>{saving ? "Salvando..." : "Salvar assinatura"}</button>
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
