import { useEffect, useState } from "react";
import "./plans.css";
import "./plans-layout.css";
import {
  alterarStatusTenant,
  alterarStatusUnidade,
  atualizarTenant,
  atualizarCobrancaTenant,
  atualizarUnidade,
  criarTenant,
  criarUnidade,
  excluirTenant,
  excluirUnidade,
  listarPlanos,
  criarPlano,
  atualizarPlano,
  alterarStatusPlano,
  atribuirPlanoTenant,
  listarTenants,
  listarUnidades,
  loginAdmin,
  listarProdutos,
  criarProduto,
  atualizarProduto,
  excluirProduto,
} from "./api";

const menu = [
  ["visao", "Visão geral"],
  ["clientes", "Clientes e tenants"],
  ["produtos", "Produtos VM Nexus"],
  ["planos", "Planos e assinaturas"],
  ["suporte", "Suporte"],
  ["financeiro", "Financeiro"],
  ["auditoria", "Auditoria"],
];

const PLATFORM_LABELS = { web: "Web", desktop: "Desktop", android: "Android", ios: "iOS" };
const STATUS_LABELS = { development: "Em desenvolvimento", available: "Disponível", planned: "Planejado", archived: "Arquivado" };
const TYPE_LABELS = { system: "Sistema", mobile_app: "Aplicativo móvel", web_app: "Aplicativo web", service: "Serviço" };

function formatDate(value) {
  if (!value) return "Não definido";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não definido" : date.toLocaleDateString("pt-BR");
}

function ProductOptions({ products }) {
  return products.filter((product) => product.status !== "archived").map((product) => (
    <option key={product.id} value={product.slug}>{product.name}</option>
  ));
}
function readPlanFeatures(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setErro("");
    setCarregando(true);
    try { onLogin(await loginAdmin(email, password)); } catch (error) { setErro(error.message); } finally { setCarregando(false); }
  }

  return <main className="login-shell"><section className="login-card"><div className="login-brand"><span className="brand-mark">VM</span><div><strong>VM Nexus</strong><small>Central administrativa</small></div></div><span className="eyebrow">ACESSO PRIVADO</span><h1>Bem-vindo de volta.</h1><p>Entre com o administrador da VM Nexus Digital para continuar.</p><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@vmnexus.com" required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" required /></label>{erro && <div className="login-error">{erro}</div>}<button type="submit" disabled={carregando}>{carregando ? "Entrando..." : "Entrar na central"}</button></form><small className="login-note">Acesso exclusivo da VM Nexus Digital.</small></section></main>;
}

function TenantForm({ cliente, products, onSubmit, onClose }) {
  return <form className="tenant-inline-form" onSubmit={async (event) => { if (await onSubmit(event, cliente)) onClose(); }}><label>Nome<input name="name" defaultValue={cliente.name} required /></label><label>Identificador<input name="slug" defaultValue={cliente.slug} pattern="[a-z0-9-]+" required /></label><label>Produto<select name="productKey" defaultValue={cliente.product_key || products[0]?.slug}><ProductOptions products={products} /></select></label><button type="submit">Salvar alterações</button></form>;
}

function BillingForm({ cliente, onSubmit, onClose }) {
  return <form className="tenant-inline-form billing-form" onSubmit={(event) => { onSubmit(event, cliente); onClose(); }}>
    <strong>Regras de cobrança</strong>
    <label>Vencimento<input type="date" name="dueDate" defaultValue={cliente.due_date || ""} /></label>
    <label>Fim da tolerância<input type="date" name="gracePeriodUntil" defaultValue={cliente.grace_period_until || ""} /></label>
    <label>Status financeiro<select name="billingStatus" defaultValue={cliente.billing_status || "current"}><option value="current">Em dia</option><option value="past_due">Em atraso</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option></select></label>
    <button type="submit">Salvar cobrança</button>
  </form>;
}

