import { useEffect, useState } from "react";
import { listarAuditoria } from "./api";

const ACTION_LABELS = { "product.updated": "Projeto atualizado", "product.created": "Projeto criado", "product.deleted": "Projeto arquivado", "plan.updated": "Plano atualizado", "plan.created": "Plano criado", "plan.activated": "Plano ativado", "plan.deactivated": "Plano desativado", "tenant.updated": "Empresa atualizada", "tenant.created": "Empresa criada", "tenant.deleted": "Empresa removida", "tenant.subscription_updated": "Assinatura alterada", "unit.updated": "Unidade atualizada", "unit.created": "Unidade criada", "unit.deleted": "Unidade removida" };
const ENTITY_LABELS = { product: "Projeto", plan: "Plano", tenant: "Empresa", unit: "Unidade", subscription: "Assinatura" };
const FIELD_LABELS = { name: "Nome", status: "Status", monthlyPrice: "Valor mensal", productType: "Tipo", technology: "Tecnologia", technologies: "Tecnologias", platforms: "Plataformas", tenantEnabled: "Multi-tenant", planId: "Plano", planName: "Plano", billingStatus: "Cobrança", dueDate: "Vencimento", gracePeriodUntil: "Período de carência" };

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return { details: String(value) }; }
}
function displayValue(key, value) {
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (key === "monthlyPrice") return "R$ " + Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  return String(value ?? "—");
}

function AuditLogViewProfessional({ token, onError }) {
  const [logs, setLogs] = useState([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(false);
  async function load() { setLoading(true); try { setLogs((await listarAuditoria(token, search)).logs); } catch (error) { onError(error.message); } finally { setLoading(false); } }
  // Audit records are loaded from the protected administrative history endpoint.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [token]);
  function exportCsv() { const rows = logs.map((item) => [item.admin_name || item.admin_email || "Sistema", ACTION_LABELS[item.action] || item.action, ENTITY_LABELS[item.entity_type] || item.entity_type, new Date(item.created_at).toLocaleString("pt-BR"), JSON.stringify(parseMetadata(item.metadata))]); const csv = [["Administrador", "Ação", "Entidade", "Data", "Detalhes"], ...rows].map((row) => row.map((cell) => "\"" + String(cell).replaceAll("\"", "\"\"") + "\"").join(",")).join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "auditoria-vm-nexus.csv"; link.click(); URL.revokeObjectURL(url); }
  return <section className="page-section audit-page"><div className="page-heading"><div><span className="eyebrow">SEGURANÇA E GOVERNANÇA</span><h1>Auditoria</h1><p>Saiba quem alterou planos, projetos, empresas, permissões e conteúdo.</p></div><div className="action-row"><input className="directory-search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Buscar ação, entidade ou administrador" /><button className="button-quiet" onClick={load}>{loading ? "Atualizando..." : "Buscar"}</button><button className="button-quiet" onClick={exportCsv}>Exportar CSV</button></div></div><div className="audit-callout"><strong>Histórico protegido</strong><span>As alterações continuam completas no banco e no CSV; aqui elas aparecem em formato resumido.</span></div><div className="audit-table audit-table-readable"><div className="audit-head"><span>Administrador</span><span>Ação</span><span>Entidade</span><span>O que mudou</span><span>Data</span></div>{logs.map((item) => <div className="audit-row" key={item.id}><span><strong>{item.admin_name || "Sistema"}</strong><small>{item.admin_email || ""}</small></span><span><strong>{ACTION_LABELS[item.action] || item.action}</strong><small>{item.action}</small></span><span><span className="audit-entity-pill">{ENTITY_LABELS[item.entity_type] || item.entity_type}</span></span><span className="audit-details">{Object.entries(parseMetadata(item.metadata)).map(([key, value]) => <span className="audit-detail-chip" key={key}><small>{FIELD_LABELS[key] || key}</small><strong>{displayValue(key, value)}</strong></span>)}</span><span>{new Date(item.created_at).toLocaleString("pt-BR")}</span></div>)}</div>{!logs.length && <div className="empty-card"><h3>Nenhum registro encontrado.</h3><p>As próximas ações administrativas aparecerão aqui.</p></div>}</section>;
}

export default AuditLogViewProfessional;
