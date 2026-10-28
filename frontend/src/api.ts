export type ChatMode = 'mock' | 'real';
export type ChatProvider = 'ollama' | 'openai';
export type ChatSource = string | { source: string; page: number; content: string; relevance_score?: number };
export type ChatMetrics = { retrieval_ms: number; generation_ms: number; best_relevance_score?: number };
export type ChatReply = { reply: string; mode: ChatMode; sources?: ChatSource[]; note?: string; metrics?: ChatMetrics };
export type RagStatus = {
  serviceOnline: boolean;
  status: string;
  indexed: boolean;
  index_error?: string | null;
  documents: string[];
  document_count: number;
  chunk_count: number;
  chunk_size?: number;
  chunk_overlap?: number;
  retrieval_k?: number;
  min_relevance_score?: number;
  collection?: string;
  embedding_model?: string;
  local_chat_model?: string;
  ollama_online?: boolean;
  installed_ollama_models?: string[];
  embedding_model_available?: boolean;
  local_chat_model_available?: boolean;
  openai_model?: string;
  openai_configured?: boolean;
  session: { answered_queries: number; average_retrieval_ms: number | null; average_generation_ms: number | null };
};

export async function getRagStatus(): Promise<RagStatus> {
  const response = await fetch('/api/health', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read RAG service status.');
  return response.json() as Promise<RagStatus>;
}

export async function rebuildIndex(): Promise<{ status: string; chunks: number; pdf_directory: string }> {
  const response = await fetch('/api/ingest', { method: 'POST' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not rebuild the PDF index.');
  }
  return response.json();
}

export async function sendMessage(message: string, mode: ChatMode, provider: ChatProvider): Promise<ChatReply> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode, provider }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'The assistant could not respond. Please try again.');
  }
  return response.json() as Promise<ChatReply>;
}
