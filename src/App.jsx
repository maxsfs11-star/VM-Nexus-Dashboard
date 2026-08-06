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
  listarProdutos,
  criarProduto,
  atualizarProduto,
  alterarStatusProduto,
  criarPlano,
  atualizarPlano,
  alterarStatusPlano,
  atribuirPlanoTenant,
  listarTenants,
  listarUnidades,
  loginAdmin,
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

const produtos = [
  { nome: "MesaManda", categoria: "Food service", estado: "Em desenvolvimento", tom: "blue" },
  { nome: "VM Nexus Church", categoria: "Igrejas", estado: "Planejado", tom: "violet" },
  { nome: "Novos produtos", categoria: "Ecossistema SaaS", estado: "Pesquisa", tom: "cyan" },
];

function formatDate(value) {
  if (!value) return "Não definido";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não definido" : date.toLocaleDateString("pt-BR");
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

function TenantForm({ cliente, onSubmit, onClose }) {
  return <form className="tenant-inline-form" onSubmit={(event) => { onSubmit(event, cliente); onClose(); }}><label>Nome<input name="name" defaultValue={cliente.name} required /></label><label>Identificador<input name="slug" defaultValue={cliente.slug} pattern="[a-z0-9-]+" required /></label><label>Produto<select name="productKey" defaultValue={cliente.product_key || "mesamanda"}><option value="mesamanda">MesaManda</option><option value="vm-nexus-church">VM Nexus Church</option></select></label><button type="submit">Salvar alterações</button></form>;
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

// Kept temporarily as a reference while the tenant table is migrated to the clearer layout.
// eslint-disable-next-line no-unused-vars
function LegacyTenantsView({ clientes, onNovoCliente, onSelecionar, onEditar, onAlternar, onExcluir, onAtualizarCobranca = onEditar }) {
  const [opcoesId, setOpcoesId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [cobrancaId, setCobrancaId] = useState(null);
  return <section className="tenants-view"><div className="view-heading"><div><span className="eyebrow">ADMINISTRAÇÃO DE CLIENTES</span><h2>Clientes e tenants</h2><p>Cada tenant representa uma empresa isolada dentro do ecossistema VM Nexus.</p></div><button onClick={onNovoCliente}>Novo cliente</button></div><div className="tenant-summary"><article><small>Total de tenants</small><strong>{clientes.length}</strong></article><article><small>Tenants ativos</small><strong>{clientes.filter((cliente) => cliente.status !== "suspended").length}</strong></article><article><small>Produtos conectados</small><strong>{new Set(clientes.map((cliente) => cliente.product_key || cliente.produto)).size}</strong></article></div><div className="tenant-table"><div className="tenant-table-head"><span>Empresa</span><span>Produto</span><span>Unidades</span><span>Status e acesso</span></div>{clientes.map((cliente) => <div className="tenant-row" key={cliente.id || cliente.nome}><div><span className="client-mark">{(cliente.name || cliente.nome).slice(0, 2).toUpperCase()}</span><span><strong>{cliente.name || cliente.nome}</strong><small>{cliente.slug || "ambiente-local"}</small></span></div><span>{cliente.product_key || cliente.produto || "—"}</span><span>{cliente.units ?? cliente.unidades ?? 0}</span><div className="tenant-actions"><em className={cliente.status === "suspended" ? "unit-inactive" : "unit-active"}>{cliente.status || "Configuração"}</em><em className={`access-badge ${cliente.access_level || "full"}`}>{cliente.access_level === "blocked" ? "Acesso bloqueado" : cliente.access_level === "limited" ? "Acesso limitado" : "Acesso normal"}</em>{cliente.id && <><button onClick={() => onSelecionar(cliente)}>Unidades</button><button className="tenant-options-button" onClick={() => setOpcoesId(opcoesId === cliente.id ? null : cliente.id)}>Opções</button></>}</div>{opcoesId === cliente.id && <div className="tenant-options"><button onClick={() => setEditandoId(editandoId === cliente.id ? null : cliente.id)}>Editar empresa</button><button onClick={() => setCobrancaId(cobrancaId === cliente.id ? null : cliente.id)}>Cobrança e acesso</button><button onClick={() => onAlternar(cliente)}>{cliente.status === "suspended" ? "Ativar empresa" : "Desativar empresa"}</button><button className="unit-delete" onClick={() => onExcluir(cliente)}>Excluir empresa</button></div>}{editandoId === cliente.id && <TenantForm cliente={cliente} onSubmit={onEditar} onClose={() => setEditandoId(null)} />}{cobrancaId === cliente.id && <BillingForm cliente={cliente} onSubmit={onAtualizarCobranca} onClose={() => setCobrancaId(null)} />}</div>)}</div>{!clientes.length && <div className="empty-state">Nenhum tenant cadastrado ainda.</div>}</section>;
}

function TenantsView({ clientes, onNovoCliente, onSelecionar, onEditar, onAlternar, onExcluir, onAtualizarCobranca = onEditar }) {
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
        {editandoId === cliente.id && <TenantForm cliente={cliente} onSubmit={onEditar} onClose={() => setEditandoId(null)} />}
        {cobrancaId === cliente.id && <BillingForm cliente={cliente} onSubmit={onAtualizarCobranca} onClose={() => setCobrancaId(null)} />}
      </div>)}
    </div>{!clientes.length && <div className="empty-state">Nenhum tenant cadastrado ainda.</div>}
  </section>;
}

function UnidadesView({ tenant, unidades, onCriar, onAtualizar, onAlternar, onExcluir, erro, salvando }) {
  const [editandoId, setEditandoId] = useState(null);
  return <section className="units-view"><div className="view-heading"><div><span className="eyebrow">UNIDADES DO TENANT</span><h2>{tenant.name}</h2><p>Locais vinculados a este cliente e isolados pelo tenant.</p></div></div><div className="unit-content"><div className="unit-list">{unidades.map((unidade) => <article className="unit-card" key={unidade.id}><span className="client-mark">{unidade.name.slice(0, 2).toUpperCase()}</span><div><strong>{unidade.name}</strong><small>{unidade.slug} · {unidade.city || "Cidade não informada"}{unidade.state ? `/${unidade.state}` : ""}</small></div><em className={unidade.active ? "unit-active" : "unit-inactive"}>{unidade.active ? "Ativa" : "Desativada"}</em><div className="unit-card-actions"><button className="unit-edit" onClick={() => setEditandoId(editandoId === unidade.id ? null : unidade.id)}>{editandoId === unidade.id ? "Fechar" : "Editar"}</button><button className="unit-toggle" onClick={() => onAlternar(unidade)}>{unidade.active ? "Desativar" : "Ativar"}</button><button className="unit-delete" onClick={() => onExcluir(unidade)}>Excluir</button></div>{editandoId === unidade.id && <form className="unit-inline-form" onSubmit={(event) => { onAtualizar(event, unidade); setEditandoId(null); }}><label>Nome<input name="name" defaultValue={unidade.name} required /></label><label>Identificador<input name="slug" defaultValue={unidade.slug} pattern="[a-z0-9-]+" required /></label><div className="unit-form-grid"><label>Cidade<input name="city" defaultValue={unidade.city || ""} /></label><label>UF<input name="state" defaultValue={unidade.state || ""} maxLength="2" /></label></div><button type="submit">Salvar alterações</button></form>}</article>)}{!unidades.length && <div className="empty-state">Nenhuma unidade cadastrada para este tenant.</div>}</div><form className="unit-form" onSubmit={onCriar}><strong>Adicionar unidade</strong><label>Nome<input name="name" placeholder="Ex.: Matriz" required /></label><label>Identificador<input name="slug" placeholder="matriz" pattern="[a-z0-9-]+" required /></label><div className="unit-form-grid"><label>Cidade<input name="city" placeholder="Santa Fé do Sul" /></label><label>UF<input name="state" placeholder="SP" maxLength="2" /></label></div>{erro && <div className="login-error">{erro}</div>}<button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Adicionar unidade"}</button></form></div></section>;
}

function PlanosView({ planos, clientes, productKey, productOptions, onProductChange, onNovo, onEditar, onAlternar, onAtribuir, salvando }) {
  const [editando, setEditando] = useState(null);
  const [tenantId, setTenantId] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [status, setStatus] = useState("active");
  const [erroAtivacao, setErroAtivacao] = useState("");
  const [sucessoAtivacao, setSucessoAtivacao] = useState("");
  const ativos = planos.filter((plano) => plano.active);
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
    <div className="view-heading"><div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2>Planos e assinaturas</h2><p>Defina os planos do produto selecionado e ative o plano contratado por cada tenant.</p></div><button onClick={onNovo}>Novo plano</button></div>
    <div className="panel subscription-panel"><div className="panel-heading"><div><span className="eyebrow">PRODUTO</span><h2>Produto administrado</h2></div></div><label>Escolha o produto<select value={productKey} onChange={(event) => onProductChange(event.target.value)}>{productOptions.map((produto) => <option key={produto.slug} value={produto.slug}>{produto.name} ({produto.slug})</option>)}</select></label></div>
    <details className="panel subscription-panel plan-assignment-collapsed"><summary><span><span className="eyebrow">OPCIONAL</span><strong>Assinaturas por cliente</strong><small>Use depois de criar os planos para liberar um plano para um tenant.</small></span><b>›</b></summary><div className="plan-assignment-body">{erroAtivacao && <div className="login-error">{erroAtivacao}</div>}{sucessoAtivacao && <div className="success-message">{sucessoAtivacao}</div>}<div className="plan-assignment"><label>Cliente<select value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="">Selecione um tenant</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.name} ({cliente.slug})</option>)}</select></label><label>Plano<select value={planoId} onChange={(event) => setPlanoId(event.target.value)}><option value="">Selecione um plano</option>{ativos.map((plano) => <option key={plano.id} value={plano.id}>{plano.name} — R$ {Number(plano.monthly_price || 0).toFixed(2).replace('.', ',')}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Ativo</option><option value="trial">Período de teste</option><option value="paused">Pausado</option><option value="cancelled">Cancelado</option></select></label><button type="button" disabled={!tenantId || !planoId || salvando} onClick={ativarPlano}>{salvando ? "Salvando..." : "Ativar assinatura"}</button></div></div></details>
    <div className="tenant-summary"><article><small>Planos cadastrados</small><strong>{planos.length}</strong></article><article><small>Planos ativos</small><strong>{ativos.length}</strong></article><article><small>Tenants com assinatura</small><strong>{clientes.filter((cliente) => cliente.plan_id).length}</strong></article></div>
    <div className="plans-grid">{planos.map((plano) => <article className="plan-card" key={plano.id}><div><span className="eyebrow">{plano.slug?.toUpperCase()}</span><h3>{plano.name}</h3><p>{plano.description || "Sem descrição cadastrada."}</p></div><strong className="plan-price">R$ {Number(plano.monthly_price || 0).toFixed(2).replace('.', ',')}<small>/mês</small></strong><small>{plano.subscribers || 0} assinatura(s) ativa(s)</small><div className="plan-actions"><button onClick={() => setEditando(plano)}>Editar</button><button onClick={() => onAlternar(plano)}>{plano.active ? "Desativar" : "Ativar"}</button></div></article>)}</div>
    {editando && <form className="modal-backdrop" onSubmit={(event) => { event.preventDefault(); onEditar(editando.id, new FormData(event.currentTarget)); setEditando(null); }}><div className="tenant-modal"><div className="view-heading"><div><span className="eyebrow">EDITAR PLANO</span><h2>{editando.name}</h2></div><button type="button" onClick={() => setEditando(null)}>Fechar</button></div><label>Nome<input name="name" defaultValue={editando.name} required /></label><label>Descrição<input name="description" defaultValue={editando.description || ""} /></label><label>Mensalidade<input name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={editando.monthly_price || 0} /></label><button className="tenant-submit" type="submit">Salvar plano</button></div></form>}
  </section>;
}

function ProdutosView({ produtos, onNovo, onEditar, onAlternar }) {
  const [editando, setEditando] = useState(null);
  return <section className="tenants-view plans-view">
    <div className="view-heading"><div><span className="eyebrow">PORTFÓLIO VM NEXUS</span><h2>Produtos da VM Nexus</h2><p>Cadastre os aplicativos administrados pela central, como o StudyCode.</p></div><button onClick={onNovo}>Novo produto</button></div>
    <div className="tenant-summary"><article><small>Produtos cadastrados</small><strong>{produtos.length}</strong></article><article><small>Em desenvolvimento</small><strong>{produtos.filter((produto) => produto.status === "development").length}</strong></article><article><small>Planos conectados</small><strong>{produtos.reduce((total, produto) => total + Number(produto.plan_count || 0), 0)}</strong></article></div>
    <div className="plans-grid">{produtos.map((produto) => <article className="plan-card" key={produto.id}><div><span className="eyebrow">{produto.slug?.toUpperCase()}</span><h3>{produto.name}</h3><p>{produto.description || "Sem descrição cadastrada."}</p></div><small>{produto.plan_count || 0} plano(s) · {produto.tenant_count || 0} tenant(s)</small><strong>{produto.status === "development" ? "Em desenvolvimento" : produto.status === "available" ? "Disponível" : produto.status === "archived" ? "Arquivado" : "Planejado"}</strong><div className="plan-actions"><button onClick={() => setEditando(produto)}>Editar</button><button onClick={() => onAlternar(produto)}>{produto.status === "archived" ? "Reativar" : "Arquivar"}</button></div></article>)}</div>
    {editando && <form className="modal-backdrop" onSubmit={(event) => { event.preventDefault(); onEditar(editando.id, new FormData(event.currentTarget)); setEditando(null); }}><div className="tenant-modal"><div className="view-heading"><div><span className="eyebrow">EDITAR PRODUTO</span><h2>{editando.name}</h2></div><button type="button" onClick={() => setEditando(null)}>Fechar</button></div><label>Nome<input name="name" defaultValue={editando.name} required /></label><label>Descrição<input name="description" defaultValue={editando.description || ""} /></label><label>Status<select name="status" defaultValue={editando.status}><option value="development">Em desenvolvimento</option><option value="available">Disponível</option><option value="planned">Planejado</option><option value="archived">Arquivado</option></select></label><button className="tenant-submit" type="submit">Salvar produto</button></div></form>}
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
  const [produtosCadastrados, setProdutosCadastrados] = useState([]);
  const [planProductKey, setPlanProductKey] = useState("studycode");

  useEffect(() => { if (sessao?.token) listarTenants(sessao.token).then(({ tenants }) => setClientes(tenants)).catch((error) => setErro(error.message)); }, [sessao]);
  useEffect(() => { if (sessao?.token && secao === "planos") listarProdutos(sessao.token).then(({ products }) => { setProdutosCadastrados(products); if (!products.some((produto) => produto.slug === planProductKey) && products[0]) setPlanProductKey(products[0].slug); }).catch((error) => setErro(error.message)); }, [sessao, secao]);
  useEffect(() => { if (sessao?.token && secao === "planos" && planProductKey) listarPlanos(sessao.token, planProductKey).then(({ plans }) => setPlanos(plans)).catch((error) => setErro(error.message)); }, [sessao, secao, planProductKey]);
  useEffect(() => { if (sessao?.token && secao === "produtos") listarProdutos(sessao.token).then(({ products }) => setProdutosCadastrados(products)).catch((error) => setErro(error.message)); }, [sessao, secao]);
  useEffect(() => { if (sessao?.token && tenantSelecionado?.id) listarUnidades(sessao.token, tenantSelecionado.id).then(({ units }) => setUnidades(units)).catch((error) => setErro(error.message)); }, [sessao, tenantSelecionado]);
  if (!sessao) return <Login onLogin={(data) => { localStorage.setItem("vm_nexus_session", JSON.stringify(data)); setSessao(data); }} />;
  if (secao === "planos") return <div className="nexus-app"><main><header className="topbar"><div><small>Central VM Nexus</small><strong>Planos e assinaturas</strong></div><div className="operator"><span>MN</span><div><strong>{sessao.admin.name}</strong><small>Administrador geral</small></div><button className="logout-button" onClick={() => setSecao("visao")}>Voltar</button></div></header><div className="workspace"><PlanosView planos={planos} clientes={clientes} productKey={planProductKey} productOptions={produtosCadastrados} onProductChange={setPlanProductKey} onNovo={createPlan} onEditar={editPlan} onAlternar={togglePlan} onAtribuir={assignPlan} salvando={salvando} /></div></main></div>;
  if (secao === "produtos") return <div className="nexus-app"><main><header className="topbar"><div><small>Central VM Nexus</small><strong>Produtos VM Nexus</strong></div><div className="operator"><span>MN</span><div><strong>{sessao.admin.name}</strong><small>Administrador geral</small></div><button className="logout-button" onClick={() => setSecao("visao")}>Voltar</button></div></header><div className="workspace"><ProdutosView produtos={produtosCadastrados} onNovo={createProduct} onEditar={editProduct} onAlternar={toggleProduct} /></div></main></div>;

  async function refresh() { const { tenants } = await listarTenants(sessao.token); setClientes(tenants); }
  async function refreshPlans() { const { plans } = await listarPlanos(sessao.token, planProductKey); setPlanos(plans); }
  async function createPlan() { const name = window.prompt("Nome do plano:", "Free"); if (!name) return; const monthlyPrice = window.prompt("Mensalidade em reais:", name.toLowerCase() === "free" ? "0" : "29.90"); if (monthlyPrice === null) return; try { await criarPlano(sessao.token, { productKey: planProductKey, name, slug: name, description: `Plano ${name} do StudyCode`, monthlyPrice }); await refreshPlans(); } catch (error) { setErro(error.message); } }
  async function editPlan(planId, form) { try { await atualizarPlano(sessao.token, planId, { name: form.get("name"), description: form.get("description"), monthlyPrice: form.get("monthlyPrice") }); await refreshPlans(); } catch (error) { setErro(error.message); } }
  async function togglePlan(plan) { try { await alterarStatusPlano(sessao.token, plan.id, !plan.active); await refreshPlans(); } catch (error) { setErro(error.message); } }
  async function refreshProducts() { const { products } = await listarProdutos(sessao.token); setProdutosCadastrados(products); }
  async function createProduct() { const name = window.prompt("Nome do produto:", "StudyCode"); if (!name) return; const slug = window.prompt("Identificador:", name.toLowerCase().replace(/[^a-z0-9]+/g, "-")); if (!slug) return; const description = window.prompt("Descrição:", "Plataforma de ensino de programação da VM Nexus Digital."); try { await criarProduto(sessao.token, { name, slug, description, status: "development" }); await refreshProducts(); } catch (error) { setErro(error.message); } }
  async function editProduct(productId, form) { try { await atualizarProduto(sessao.token, productId, { name: form.get("name"), description: form.get("description"), status: form.get("status") }); await refreshProducts(); } catch (error) { setErro(error.message); } }
  async function toggleProduct(product) { try { await alterarStatusProduto(sessao.token, product.id, product.status === "archived" ? "development" : "archived"); await refreshProducts(); } catch (error) { setErro(error.message); } }
  async function assignPlan({ tenantId, planId, status }) { setSalvando(true); try { await atribuirPlanoTenant(sessao.token, tenantId, { planId, status }); await refresh(); await refreshPlans(); setErro(""); } catch (error) { setErro(error.message); throw error; } finally { setSalvando(false); } }
  async function submitTenant(event, cliente = null) { event.preventDefault(); const formulario = event.currentTarget; setSalvando(true); setErro(""); const form = new FormData(formulario); try { if (formulario.classList.contains("billing-form")) { await atualizarCobrancaTenant(sessao.token, cliente.id, { dueDate: form.get("dueDate") || null, gracePeriodUntil: form.get("gracePeriodUntil") || null, billingStatus: form.get("billingStatus") }); } else { const payload = { name: form.get("name"), slug: form.get("slug"), productKey: form.get("productKey") }; if (cliente) await atualizarTenant(sessao.token, cliente.id, payload); else await criarTenant(sessao.token, payload); } await refresh(); setFormAberto(false); formulario.reset(); } catch (error) { setErro(error.message); } finally { setSalvando(false); } }
  async function toggleTenant(cliente) { try { await alterarStatusTenant(sessao.token, cliente.id, cliente.status === "suspended"); await refresh(); } catch (error) { setErro(error.message); } }
  async function deleteTenant(cliente) { if (!window.confirm(`Excluir a empresa “${cliente.name}”? Todas as unidades vinculadas também serão removidas.`)) return; try { await excluirTenant(sessao.token, cliente.id); await refresh(); if (tenantSelecionado?.id === cliente.id) setTenantSelecionado(null); } catch (error) { setErro(error.message); } }
  async function createUnit(event) { event.preventDefault(); const formulario = event.currentTarget; setSalvando(true); const form = new FormData(formulario); try { await criarUnidade(sessao.token, tenantSelecionado.id, { name: form.get("name"), slug: form.get("slug"), city: form.get("city"), state: form.get("state") }); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); await refresh(); formulario.reset(); } catch (error) { setErro(error.message); } finally { setSalvando(false); } }
  async function updateUnit(event, unidade) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await atualizarUnidade(sessao.token, tenantSelecionado.id, unidade.id, { name: form.get("name"), slug: form.get("slug"), city: form.get("city"), state: form.get("state") }); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); await refresh(); } catch (error) { setErro(error.message); } }
  async function toggleUnit(unidade) { try { await alterarStatusUnidade(sessao.token, tenantSelecionado.id, unidade.id, !unidade.active); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); } catch (error) { setErro(error.message); } }
  async function deleteUnit(unidade) { if (!window.confirm(`Excluir a unidade “${unidade.name}”? Essa ação não pode ser desfeita.`)) return; try { await excluirUnidade(sessao.token, tenantSelecionado.id, unidade.id); const { units } = await listarUnidades(sessao.token, tenantSelecionado.id); setUnidades(units); await refresh(); } catch (error) { setErro(error.message); } }

  return <div className="nexus-app"><aside className="sidebar"><div className="brand"><span className="brand-mark">VM</span><div><strong>VM Nexus</strong><small>Digital</small></div></div><nav aria-label="Navegação principal"><span className="nav-label">Central administrativa</span>{menu.map(([id, nome]) => <button key={id} className={secao === id ? "active" : ""} onClick={() => setSecao(id)}><span>{nome}</span><b>›</b></button>)}</nav><div className="sidebar-footer"><span className="status-dot" /><div><strong>Ambiente protegido</strong><small>Uso interno VM Nexus</small></div></div></aside><main><header className="topbar"><div><small>Central VM Nexus</small><strong>{menu.find(([id]) => id === secao)?.[1]}</strong></div><div className="operator"><span>MN</span><div><strong>{sessao.admin.name}</strong><small>Administrador geral</small></div><button className="logout-button" onClick={() => { localStorage.removeItem("vm_nexus_session"); setSessao(null); }}>Sair</button></div></header><div className="workspace"><section className="hero"><div><span className="eyebrow">ECOSSISTEMA VM NEXUS</span><h1>Controle seus produtos e clientes em uma única central.</h1><p>Este aplicativo é independente dos sistemas dos clientes. Aqui ficam a administração dos tenants, planos, módulos, suporte e crescimento da VM Nexus Digital.</p></div><div className="hero-badge"><span>●</span><strong>Central independente</strong><small>Nenhum cliente possui acesso</small></div></section>{erro && <div className="login-error workspace-error">{erro}</div>}{secao === "clientes" ? <><TenantsView clientes={clientes} onNovoCliente={() => setFormAberto(true)} onSelecionar={(tenant) => setTenantSelecionado(tenant)} onEditar={submitTenant} onAlternar={toggleTenant} onExcluir={deleteTenant} />{tenantSelecionado?.id && <UnidadesView tenant={tenantSelecionado} unidades={unidades} onCriar={createUnit} onAtualizar={updateUnit} onAlternar={toggleUnit} onExcluir={deleteUnit} erro={erro} salvando={salvando} />}</> : <><section className="metrics"><article><small>Produtos</small><strong>1</strong><span>1 em desenvolvimento</span></article><article><small>Clientes cadastrados</small><strong>{clientes.length}</strong><span>tenants administrados</span></article><article><small>Unidades</small><strong>{clientes.reduce((total, cliente) => total + Number(cliente.units || 0), 0)}</strong><span>vinculadas aos tenants</span></article><article><small>Alertas</small><strong>0</strong><span>nenhuma ação pendente</span></article></section><div className="content-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">PORTFÓLIO</span><h2>Produtos da VM Nexus</h2></div><button>Gerenciar produtos</button></div><div className="product-list">{produtos.map((produto) => <article key={produto.nome} className={`product ${produto.tom}`}><span className="product-icon">{produto.nome.slice(0, 2).toUpperCase()}</span><div><strong>{produto.nome}</strong><small>{produto.categoria}</small></div><em>{produto.estado}</em></article>)}</div></section><section className="panel clients-panel"><div className="panel-heading"><div><span className="eyebrow">TENANTS</span><h2>Clientes recentes</h2></div><button onClick={() => setSecao("clientes")}>Ver clientes</button></div>{clientes.slice(0, 3).map((cliente) => <article className="client" key={cliente.id || cliente.nome}><div><span className="client-mark">AV</span><div><strong>{cliente.name || cliente.nome}</strong><small>{cliente.product_key || cliente.produto}</small></div></div></article>)}</section></div><section className="roadmap"><div><span className="eyebrow">PRÓXIMA FUNDAÇÃO</span><h2>Backend administrativo da VM Nexus</h2><p>A próxima etapa conecta planos, módulos, assinaturas e permissões administrativas.</p></div><ol><li><b>01</b> Autenticação VM Nexus</li><li><b>02</b> Clientes e tenants</li><li><b>03</b> Planos e assinaturas</li><li><b>04</b> Auditoria e suporte</li></ol></section></>}</div><footer><span><i /> Sistema local disponível</span><span>VM Nexus Dashboard 0.1.0</span><span>Uso interno</span></footer></main>{formAberto && <div className="modal-backdrop"><form className="tenant-modal" onSubmit={(event) => submitTenant(event)}><div className="view-heading"><div><span className="eyebrow">NOVO TENANT</span><h2>Cadastrar cliente</h2></div><button type="button" onClick={() => setFormAberto(false)}>Fechar</button></div><label>Nome da empresa<input name="name" placeholder="Ex.: Churrascaria Paulistão" required /></label><label>Identificador<input name="slug" placeholder="churrascaria-paulistao" pattern="[a-z0-9-]+" required /></label><label>Produto<select name="productKey" defaultValue="mesamanda"><option value="mesamanda">MesaManda</option><option value="vm-nexus-church">VM Nexus Church</option></select></label><button className="tenant-submit" type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Cadastrar cliente"}</button></form></div>}</div>;
}

export default App;
