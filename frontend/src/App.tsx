import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, BrainCircuit, Check, CircleHelp, Command, Database, FileText, FlaskConical, Layers3, MessageSquare, RefreshCw, Search, Sparkles, SquarePen, Workflow, Zap, type LucideIcon } from 'lucide-react';
import { getRagStatus, rebuildIndex, sendMessage, type ChatMode, type ChatProvider, type ChatSource, type RagStatus } from './api';

const emptyStatus: RagStatus = {
  serviceOnline: false,
  status: 'offline',
  indexed: false,
  index_error: 'Could not connect to the Python RAG service.',
  documents: [],
  document_count: 0,
  chunk_count: 0,
  session: { answered_queries: 0, average_retrieval_ms: null, average_generation_ms: null },
};

const initialMessages: Message[] = [{
  role: 'assistant',
  content: 'Ask a question about the PDFs in your local knowledge base. Switch to Real RAG to retrieve document passages and generate a grounded answer.',
  time: nowTime(),
}];

function App() {
  const [mode, setMode] = useState<ChatMode>('real');
  const [provider, setProvider] = useState<ChatProvider>('ollama');
  const [status, setStatus] = useState<RagStatus>(emptyStatus);
  const location = useLocation();
  const isChat = location.pathname === '/chat';

  const refreshStatus = async () => {
    try {
      setStatus(await getRagStatus());
    } catch {
      setStatus(emptyStatus);
    }
  };

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [location.pathname, location.hash]);

  const runReindex = async () => {
    try {
      await rebuildIndex();
    } finally {
      await refreshStatus();
    }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span /><span /><span /><span /></div>
        <span className="brand-name">recall<span className="brand-period">.</span></span>
        <div className="workspace-switch"><span className="workspace-avatar">L</span><span className="workspace-text"><b>Local workspace</b><small>PDF knowledge base</small></span></div>
      </div>
      <div className="side-scroll">
        <div className="nav-label">WORKSPACE</div>
        <NavLink to="/rag-flow" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Workflow size={17} /><span>RAG flow</span></NavLink>
        <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><MessageSquare size={17} /><span>Chat</span></NavLink>
        <Link className="nav-item" to="/rag-flow#sources"><BookOpen size={17} /><span>Knowledge base</span></Link>

        <div className="nav-label source-label">INDEXED PDFS <span>{status.document_count}</span></div>
        {status.documents.length ? status.documents.map(name =>
          <div className="source-row" key={name}><span className="source-icon pdf"><FileText size={14} /></span><span title={name}>{name}</span><span className="source-dot" /></div>,
        ) : <div className="sidebar-empty">{status.serviceOnline ? 'No indexed PDFs' : 'Python service offline'}</div>}
      </div>
      <div className="sidebar-bottom">
        <div className="usage-card">
          <div className="usage-top"><span>ChromaDB index</span><span>{status.indexed ? 'Ready' : '—'}</span></div>
          <div className="usage-bar"><i style={{ width: status.indexed ? '100%' : '0%' }} /></div>
          <div className="usage-foot">{status.chunk_count.toLocaleString()} <span>chunks indexed</span></div>
          <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">Python API docs <ArrowRight size={12} /></a>
        </div>
        <div className="profile"><span className="profile-avatar">L</span><span className="profile-info"><b>Local RAG</b><small>{status.serviceOnline ? 'Python service online' : 'Python service offline'}</small></span></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>Local workspace</span><span className="crumb-slash">/</span><b>{isChat ? 'Chat' : 'RAG flow'}</b><span className={`live-pill ${status.indexed ? 'is-online' : 'is-offline'}`}><i />{status.indexed ? 'Index ready' : status.serviceOnline ? 'No index' : 'Service offline'}</span></div>
        <div className="top-actions"><a className="help-button" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer"><CircleHelp size={15} /><span>API docs</span></a></div>
      </header>
      <div className="page-content">
        <Routes>
          <Route path="/" element={<Navigate to="/rag-flow" replace />} />
          <Route path="/rag-flow" element={<FlowPage mode={mode} setMode={setMode} provider={provider} status={status} onRefresh={refreshStatus} onReindex={runReindex} />} />
          <Route path="/chat" element={<ChatPage mode={mode} setMode={setMode} provider={provider} setProvider={setProvider} status={status} onRefresh={refreshStatus} />} />
          <Route path="*" element={<Navigate to="/rag-flow" replace />} />
        </Routes>
      </div>
    </main>
  </div>;
}

