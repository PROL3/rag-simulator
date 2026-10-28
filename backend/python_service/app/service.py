"""Application lifecycle and index preparation."""

from __future__ import annotations

import json
import logging

from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.ingestion import build_index_manifest, ingest_pdfs
from app.runtime import state
from app.vector_store import load_existing_store

logger = logging.getLogger("rag-service")


async def prepare_index_on_startup() -> None:
    try:
        pdf_paths = sorted(settings.pdf_dir.glob("*.pdf"))
        if pdf_paths:
            current_manifest = await run_in_threadpool(build_index_manifest, pdf_paths)
            saved_manifest = None
            if settings.index_manifest_path.exists():
                try:
                    saved_manifest = json.loads(settings.index_manifest_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    logger.warning("Could not read index manifest; rebuilding the index")

            if saved_manifest == current_manifest:
                try:
                    state.vector_store = await run_in_threadpool(load_existing_store)
                    state.index_error = None
                    logger.info("PDFs and embedding settings unchanged; loaded saved Chroma index")
                except Exception as exc:
                    logger.warning("Could not load saved Chroma index; rebuilding: %s", exc)
                    state.vector_store, _ = await run_in_threadpool(ingest_pdfs)
                    state.index_error = None
            else:
                logger.info("PDFs or embedding settings changed; rebuilding the Chroma index")
                state.vector_store, _ = await run_in_threadpool(ingest_pdfs)
                state.index_error = None
        elif settings.chroma_dir.exists():
            # Continue serving the saved collection if source PDFs were temporarily removed.
            state.vector_store = await run_in_threadpool(load_existing_store)
            state.index_error = None
        else:
            state.index_error = (
                f"No PDF files found in {settings.pdf_dir}; add at least one PDF and call POST /ingest."
            )
    except Exception as exc:
        state.index_error = str(exc)
        logger.exception("Could not prepare the Chroma index on startup")


async def force_reindex() -> int:
    state.vector_store = None
    state.index_error = "PDF ingestion is in progress."
    try:
        state.vector_store, chunk_count = await run_in_threadpool(ingest_pdfs)
        state.index_error = None
        return chunk_count
    except Exception as exc:
        state.index_error = str(exc)
        raise
