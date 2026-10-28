"""FastAPI routes for status, indexing, and question answering."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.rag import run_rag
from app.runtime import state
from app.schemas import AskRequest
from app.service import force_reindex

logger = logging.getLogger("rag-service.api")
router = APIRouter()


@router.get("/health")
async def health() -> dict[str, Any]:
    documents: list[str] = []
    chunk_count = 0
    vector_store = state.vector_store
    if vector_store is not None:
        chunk_count = await run_in_threadpool(vector_store._collection.count)
        if settings.index_manifest_path.exists():
            try:
                manifest = json.loads(settings.index_manifest_path.read_text(encoding="utf-8"))
                documents = sorted({str(item["name"]) for item in manifest.get("files", []) if item.get("name")})
            except (OSError, json.JSONDecodeError, TypeError):
                logger.warning("Could not read index manifest for health status")
        if not documents:
            records = await run_in_threadpool(vector_store.get, include=["metadatas"])
            documents = sorted({Path(str(item.get("source", "unknown"))).name for item in records.get("metadatas", []) if item})

    indexed = vector_store is not None and chunk_count > 0
    ollama_online, installed_models = await get_ollama_status()

    def model_is_installed(configured_name: str) -> bool:
        return configured_name in installed_models or (
            ":" not in configured_name and f"{configured_name}:latest" in installed_models
        )

    return {
        "status": "ok" if indexed else "degraded",
        "indexed": indexed,
        "index_error": state.index_error,
        "documents": documents,
        "document_count": len(documents),
        "chunk_count": chunk_count,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "retrieval_k": settings.retrieval_k,
        "min_relevance_score": settings.min_relevance_score,
        "collection": settings.collection_name,
        "embedding_model": settings.embedding_model,
        "local_chat_model": settings.chat_model,
        "ollama_online": ollama_online,
        "installed_ollama_models": installed_models,
        "embedding_model_available": model_is_installed(settings.embedding_model),
        "local_chat_model_available": model_is_installed(settings.chat_model),
        "openai_model": settings.openai_model,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "session": state.metrics_snapshot(),
    }


async def get_ollama_status() -> tuple[bool, list[str]]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags")
            response.raise_for_status()
            names = [str(item.get("name", "")) for item in response.json().get("models", [])]
            return True, names
    except (httpx.HTTPError, ValueError, AttributeError):
        return False, []


@router.post("/ingest")
async def ingest() -> dict[str, Any]:
    try:
        chunk_count = await force_reindex()
        return {"status": "indexed", "chunks": chunk_count, "pdf_directory": str(settings.pdf_dir)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("PDF ingestion failed")
        raise HTTPException(status_code=500, detail="PDF ingestion failed. Check the service logs.") from exc


@router.post("/ask")
async def ask(request: AskRequest) -> dict[str, Any]:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question must not be blank.")
    try:
        return await run_in_threadpool(run_rag, question, request.provider)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("RAG question failed")
        raise HTTPException(status_code=502, detail="RAG generation failed. Check the selected model provider and service logs.") from exc