function ModeControl({ mode, setMode }: { mode: ChatMode; setMode: (mode: ChatMode) => void }) {
  return <div className="mode-control"><span className="mode-label">RUN MODE</span><div className="mode-switch">
    <button type="button" onClick={() => setMode('mock')} className={mode === 'mock' ? 'selected' : ''}><FlaskConical size={14} />Mock</button>
    <button type="button" onClick={() => setMode('real')} className={mode === 'real' ? 'selected real-selected' : ''}><Zap size={14} />Real RAG</button>
  </div></div>;
}

function ProviderControl({ provider, setProvider }: { provider: ChatProvider; setProvider: (provider: ChatProvider) => void }) {
  return <div className="mode-control provider-control"><span className="mode-label">ANSWER MODEL</span><div className="mode-switch">
    <button type="button" onClick={() => setProvider('ollama')} className={provider === 'ollama' ? 'selected' : ''}><FlaskConical size={14} />Local Ollama</button>
    <button type="button" onClick={() => setProvider('openai')} className={provider === 'openai' ? 'selected real-selected' : ''}><Zap size={14} />OpenAI</button>
  </div></div>;
}

type Stage = { title: string; key: string; icon: LucideIcon; color: string; desc: string; status: string; meta: string; ready: boolean };
type FlowProps = { mode: ChatMode; setMode: (mode: ChatMode) => void; provider: ChatProvider; status: RagStatus; onRefresh: () => Promise<void>; onReindex: () => Promise<void> };

