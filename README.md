# Recall — RAG workspace

A React + TypeScript workspace, Express API, and local Python RAG service powered by Ollama.

# Goal

The project you have built is an end-to-end interactive RAG (Retrieval-Augmented Generation) platform—a simulator and chat interface—that combines a modern full-stack architecture with an open-source, local AI engine. The system is built using a microservices architecture and is divided into three core layers: Project Objective To demonstrate, study, and optimize the RAG (Retrieval-Augmented Generation) process while maintaining full ownership of both the data and the code. The system allows users to visually understand how data is transformed into vectors and subsequently retrieved, as well as to engage in a live, document-based conversation with a local language model eliminating cloud costs while ensuring complete privacy.

## Project layout

```text
frontend/   React, TypeScript, Vite, Tailwind CSS
backend/
  src/              Node.js, Express API
  python_service/
    main.py         FastAPI application entry point
    app/            RAG service modules (API, config, ingestion, retrieval, storage)
    data/           Local PDFs and persistent ChromaDB index
```

The frontend and backend have independent package manifests. Run each from its own directory.

## Run locally

Install and start Ollama, then download the local models:

```bash
ollama pull bge-m3
ollama pull qwen3:8b
```

Put one or more readable PDF files in `backend/python_service/data/pdfs/`. Then, in three terminals, start the services:

The Python service keeps HTTP routes in `app/routes.py`, settings in `app/config.py`, PDF indexing in `app/ingestion.py`, Chroma access in `app/vector_store.py`, and retrieval/generation in `app/rag.py`. `main.py` wires these modules together; the Uvicorn command below stays the same.

```bash
# Terminal 1: Python RAG microservice
cd backend/python_service
python -m venv .venv
# Activate .venv, then:
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2: Express API
cd backend
npm install
npm run dev
```

```bash
# Terminal 3: React frontend
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). On startup, the Python service compares the PDFs and embedding settings with `backend/python_service/data/chroma/index_manifest.json`. If they are unchanged, it loads the saved vectors without recreating embeddings; if a PDF or indexing setting changed, it rebuilds the index. Vectors persist under `backend/python_service/data/chroma/`. Hebrew PDF lines are normalized before chunking, and the multilingual BGE-M3 embeddings and Qwen3 chat model run locally through Ollama. The service exposes `POST /ingest` to force a rebuild, `POST /ask` for questions, `GET /health` for readiness, and interactive API docs at `/docs`.

### Choose the answer model

In `/chat`, set **RUN MODE** to **Real RAG**, then choose **Local Ollama** or **OpenAI** under **ANSWER MODEL**. Both options use the same local ChromaDB retrieval and local BGE-M3 embeddings. OpenAI is used only to write the answer from the retrieved passages. In this option, the user's question and retrieved PDF excerpts are sent to OpenAI. The API key stays on the Python service and must not be added to frontend files.

To enable OpenAI, create `backend/python_service/.env` from `.env.example` and set `OPENAI_API_KEY` there. The default model is `gpt-4o-mini`; change `OPENAI_MODEL` in `.env` if needed. Install the Python requirements again after this change, then restart the Python service. Ollama remains the default provider and does not need an OpenAI key.

The RAG service uses a local relevance-score threshold (`RAG_MIN_RELEVANCE_SCORE`, default `0.10`). If none of the retrieved passages meets it, the service returns a no-relevant-information response without calling the answer model. The prompt also tells the model not to use its general knowledge. The threshold is configurable in `backend/python_service/.env`; similarity scores are a heuristic, so tune it against your own documents and questions.

The updated default Chroma collection is `local_pdf_knowledge_he_v2`, so the previous English-oriented embeddings are not reused. Restart the Python service after pulling the models; it automatically rebuilds this collection from the PDFs. You can also click **Re-index PDFs** in the dashboard or call `POST /ingest` to rebuild it. The dashboard reads indexed file names, document and chunk counts, active models, and query/retrieval timings from the live API. Session query metrics reset when the Python service restarts.

Vite proxies `/api` requests to Express at `http://localhost:3001`. Express forwards Real RAG requests to `http://127.0.0.1:8000/ask`; change `PYTHON_SERVICE_URL` in `backend/.env` to override it. Mock Mode remains available without the Python service.