function TenantsView({ clientes, products, onNovoCliente, onSelecionar, onEditar, onAlternar, onExcluir, onAtualizarCobranca = onEditar }) {
  const [opcoesId, setOpcoesId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [cobrancaId, setCobrancaId] = useState(null);
  return <section className="tenants-view">
    <div className="view-heading"><div><span className="eyebrow">ADMINISTRAÇÃO DE CLIENTES</span><h2>Clientes e tenants</h2><p>Cada tenant representa uma empresa isolada dentro do ecossistema VM Nexus.</p></div><button onClick={onNovoCliente}>Novo cliente</button></div>
    <div className="tenant-summary"><article><small>Total de tenants</small><strong>{clientes.length}</strong></article><article><small>Tenants ativos</small><strong>{clientes.filter((cliente) => cliente.status !== "suspended").length}</strong></article><article><small>Produtos conectados</small><strong>{new Set(clientes.map((cliente) => cliente.product_key || cliente.produto)).size}</strong></article></div>
    <div className="tenant-table"><div className="tenant-table-head"><span>Empresa</span><span>Produto</span><span>Unidades</span><span>Status e acesso</span></div>
      {clientes.map((cliente) => <div className="tenant-row" key={cliente.id || cliente.nome}>
        <div><span className="client-mark">{(cliente.name || cliente.nome).slice(0, 2).toUpperCase()}</span><span><strong>{cliente.name || cliente.nome}</strong><small>{cliente.slug || "ambiente-local"}</small></span></div>
        <div className="tenant-product"><strong>{cliente.product_key || cliente.produto || "—"}</strong>{cliente.plan_name && <small>Plano: {cliente.plan_name}</small>}</div><span>{cliente.units ?? cliente.unidades ?? 0}</span>
        <div className="tenant-actions"><div className="tenant-status"><div><em className={cliente.status === "suspended" ? "unit-inactive" : "unit-active"}>{cliente.status || "Configuração"}</em><em className={`access-badge ${cliente.access_level || "full"}`}>{cliente.access_level === "blocked" ? "Acesso bloqueado" : cliente.access_level === "limited" ? "Acesso limitado" : "Acesso normal"}</em></div><small>Vencimento: {formatDate(cliente.due_date)}{cliente.grace_period_until ? ` · tolerância até ${formatDate(cliente.grace_period_until)}` : ""}</small></div>{cliente.id && <><button onClick={() => onSelecionar(cliente)}>Unidades</button><button className="tenant-options-button" onClick={() => setOpcoesId(opcoesId === cliente.id ? null : cliente.id)}>Opções</button></>}</div>
        {opcoesId === cliente.id && <div className="tenant-options"><button onClick={() => setEditandoId(editandoId === cliente.id ? null : cliente.id)}>Editar empresa</button><button onClick={() => setCobrancaId(cobrancaId === cliente.id ? null : cliente.id)}>Cobrança e acesso</button><button onClick={() => onAlternar(cliente)}>{cliente.status === "suspended" ? "Ativar empresa" : "Desativar empresa"}</button><button className="unit-delete" onClick={() => onExcluir(cliente)}>Excluir empresa</button></div>}
        {editandoId === cliente.id && <TenantForm cliente={cliente} products={products} onSubmit={onEditar} onClose={() => setEditandoId(null)} />}
        {cobrancaId === cliente.id && <BillingForm cliente={cliente} onSubmit={onAtualizarCobranca} onClose={() => setCobrancaId(null)} />}
      </div>)}
    </div>{!clientes.length && <div className="empty-state">Nenhum tenant cadastrado ainda.</div>}
  </section>;
}

function UnidadesView({ tenant, unidades, onCriar, onAtualizar, onAlternar, onExcluir, erro, salvando }) {
  const [editandoId, setEditandoId] = useState(null);
  return <section className="units-view"><div className="view-heading"><div><span className="eyebrow">UNIDADES DO TENANT</span><h2>{tenant.name}</h2><p>Locais vinculados a este cliente e isolados pelo tenant.</p></div></div><div className="unit-content"><div className="unit-list">{unidades.map((unidade) => <article className="unit-card" key={unidade.id}><span className="client-mark">{unidade.name.slice(0, 2).toUpperCase()}</span><div><strong>{unidade.name}</strong><small>{unidade.slug} · {unidade.city || "Cidade não informada"}{unidade.state ? `/${unidade.state}` : ""}</small></div><em className={unidade.active ? "unit-active" : "unit-inactive"}>{unidade.active ? "Ativa" : "Desativada"}</em><div className="unit-card-actions"><button className="unit-edit" onClick={() => setEditandoId(editandoId === unidade.id ? null : unidade.id)}>{editandoId === unidade.id ? "Fechar" : "Editar"}</button><button className="unit-toggle" onClick={() => onAlternar(unidade)}>{unidade.active ? "Desativar" : "Ativar"}</button><button className="unit-delete" onClick={() => onExcluir(unidade)}>Excluir</button></div>{editandoId === unidade.id && <form className="unit-inline-form" onSubmit={(event) => { onAtualizar(event, unidade); setEditandoId(null); }}><label>Nome<input name="name" defaultValue={unidade.name} required /></label><label>Identificador<input name="slug" defaultValue={unidade.slug} pattern="[a-z0-9-]+" required /></label><div className="unit-form-grid"><label>Cidade<input name="city" defaultValue={unidade.city || ""} /></label><label>UF<input name="state" defaultValue={unidade.state || ""} maxLength="2" /></label></div><button type="submit">Salvar alterações</button></form>}</article>)}{!unidades.length && <div className="empty-state">Nenhuma unidade cadastrada para este tenant.</div>}</div><form className="unit-form" onSubmit={onCriar}><strong>Adicionar unidade</strong><label>Nome<input name="name" placeholder="Ex.: Matriz" required /></label><label>Identificador<input name="slug" placeholder="matriz" pattern="[a-z0-9-]+" required /></label><div className="unit-form-grid"><label>Cidade<input name="city" placeholder="Santa Fé do Sul" /></label><label>UF<input name="state" placeholder="SP" maxLength="2" /></label></div>{erro && <div className="login-error">{erro}</div>}<button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Adicionar unidade"}</button></form></div></section>;
}

function ProductForm({ product, onSubmit, onClose, saving, error }) {
  const editing = Boolean(product?.id);
  return <div className="modal-backdrop"><form className="tenant-modal product-form" onSubmit={(event) => onSubmit(event, product)}>
    <div className="view-heading"><div><span className="eyebrow">{editing ? "EDITAR PROJETO" : "NOVO PROJETO"}</span><h2>{editing ? product.name : "Cadastrar projeto"}</h2></div><button type="button" onClick={onClose}>Fechar</button></div>
    <label>Nome<input name="name" defaultValue={product?.name || ""} required /></label>
    {!editing && <label>Identificador<input name="slug" defaultValue={product?.slug || ""} placeholder="meu-projeto" pattern="[a-z0-9-]+" required /></label>}
    <label>Categoria<input name="category" defaultValue={product?.category || ""} placeholder="Ex.: Gestão, Food service" /></label>
    <label>Descrição<textarea name="description" defaultValue={product?.description || ""} rows="3" /></label>
    <div className="product-form-grid"><label>Tipo<select name="productType" defaultValue={product?.product_type || "system"}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Status<select name="status" defaultValue={product?.status || "planned"}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <fieldset><legend>Plataformas</legend><div className="platform-options">{Object.entries(PLATFORM_LABELS).map(([value, label]) => <label key={value}><input type="checkbox" name="platforms" value={value} defaultChecked={(product?.platforms || ["web"]).includes(value)} />{label}</label>)}</div></fieldset>
    {error && <div className="login-error">{error}</div>}
    <button className="tenant-submit" type="submit" disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar projeto"}</button>
  </form></div>;
}

function ProductsView({ products, onSave, onDelete, saving, error }) {
  const [editing, setEditing] = useState(undefined);
  const active = products.filter((product) => product.status !== "archived");
  return <section className="tenants-view products-view">
    <div className="view-heading"><div><span className="eyebrow">PORTFÓLIO VM NEXUS</span><h2>Projetos, sistemas e aplicativos</h2><p>Administre cada produto e as plataformas Web, Desktop, Android e iOS.</p></div><button onClick={() => setEditing(null)}>Novo projeto</button></div>
    <div className="tenant-summary"><article><small>Total de projetos</small><strong>{products.length}</strong></article><article><small>Projetos ativos</small><strong>{active.length}</strong></article><article><small>Apps móveis</small><strong>{products.filter((product) => product.platforms?.some((platform) => platform === "android" || platform === "ios")).length}</strong></article></div>
    <div className="product-catalog">{products.map((product) => <article className="product-catalog-card" key={product.id}><div className="product-card-heading"><span className="product-icon">{product.name.slice(0, 2).toUpperCase()}</span><div><strong>{product.name}</strong><small>{product.category || TYPE_LABELS[product.product_type]}</small></div><em className={`product-status ${product.status}`}>{STATUS_LABELS[product.status] || product.status}</em></div><p>{product.description || "Sem descrição cadastrada."}</p><div className="platform-tags">{product.platforms?.map((platform) => <span key={platform}>{PLATFORM_LABELS[platform] || platform}</span>)}</div><dl><div><dt>Tenants</dt><dd>{product.tenants || 0}</dd></div><div><dt>Planos</dt><dd>{product.plans || 0}</dd></div><div><dt>Identificador</dt><dd>{product.slug}</dd></div></dl><div className="plan-actions"><button onClick={() => setEditing(product)}>Editar</button><button className="danger-button" onClick={() => onDelete(product)}>Excluir</button></div></article>)}</div>
    {!products.length && <div className="empty-state">Nenhum projeto cadastrado.</div>}
    {editing !== undefined && <ProductForm product={editing} saving={saving} error={error} onClose={() => setEditing(undefined)} onSubmit={async (event, product) => { if (await onSave(event, product)) setEditing(undefined); }} />}
  </section>;
}

function PlanosView({ planos, clientes, products, productKey, onProductChange, onNovo, onEditar, onAlternar, onAtribuir, salvando }) {
  const [editando, setEditando] = useState(null);
  const [tenantId, setTenantId] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [status, setStatus] = useState("active");
  const [erroAtivacao, setErroAtivacao] = useState("");
  const [sucessoAtivacao, setSucessoAtivacao] = useState("");
  const ativos = planos.filter((plano) => plano.active);
  const clientesProduto = clientes.filter((cliente) => cliente.product_key === productKey);
  function changeProduct(value) {
    setTenantId("");
    setPlanoId("");
    setErroAtivacao("");
    setSucessoAtivacao("");
    onProductChange(value);
  }
  async function ativarPlano() {
    setErroAtivacao("");
    setSucessoAtivacao("");
    try {
      await onAtribuir({ tenantId, planId: planoId, status });
      const cliente = clientes.find((item) => item.id === tenantId);
      const plano = planos.find((item) => item.id === planoId);
      setSucessoAtivacao(`${plano?.name || "Plano"} ativado para ${cliente?.name || "o cliente"}.`);
    } catch (error) {
      setErroAtivacao(error.message || "Não foi possível ativar o plano.");
    }
  }
  return <section className="tenants-view plans-view">
    <div className="view-heading"><div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2>Planos e assinaturas</h2><p>Defina os planos de cada projeto e ative a contratação por tenant.</p></div><div className="plan-heading-actions"><select value={productKey} onChange={(event) => changeProduct(event.target.value)}>{products.map((product) => <option key={product.id} value={product.slug}>{product.name}</option>)}</select><button onClick={onNovo} disabled={!productKey}>Novo plano</button></div></div>
    <details className="panel subscription-panel plan-assignment-collapsed"><summary><span><span className="eyebrow">OPCIONAL</span><strong>Assinaturas por cliente</strong><small>Use depois de criar os planos para liberar um plano para um tenant.</small></span><b>›</b></summary><div className="plan-assignment-body">{erroAtivacao && <div className="login-error">{erroAtivacao}</div>}{sucessoAtivacao && <div className="success-message">{sucessoAtivacao}</div>}<div className="plan-assignment"><label>Cliente<select value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="">Selecione um tenant</option>{clientesProduto.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.name} ({cliente.slug})</option>)}</select></label><label>Plano<select value={planoId} onChange={(event) => setPlanoId(event.target.value)}><option value="">Selecione um plano</option>{ativos.map((plano) => <option key={plano.id} value={plano.id}>{plano.name} — R$ {Number(plano.monthly_price || 0).toFixed(2).replace('.', ',')}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Ativo</option><option value="trial">Período de teste</option><option value="paused">Pausado</option><option value="cancelled">Cancelado</option></select></label><button type="button" disabled={!tenantId || !planoId || salvando} onClick={ativarPlano}>{salvando ? "Salvando..." : "Ativar assinatura"}</button></div></div></details>
    <div className="tenant-summary"><article><small>Planos cadastrados</small><strong>{planos.length}</strong></article><article><small>Planos ativos</small><strong>{ativos.length}</strong></article><article><small>Tenants com assinatura</small><strong>{clientesProduto.filter((cliente) => cliente.plan_id).length}</strong></article></div>
    <div className="plans-grid">{planos.map((plano) => { const features = readPlanFeatures(plano.features); return <article className="plan-card" key={plano.id}><div><span className="eyebrow">{plano.slug?.toUpperCase()}</span><h3>{plano.name}</h3><p>{plano.description || "Sem descrição cadastrada."}</p></div><strong className="plan-price">R$ {Number(plano.monthly_price || 0).toFixed(2).replace('.', ',')}<small>/mês</small></strong><small>IA: {features.aiQuestionsPerDay ?? 0}/dia · {features.courses?.length || 0} trilha(s)</small><small>{features.projects ? "Projetos liberados" : "Projetos limitados"} · {features.certificates ? "Certificados liberados" : "Sem certificados"}</small><div className="plan-actions"><button onClick={() => setEditando(plano)}>Editar recursos</button><button onClick={() => onAlternar(plano)}>{plano.active ? "Desativar" : "Ativar"}</button></div></article>; })}</div>
    {editando && <form className="modal-backdrop" onSubmit={(event) => { event.preventDefault(); onEditar(editando.id, new FormData(event.currentTarget)); setEditando(null); }}><div className="tenant-modal"><div className="view-heading"><div><span className="eyebrow">RECURSOS DO PLANO</span><h2>{editando.name}</h2></div><button type="button" onClick={() => setEditando(null)}>Fechar</button></div><label>Nome<input name="name" defaultValue={editando.name} required /></label><label>Descrição<input name="description" defaultValue={editando.description || ""} /></label><label>Mensalidade<input name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={editando.monthly_price || 0} /></label>{(() => { const features = readPlanFeatures(editando.features); return <><label>Trilhas liberadas<input name="courses" defaultValue={(features.courses || []).join(", ")} placeholder="html, css, javascript" /></label><label>Perguntas de IA por dia<input name="aiQuestionsPerDay" type="number" min="0" defaultValue={features.aiQuestionsPerDay ?? 0} /></label><label className="checkbox-row"><input name="projects" type="checkbox" defaultChecked={Boolean(features.projects)} /> Liberar projetos práticos</label><label className="checkbox-row"><input name="certificates" type="checkbox" defaultChecked={Boolean(features.certificates)} /> Liberar certificados</label></>; })()}<button className="tenant-submit" type="submit">Salvar recursos</button></div></form>}
  </section>;
}

function App() {
  const [secao, setSecao] = useState("visao");
  const [sessao, setSessao] = useState(() => { try { return JSON.parse(localStorage.getItem("vm_nexus_session") || "null"); } catch { return null; } });
  const [clientes, setClientes] = useState([]);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [planos, setPlanos] = useState([]);
  const [products, setProducts] = useState([]);
  const [planProductKey, setPlanProductKey] = useState("mesamanda");

  useEffect(() => { if (sessao?.token) listarTenants(sessao.token).then(({ tenants }) => setClientes(tenants)).catch((error) => setErro(error.message)); }, [sessao]);
  useEffect(() => { if (sessao?.token) listarProdutos(sessao.token).then(({ products: items }) => setProducts(items)).catch((error) => setErro(error.message)); }, [sessao]);
  useEffect(() => { if (sessao?.token && secao === "planos" && planProductKey) listarPlanos(sessao.token, planProductKey).then(({ plans }) => setPlanos(plans)).catch((error) => setErro(error.message)); }, [sessao, secao, planProductKey]);
  useEffect(() => { if (sessao?.token && tenantSelecionado?.id) listarUnidades(sessao.token, tenantSelecionado.id).then(({ units }) => setUnidades(units)).catch((error) => setErro(error.message)); }, [sessao, tenantSelecionado]);
  if (!sessao) return <Login onLogin={(data) => { localStorage.setItem("vm_nexus_session", JSON.stringify(data)); setSessao(data); }} />;
  if (secao === "planos") return <div className="nexus-app"><main><header className="topbar"><div><small>Central VM Nexus</small><strong>Planos e assinaturas</strong></div><div className="operator"><span>MN</span><div><strong>{sessao.admin.name}</strong><small>Administrador geral</small></div><button className="logout-button" onClick={() => setSecao("visao")}>Voltar</button></div></header><div className="workspace">{erro && <div className="login-error workspace-error">{erro}</div>}<PlanosView planos={planos} clientes={clientes} products={products} productKey={planProductKey} onProductChange={setPlanProductKey} onNovo={createPlan} onEditar={editPlan} onAlternar={togglePlan} onAtribuir={assignPlan} salvando={salvando} /></div></main></div>;

  async function refresh() { const { tenants } = await listarTenants(sessao.token); setClientes(tenants); }
  async function refreshPlans() { const { plans } = await listarPlanos(sessao.token, planProductKey); setPlanos(plans); }
  async function refreshProducts() { const { products: items } = await listarProdutos(sessao.token); setProducts(items); }
  async function createPlan() { const name = window.prompt("Nome do plano:", "Free"); if (!name) return; const monthlyPrice = window.prompt("Mensalidade em reais:", name.toLowerCase() === "free" ? "0" : "29.90"); if (monthlyPrice === null) return; const premium = name.toLowerCase().includes("premium"); const features = premium ? { courses: ["html", "css", "javascript", "react", "typescript", "node", "next", "python", "java", "csharp", "cpp"], aiQuestionsPerDay: 50, projects: true, certificates: true } : { courses: ["html", "css", "javascript"], aiQuestionsPerDay: 3, projects: false, certificates: false }; try { await criarPlano(sessao.token, { productKey: planProductKey, name, slug: name, description: `Plano ${name} do StudyCode`, monthlyPrice, features }); await refreshPlans(); } catch (error) { setErro(error.message); } }
  async function editPlan(planId, form) { const courses = String(form.get("courses") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean); const features = { courses, aiQuestionsPerDay: Number(form.get("aiQuestionsPerDay") || 0), projects: form.get("projects") === "on", certificates: form.get("certificates") === "on" }; try { await atualizarPlano(sessao.token, planId, { name: form.get("name"), description: form.get("description"), monthlyPrice: form.get("monthlyPrice"), features }); await refreshPlans(); } catch (error) { setErro(error.message); } }
  async function togglePlan(plan) { try { await alterarStatusPlano(sessao.token, plan.id, !plan.active); await refreshPlans(); } catch (error) { setErro(error.message); } }
  async function assignPlan({ tenantId, planId, status }) { setSalvando(true); try { await atribuirPlanoTenant(sessao.token, tenantId, { planId, status }); await refresh(); await refreshPlans(); setErro(""); } catch (error) { setErro(error.message); throw error; } finally { setSalvando(false); } }
  async function submitTenant(event, cliente = null) { event.preventDefault(); const formulario = event.currentTarget; setSalvando(true); setErro(""); const form = new FormData(formulario); try { if (formulario.classList.contains("billing-form")) { await atualizarCobrancaTenant(sessao.token, cliente.id, { dueDate: form.get("dueDate") || null, gracePeriodUntil: form.get("gracePeriodUntil") || null, billingStatus: form.get("billingStatus") }); } else { const payload = { name: form.get("name"), slug: form.get("slug"), productKey: form.get("productKey") }; if (cliente) await atualizarTenant(sessao.token, cliente.id, payload); else await criarTenant(sessao.token, payload); } await refresh(); setFormAberto(false); formulario.reset(); return true; } catch (error) { setErro(error.message); return false; } finally { setSalvando(false); } }
  async function saveProduct(event, product) { event.preventDefault(); const form = new FormData(event.currentTarget); const payload = { name: form.get("name"), slug: form.get("slug"), category: form.get("category"), description: form.get("description"), productType: form.get("productType"), status: form.get("status"), platforms: form.getAll("platforms") }; setSalvando(true); setErro(""); try { if (product?.id) await atualizarProduto(sessao.token, product.id, payload); else await criarProduto(sessao.token, payload); await refreshProducts(); return true; } catch (error) { setErro(error.message); return false; } finally { setSalvando(false); } }
  async function deleteProduct(product) { if (!window.confirm(`Excluir o projeto “${product.name}”?`)) return; setErro(""); try { await excluirProduto(sessao.token, product.id); await refreshProducts(); } catch (error) { setErro(error.message); } }
  async function toggleTenant(cliente) { try { await alterarStatusTenant(sessao.token, cliente.id, cliente.status === "suspended"); await refresh(); } catch (error) { setErro(error.message); } }
  async function deleteTenant(cliente) { if (!window.confirm(`Excluir a empresa “${cliente.name}”? Todas as unidades vinculadas também serão removidas.`)) return; try { await excluirTenant(sessao.token, cliente.id); await refresh(); if (tenantSelecionado?.id === cliente.id) setTenantSelecionado(null); } catch (error) { setErro(error.message); } }
  async function createUnit(event) { event.preventDefault(); const formulario = event.currentTarget; setSalvando(true); const form = new FormData(formulario); try { await criarUnidade(sessao.token, tenantSelecionado.id, { name: form.get("name"), slug: form.get("slug"), city: form.get("city"), state: form.get("state") }); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); await refresh(); formulario.reset(); } catch (error) { setErro(error.message); } finally { setSalvando(false); } }
  async function updateUnit(event, unidade) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await atualizarUnidade(sessao.token, tenantSelecionado.id, unidade.id, { name: form.get("name"), slug: form.get("slug"), city: form.get("city"), state: form.get("state") }); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); await refresh(); } catch (error) { setErro(error.message); } }
  async function toggleUnit(unidade) { try { await alterarStatusUnidade(sessao.token, tenantSelecionado.id, unidade.id, !unidade.active); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); } catch (error) { setErro(error.message); } }
  async function deleteUnit(unidade) { if (!window.confirm(`Excluir a unidade “${unidade.name}”? Essa ação não pode ser desfeita.`)) return; try { await excluirUnidade(sessao.token, tenantSelecionado.id, unidade.id); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); await refresh(); } catch (error) { setErro(error.message); } }

  const dashboard = <>
    <section className="metrics"><article><small>Produtos</small><strong>{products.length}</strong><span>{products.filter((product) => product.status === "development").length} em desenvolvimento</span></article><article><small>Clientes cadastrados</small><strong>{clientes.length}</strong><span>tenants administrados</span></article><article><small>Unidades</small><strong>{clientes.reduce((total, cliente) => total + Number(cliente.units || 0), 0)}</strong><span>vinculadas aos tenants</span></article><article><small>Alertas</small><strong>{clientes.filter((cliente) => cliente.access_level !== "full").length}</strong><span>acessos que pedem atenção</span></article></section>
    <div className="content-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">PORTFÓLIO</span><h2>Produtos da VM Nexus</h2></div><button onClick={() => setSecao("produtos")}>Gerenciar produtos</button></div><div className="product-list">{products.slice(0, 4).map((product) => <article key={product.id} className="product"><span className="product-icon">{product.name.slice(0, 2).toUpperCase()}</span><div><strong>{product.name}</strong><small>{product.category || TYPE_LABELS[product.product_type]}</small></div><em>{STATUS_LABELS[product.status]}</em></article>)}</div></section><section className="panel clients-panel"><div className="panel-heading"><div><span className="eyebrow">TENANTS</span><h2>Clientes recentes</h2></div><button onClick={() => setSecao("clientes")}>Ver clientes</button></div>{clientes.slice(0, 3).map((cliente) => <article className="client" key={cliente.id}><div><span className="client-mark">{cliente.name.slice(0, 2).toUpperCase()}</span><div><strong>{cliente.name}</strong><small>{cliente.product_key}</small></div></div></article>)}</section></div>
  </>;

  return <div className="nexus-app">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">VM</span><div><strong>VM Nexus</strong><small>Digital</small></div></div><nav aria-label="Navegação principal"><span className="nav-label">Central administrativa</span>{menu.map(([id, nome]) => <button key={id} className={secao === id ? "active" : ""} onClick={() => setSecao(id)}><span>{nome}</span><b>›</b></button>)}</nav><div className="sidebar-footer"><span className="status-dot" /><div><strong>Ambiente protegido</strong><small>Uso interno VM Nexus</small></div></div></aside>
    <main><header className="topbar"><div><small>Central VM Nexus</small><strong>{menu.find(([id]) => id === secao)?.[1]}</strong></div><div className="operator"><span>MN</span><div><strong>{sessao.admin.name}</strong><small>Administrador geral</small></div><button className="logout-button" onClick={() => { localStorage.removeItem("vm_nexus_session"); setSessao(null); }}>Sair</button></div></header><div className="workspace"><section className="hero"><div><span className="eyebrow">ECOSSISTEMA VM NEXUS</span><h1>Controle seus produtos e clientes em uma única central.</h1><p>Administre projetos, plataformas, tenants, unidades e planos em um ambiente privado.</p></div><div className="hero-badge"><span>●</span><strong>Central independente</strong><small>Nenhum cliente possui acesso</small></div></section>{erro && <div className="login-error workspace-error">{erro}</div>}{secao === "clientes" ? <><TenantsView clientes={clientes} products={products} onNovoCliente={() => setFormAberto(true)} onSelecionar={setTenantSelecionado} onEditar={submitTenant} onAlternar={toggleTenant} onExcluir={deleteTenant} />{tenantSelecionado?.id && <UnidadesView tenant={tenantSelecionado} unidades={unidades} onCriar={createUnit} onAtualizar={updateUnit} onAlternar={toggleUnit} onExcluir={deleteUnit} erro={erro} salvando={salvando} />}</> : secao === "produtos" ? <ProductsView products={products} onSave={saveProduct} onDelete={deleteProduct} saving={salvando} error={erro} /> : dashboard}</div><footer><span><i /> Sistema local disponível</span><span>VM Nexus Dashboard 0.2.0</span><span>Uso interno</span></footer></main>
    {formAberto && <div className="modal-backdrop"><form className="tenant-modal" onSubmit={(event) => submitTenant(event)}><div className="view-heading"><div><span className="eyebrow">NOVO TENANT</span><h2>Cadastrar cliente</h2></div><button type="button" onClick={() => setFormAberto(false)}>Fechar</button></div><label>Nome da empresa<input name="name" placeholder="Ex.: Churrascaria Paulistão" required /></label><label>Identificador<input name="slug" placeholder="churrascaria-paulistao" pattern="[a-z0-9-]+" required /></label><label>Produto<select name="productKey" defaultValue={products[0]?.slug}><ProductOptions products={products} /></select></label>{!products.length && <div className="login-error">Cadastre um projeto antes de criar o tenant.</div>}<button className="tenant-submit" type="submit" disabled={salvando || !products.length}>{salvando ? "Salvando..." : "Cadastrar cliente"}</button></form></div>}
  </div>;
}

export default App;
