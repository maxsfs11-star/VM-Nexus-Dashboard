import { useEffect, useState } from "react";
import {
  atualizarStudyCodeAula, atualizarStudyCodeDesafio, atualizarStudyCodeModulo,
  atualizarStudyCodeTrilha, criarStudyCodeAula, criarStudyCodeDesafio,
  criarStudyCodeModulo, criarStudyCodeTrilha, detalharStudyCodeConteudo,
  listarStudyCodeConteudo,
} from "./api";

function StudyCodeContentEditor({ project, token, tabs, tab, setTab, onBack, onError }) {
  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trackDraft, setTrackDraft] = useState({ name: "", description: "", active: true });
  const [newTrack, setNewTrack] = useState({ name: "", description: "" });
  const [newModule, setNewModule] = useState("");
  const [lessonDraft, setLessonDraft] = useState({ moduleId: null, name: "" });

  async function loadTracks(selectFirst = false) {
    setLoading(true);
    try {
      const result = await listarStudyCodeConteudo(token);
      setTracks(result.tracks);
      if (selectFirst || !selectedTrackId) setSelectedTrackId(result.tracks[0]?.id || null);
    } catch (error) { onError(error.message); } finally { setLoading(false); }
  }

  async function loadDetail(trackId = selectedTrackId) {
    if (!trackId) { setDetail(null); return; }
    try {
      const result = await detalharStudyCodeConteudo(token, trackId);
      setDetail(result);
      setTrackDraft({ name: result.track.name, description: result.track.description || "", active: result.track.active });
    } catch (error) { onError(error.message); }
  }

  // Content is loaded from the protected administration API when the editor opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadTracks(true); }, [token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadDetail(); }, [selectedTrackId]);

  async function refresh() { await Promise.all([loadTracks(), loadDetail()]); }
  async function saveTrack(event) {
    event.preventDefault();
    try { await atualizarStudyCodeTrilha(token, selectedTrackId, trackDraft); await refresh(); } catch (error) { onError(error.message); }
  }
  async function createTrack(event) {
    event.preventDefault();
    if (!newTrack.name.trim()) return;
    try {
      const result = await criarStudyCodeTrilha(token, newTrack);
      setNewTrack({ name: "", description: "" }); await loadTracks(); setSelectedTrackId(result.track.id);
    } catch (error) { onError(error.message); }
  }
  async function createModule(event) {
    event.preventDefault();
    if (!newModule.trim() || !selectedTrackId) return;
    try { await criarStudyCodeModulo(token, { trackId: selectedTrackId, name: newModule }); setNewModule(""); await refresh(); } catch (error) { onError(error.message); }
  }
  async function createLesson(event) {
    event.preventDefault();
    if (!lessonDraft.name.trim()) return;
    try { await criarStudyCodeAula(token, lessonDraft); setLessonDraft({ moduleId: null, name: "" }); await refresh(); } catch (error) { onError(error.message); }
  }
  async function createChallenge(lessonId) {
    const name = window.prompt("Nome do desafio");
    if (!name?.trim()) return;
    try { await criarStudyCodeDesafio(token, { lessonId, name: name.trim(), difficulty: "beginner" }); await refresh(); } catch (error) { onError(error.message); }
  }
  async function toggleModule(item) {
    try { await atualizarStudyCodeModulo(token, item.id, { name: item.name, description: item.description, active: !item.active }); await loadDetail(); } catch (error) { onError(error.message); }
  }
  async function toggleLesson(item) {
    try { await atualizarStudyCodeAula(token, item.id, { name: item.name, content: item.content, active: !item.active }); await loadDetail(); } catch (error) { onError(error.message); }
  }
  async function toggleChallenge(item) {
    try { await atualizarStudyCodeDesafio(token, item.id, { name: item.name, statement: item.statement, difficulty: item.difficulty, active: !item.active }); await loadDetail(); } catch (error) { onError(error.message); }
  }

  const modules = detail?.modules || [];
  const lessons = detail?.lessons || [];
  const challenges = detail?.challenges || [];

  return <section className="project-workspace"><button className="back-link" onClick={onBack}>← Todos os projetos</button><div className="project-workspace-head"><div><span className="eyebrow">STUDYCODE · CONTEÚDO</span><h1>{project.name}</h1><p>Crie e organize trilhas, módulos, aulas e desafios que os alunos verão no aplicativo.</p></div><span className="status-pill available">Editor publicado</span></div><nav className="workspace-tabs studycode-tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav><div className="content-builder"><aside className="content-track-list"><div className="section-heading"><div><span className="eyebrow">CATÁLOGO</span><h2>Trilhas</h2></div><button className="button-quiet" onClick={() => setSelectedTrackId(null)}>Nova</button></div>{tracks.map((track) => <button key={track.id} className={"content-track-option " + (selectedTrackId === track.id ? "selected" : "")} onClick={() => setSelectedTrackId(track.id)}><strong>{track.name}</strong><small>{track.modules} módulos · {track.lessons} aulas · {track.challenges} desafios</small><span className={"status-pill " + (track.active ? "available" : "planned")}>{track.active ? "Ativa" : "Rascunho"}</span></button>)}{loading && <p className="loading-note">Atualizando catálogo...</p>}{!tracks.length && <p className="empty-inline">Nenhuma trilha criada.</p>}<form className="content-builder-form" onSubmit={createTrack}><strong>Nova trilha</strong><input value={newTrack.name} onChange={(event) => setNewTrack({ ...newTrack, name: event.target.value })} placeholder="Nome da trilha" /><textarea value={newTrack.description} onChange={(event) => setNewTrack({ ...newTrack, description: event.target.value })} placeholder="Descrição curta" rows="2" /><button className="button-primary">Criar trilha</button></form></aside>{selectedTrackId && detail ? <main className="content-track-editor"><form className="content-editor-card" onSubmit={saveTrack}><div className="section-heading"><div><span className="eyebrow">TRILHA SELECIONADA</span><h2>Informações da trilha</h2></div><button className="button-primary">Salvar trilha</button></div><div className="editor-grid"><label>Nome<input value={trackDraft.name} onChange={(event) => setTrackDraft({ ...trackDraft, name: event.target.value })} /></label><label>Status<select value={trackDraft.active ? "active" : "draft"} onChange={(event) => setTrackDraft({ ...trackDraft, active: event.target.value === "active" })}><option value="active">Publicada</option><option value="draft">Rascunho</option></select></label></div><label>Descrição<textarea value={trackDraft.description} onChange={(event) => setTrackDraft({ ...trackDraft, description: event.target.value })} rows="3" /></label></form><section className="content-editor-card"><div className="section-heading"><div><span className="eyebrow">ESTRUTURA</span><h2>{modules.length} módulos</h2><p>Adicione aulas e desafios dentro de cada módulo.</p></div><form className="inline-create-form" onSubmit={createModule}><input value={newModule} onChange={(event) => setNewModule(event.target.value)} placeholder="Novo módulo" /><button className="button-quiet">Adicionar</button></form></div><div className="content-tree">{modules.map((module) => <article className="content-tree-item" key={module.id}><div className="content-tree-heading"><div><strong>{module.name}</strong><small>{lessons.filter((item) => item.module_id === module.id).length} aula(s)</small></div><button className="button-quiet" type="button" onClick={() => toggleModule(module)}>{module.active ? "Desativar" : "Publicar"}</button></div>{lessons.filter((item) => item.module_id === module.id).map((lesson) => <div className="content-tree-child" key={lesson.id}><div><strong>{lesson.name}</strong><small>{challenges.filter((item) => item.lesson_id === lesson.id).length} desafio(s)</small></div><div className="action-row"><button className="button-quiet" type="button" onClick={() => toggleLesson(lesson)}>{lesson.active ? "Desativar" : "Publicar"}</button><button className="button-quiet" type="button" onClick={() => createChallenge(lesson.id)}>+ Desafio</button></div>{challenges.filter((item) => item.lesson_id === lesson.id).map((challenge) => <div className="content-tree-challenge" key={challenge.id}><span><strong>{challenge.name}</strong><small>{challenge.difficulty}</small></span><button className="button-quiet" type="button" onClick={() => toggleChallenge(challenge)}>{challenge.active ? "Desativar" : "Publicar"}</button></div>)}{lessonDraft.moduleId === module.id ? <form className="inline-create-form" onSubmit={createLesson}><input autoFocus value={lessonDraft.name} onChange={(event) => setLessonDraft({ ...lessonDraft, name: event.target.value })} placeholder="Nome da aula" /><button className="button-quiet">Salvar aula</button></form> : <button className="text-link-button" type="button" onClick={() => setLessonDraft({ moduleId: module.id, name: "" })}>+ Adicionar aula</button>}</div>)}{!lessons.some((item) => item.module_id === module.id) && <p className="empty-inline">Este módulo ainda não tem aulas.</p>}</article>)}</div></section></main> : <section className="content-editor-card content-empty-state"><h2>Crie ou selecione uma trilha</h2><p>Comece cadastrando a primeira trilha de aprendizado do StudyCode.</p></section>}</div></section>;
}

export default StudyCodeContentEditor;
