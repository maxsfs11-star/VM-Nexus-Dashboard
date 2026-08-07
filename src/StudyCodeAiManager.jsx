import { useEffect, useMemo, useState } from "react";
import { atualizarStudyCodeLimiteIA, listarStudyCodeIA } from "./api";

function StudyCodeAiManager({ project, token, tabs, tab, setTab, onBack, onError }) {
  const [data, setData] = useState({ limits: [], history: [] });
  const [editing, setEditing] = useState({});
  const [provider, setProvider] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await listarStudyCodeIA(token)); } catch (error) { onError(error.message); } finally { setLoading(false); }
  };
  // The AI management view is synchronized with the protected administration API.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [token]);
  async function saveLimit(plan) {
    const dailyLimit = Number(editing[plan.id]);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 0) return;
    try { await atualizarStudyCodeLimiteIA(token, plan.id, dailyLimit); await load(); } catch (error) { onError(error.message); }
  }
  const providers = useMemo(() => ["all", ...new Set(data.history.map((item) => item.provider).filter(Boolean))], [data.history]);
  const history = data.history.filter((item) => (provider === "all" || item.provider === provider) && (item.student_name + " " + (item.student_email || "") + " " + item.question + " " + item.model).toLowerCase().includes(search.toLowerCase()));
  return <section className="project-workspace"><button className="back-link" onClick={onBack}>← Todos os projetos</button><div className="project-workspace-head"><div><span className="eyebrow">STUDYCODE · IA</span><h1>{project.name}</h1><p>Controle os limites de uso por plano e acompanhe qual modelo está respondendo aos alunos.</p></div><span className="status-pill available">Governança de IA</span></div><nav className="workspace-tabs studycode-tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav><section className="workspace-panel studycode-panel"><div className="section-heading"><div><span className="eyebrow">LIMITES POR PLANO</span><h2>Perguntas de IA por dia</h2><p>O limite salvo aqui será aplicado ao consumo diário de cada plano do StudyCode.</p></div><button className="button-quiet" onClick={load}>{loading ? "Atualizando..." : "Atualizar"}</button></div><div className="ai-limit-grid">{data.limits.map((plan) => <article className="ai-limit-card" key={plan.id}><div><span className="eyebrow">PLANO</span><h3>{plan.name}</h3><p>{plan.description || "Sem descrição cadastrada."}</p></div><label>Limite diário<input type="number" min="0" max="100000" value={editing[plan.id] ?? plan.daily_limit ?? 0} onChange={(event) => setEditing({ ...editing, [plan.id]: event.target.value })} /></label><div className="action-row"><strong>{plan.daily_limit || 0} perguntas/dia</strong><button className="button-primary" onClick={() => saveLimit(plan)}>Salvar limite</button></div></article>)}</div>{!data.limits.length && <div className="empty-card"><h3>Nenhum plano do StudyCode encontrado.</h3><p>Crie um plano em Planos e assinaturas para configurar o limite de IA.</p></div>}<div className="section-heading ai-history-heading"><div><span className="eyebrow">HISTÓRICO</span><h2>Perguntas dos alunos</h2><p>Veja o provedor, o modelo, o aluno e o volume de tokens consumido.</p></div><div className="action-row"><input className="directory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar aluno ou pergunta" /><select className="directory-filter" value={provider} onChange={(event) => setProvider(event.target.value)}>{providers.map((item) => <option key={item} value={item}>{item === "all" ? "Todos os provedores" : item}</option>)}</select></div></div><div className="student-table"><div className="student-table-head"><span>Aluno</span><span>Modelo</span><span>Pergunta</span><span>Data</span></div>{history.map((item) => <div className="student-row" key={item.id}><span><strong>{item.student_name || "Aluno removido"}</strong><small>{item.student_email || "Sem e-mail"}</small></span><span>{item.provider} / {item.model}<br /><small>{item.tokens_used || 0} tokens</small></span><span>{item.question}</span><span>{new Date(item.created_at).toLocaleString("pt-BR")}</span></div>)}</div>{!history.length && <div className="empty-card"><h3>Nenhuma pergunta encontrada.</h3><p>O histórico aparecerá quando os alunos usarem a IA.</p></div>}</section></section>;
}

export default StudyCodeAiManager;