function FlowPage({ mode, setMode, provider, status, onRefresh, onReindex }: FlowProps) {
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setActionMessage('');
    setActionError('');
    try { await action(); setActionMessage(success); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const stages: Stage[] = [
    { title: 'Data ingestion', key: '01', icon: FileText, color: 'blue', desc: 'PDF files loaded by the Python service', status: status.serviceOnline ? `${status.document_count} indexed PDF(s)` : 'Python service offline', meta: status.documents.length ? status.documents.join(' · ') : 'No indexed files', ready: status.serviceOnline && status.document_count > 0 },
    { title: 'Chunking', key: '02', icon: Layers3, color: 'violet', desc: 'Text split into overlapping passages', status: `${status.chunk_count.toLocaleString()} chunks`, meta: `${status.chunk_size ?? 500} characters · ${status.chunk_overlap ?? 50} overlap`, ready: status.chunk_count > 0 },
    { title: 'Embeddings', key: '03', icon: BrainCircuit, color: 'amber', desc: 'Local vectors used for semantic search', status: status.embedding_model_available ? `${status.embedding_model} installed` : status.ollama_online ? `${status.embedding_model} not installed` : 'Ollama is offline', meta: 'Ollama · local', ready: !!status.embedding_model_available },
    { title: 'Vector database', key: '04', icon: Database, color: 'green', desc: 'Persistent local vector collection', status: status.indexed ? 'ChromaDB ready' : 'ChromaDB unavailable', meta: status.collection ?? 'No collection reported', ready: status.indexed },
    { title: 'Retrieval', key: '05', icon: Search, color: 'pink', desc: 'Only passages above the relevance threshold reach the answer model', status: status.session.average_retrieval_ms == null ? 'No measured queries yet' : `Average ${formatMs(status.session.average_retrieval_ms)}`, meta: `Top ${status.retrieval_k ?? 5} · score ≥ ${(status.min_relevance_score ?? 0.1).toFixed(2)}`, ready: status.indexed },
    { title: 'Generation', key: '06', icon: Sparkles, color: 'mint', desc: 'Answer composed from retrieved passages', status: provider === 'openai' ? (status.openai_configured ? 'OpenAI configured' : 'OpenAI key not configured') : status.local_chat_model_available ? `${status.local_chat_model} installed` : status.ollama_online ? `${status.local_chat_model} not installed` : 'Ollama is offline', meta: provider === 'openai' ? (status.openai_model ?? 'OpenAI') : 'Ollama · local', ready: status.indexed && (provider === 'ollama' ? !!status.local_chat_model_available : !!status.openai_configured) },
  ];

  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-icon"><Workflow size={13} /></span> LIVE LOCAL PIPELINE</div><h1>RAG flow<span className="title-dot">.</span></h1><p className="page-subtitle">Pipeline details reported by your Python service and ChromaDB index.</p></div><ModeControl mode={mode} setMode={setMode} /></div>
    <div className="flow-toolbar">
      <div className="flow-status"><span className="status-icon"><Activity size={15} /></span><div><b>{status.indexed ? 'Index is ready' : status.serviceOnline ? 'Index is not ready' : 'Python service is offline'}</b><span>{status.indexed ? `${status.document_count} PDFs · ${status.chunk_count} chunks` : status.index_error || 'Check the service and the local PDF directory.'}</span></div></div>
      <div className="toolbar-right"><button className="toolbar-button" onClick={() => void runAction(onRefresh, 'Status refreshed.')} disabled={busy}><RefreshCw size={14} /> Refresh status</button><button className="reindex-button" onClick={() => void runAction(onReindex, 'PDF index rebuilt successfully.')} disabled={busy || !status.serviceOnline}><Database size={14} />{busy ? 'Indexing…' : 'Re-index PDFs'}</button></div>
    </div>
    {(actionMessage || actionError) && <div className={`action-message ${actionError ? 'error' : ''}`}>{actionError || actionMessage}</div>}
    <section className="pipeline"><div className="pipeline-caption"><span>PIPELINE CONFIGURATION</span><span className={`stage-count ${status.indexed ? '' : 'muted'}`}>{status.indexed ? 'INDEX READY' : 'WAITING FOR INDEX'}</span></div><div className="pipeline-list">{stages.map((stage, index) => { const Icon = stage.icon; return <div className="pipeline-item" key={stage.key}><article className={`stage-card stage-${stage.color}`}><div className="stage-top"><div className="stage-icon"><Icon size={17} strokeWidth={1.9} /></div><span className="stage-index">{stage.key}</span></div><h3>{stage.title}</h3><p className="stage-desc">{stage.desc}</p><div className="stage-meta"><span className={`stage-live ${stage.ready ? 'is-ready' : 'is-waiting'}`}><i />{stage.status}</span><span className="stage-params" title={stage.meta}>{stage.meta}</span></div></article>{index < stages.length - 1 && <div className="stage-connector"><span /><ArrowRight size={13} /></div>}</div>; })}</div></section>
    <div className="flow-lower">
      <div className="lower-card activity-card"><div className="card-heading"><div><div className="card-kicker">LIVE SESSION METRICS</div><h3>Measured pipeline activity</h3></div><span className="session-badge">Since Python service start</span></div>
        <div className="metrics live-metrics">
          <Metric label="Indexed PDFs" value={status.document_count.toLocaleString()} />
          <Metric label="Chunks in ChromaDB" value={status.chunk_count.toLocaleString()} />
          <Metric label="Queries handled" value={status.session.answered_queries.toLocaleString()} />
          <Metric label="Avg. retrieval" value={formatMs(status.session.average_retrieval_ms)} />
          <Metric label="Avg. generation" value={formatMs(status.session.average_generation_ms)} />
        </div>
        <div className="model-details"><span>Embedding <b>{status.embedding_model ?? '—'}</b></span><span>Local LLM <b>{status.local_chat_model ?? '—'}</b></span><span>Collection <b>{status.collection ?? '—'}</b></span></div>
      </div>
      <div className="lower-card quickstart-card sources-card" id="sources"><div className="quick-orb"><BookOpen size={17} /></div><div className="card-kicker">INDEXED SOURCES</div><h3>{status.document_count ? `${status.document_count} PDF file(s)` : 'No PDFs indexed yet'}</h3><div className="indexed-files">{status.documents.length ? status.documents.map(file => <div className="indexed-file" key={file}><FileText size={13} /><span title={file}>{file}</span><Check size={12} /></div>) : <p>Place PDF files in the configured local folder, then re-index.</p>}</div><NavLink to="/chat" className="try-chat">Ask about these files <ArrowRight size={14} /></NavLink></div>
    </div>
    <footer className="page-footer"><span><Command size={12} /> Local RAG workspace</span><span>{status.serviceOnline ? 'Python API online' : 'Python API offline'} <i /></span></footer>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><div><b>{value}</b></div></div>;
}

type Message = { role: 'assistant' | 'user'; content: string; time: string; sources?: ChatSource[]; note?: string };
type ChatProps = { mode: ChatMode; setMode: (mode: ChatMode) => void; provider: ChatProvider; setProvider: (provider: ChatProvider) => void; status: RagStatus; onRefresh: () => Promise<void> };

function ChatPage({ mode, setMode, provider, setProvider, status, onRefresh }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = messagesAreaRef.current;
    if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, error]);

  const submit = async (text = input) => {
    const question = text.trim();
    if (!question || loading) return;
    setInput('');
    setError('');
    setMessages(current => [...current, { role: 'user', content: question, time: nowTime() }]);
    setLoading(true);
    try {
      const result = await sendMessage(question, mode, provider);
      const scoreNote = result.metrics?.best_relevance_score == null ? '' : ` · score ${result.metrics.best_relevance_score.toFixed(2)}`;
      const metricNote = result.metrics ? `Retrieval ${formatMs(result.metrics.retrieval_ms)}${scoreNote} · generation ${formatMs(result.metrics.generation_ms)}` : undefined;
      setMessages(current => [...current, { role: 'assistant', content: result.reply, time: nowTime(), sources: result.sources, note: result.note ?? metricNote }]);
      if (mode === 'real') void onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the assistant. Check the backend and try again.');
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([{ role: 'assistant', content: 'New conversation. Ask a question about the indexed PDFs.', time: nowTime() }]);
    setInput('');
    setError('');
  };

  return <>
    <div className="chat-heading"><div><div className="eyebrow"><span className="eyebrow-icon"><MessageSquare size={13} /></span> ASK YOUR LOCAL DOCUMENTS</div><h1>Ask away<span className="title-dot">.</span></h1><p className="page-subtitle">{status.indexed ? `Searching ${status.document_count} indexed PDF(s) and ${status.chunk_count} chunks.` : 'The local document index is not ready yet.'}</p></div><div className="chat-controls"><ModeControl mode={mode} setMode={setMode} /><ProviderControl provider={provider} setProvider={setProvider} /></div></div>
    <section className="chat-panel">
      <div className="chat-toolbar"><div className="chat-title"><span className="assistant-avatar"><div className="brand-mark mini"><span /><span /><span /><span /></div></span><div><b>Local knowledge assistant</b><span><i className={`online-dot ${status.indexed ? '' : 'offline-dot'}`} />{mode === 'mock' ? 'Mock reply · no retrieval' : `Real RAG · ${provider === 'ollama' ? 'Ollama local' : 'OpenAI generation'}`}</span></div></div><div className="chat-tools"><button className="icon-button new-chat-button" onClick={startNewChat} title="Start a new conversation"><SquarePen size={16} /><span>New chat</span></button></div></div>
      <div className="messages-area" ref={messagesAreaRef}>
        <div className="conversation-date"><span />{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}<span /></div>
        {messages.map((message, index) => <div className={`message-row ${message.role}`} key={index}><div className={`message-avatar ${message.role}`}>{message.role === 'assistant' ? <div className="brand-mark mini"><span /><span /><span /><span /></div> : 'L'}</div><div className="message-body"><div className="message-meta"><b>{message.role === 'assistant' ? 'Recall assistant' : 'You'}</b><span>{message.time}</span></div><div className={`message-bubble ${message.role}`}>{message.content}</div>{message.sources && message.sources.length > 0 && <div className="citations"><span className="citation-label">SOURCES</span>{message.sources.map((source, sourceIndex) => { const label = typeof source === 'string' ? source : `${source.source} · p. ${source.page}`; const tooltip = typeof source === 'string' ? source : source.content; return <span className="citation-chip" key={`${label}-${sourceIndex}`} title={tooltip}><FileText size={11} />{label}</span>; })}</div>}{message.note && <div className="mode-note"><Activity size={12} />{message.note}</div>}</div></div>)}
        {loading && <div className="message-row assistant"><div className="message-avatar assistant"><div className="brand-mark mini"><span /><span /><span /><span /></div></div><div className="message-body"><div className="message-meta"><b>Recall assistant</b><span>working…</span></div><div className="typing-bubble"><span /><span /><span /></div></div></div>}
        {error && <div className="error-message">{error}</div>}
      </div>
      <div className="suggestions"><span>TRY ASKING</span>{['מה המדיניות במסמכים?', 'סכם את קורות החיים', 'What are the main points?'].map(prompt => <button key={prompt} onClick={() => void submit(prompt)} disabled={loading}>{prompt}<ArrowRight size={12} /></button>)}</div>
      <form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Ask about the indexed PDFs…" rows={1} /><div className="composer-bottom"><span className="composer-hint"><span>↵</span> to send <span className="hint-gap">⇧ ↵</span> new line</span><button className="send-button" disabled={!input.trim() || loading || (mode === 'real' && !status.indexed)} aria-label="Send message"><ArrowRight size={16} /></button></div></form>
      <div className="chat-footnote"><Sparkles size={12} />{mode === 'mock' ? 'Mock replies do not search the documents.' : 'Retrieved text and generation times are shown below each answer.'}</div>
      {mode === 'real' && provider === 'openai' && <div className="provider-disclosure">{status.openai_configured ? 'The question and retrieved excerpts are sent to OpenAI. Embeddings and retrieval stay local.' : 'Add OPENAI_API_KEY to backend/python_service/.env and restart the Python service to enable OpenAI.'}</div>}
    </section>
    <footer className="page-footer"><span><Command size={12} /> Local RAG workspace</span><span>{status.session.answered_queries} questions answered this session <i /></span></footer>
  </>;
}

function formatMs(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(1)} ms`;
}

function nowTime() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

export default App;
