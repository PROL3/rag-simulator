"""PDF loading, Hebrew text cleanup, chunking, and persistent indexing."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings
from app.rtl_text import normalize_rtl_layout_text
from app.vector_store import create_vector_store

logger = logging.getLogger("rag-service.ingestion")


def build_index_manifest(pdf_paths: list[Path]) -> dict[str, Any]:
    """Fingerprint each source PDF and settings that affect stored vectors."""
    files = []
    for pdf_path in pdf_paths:
        digest = hashlib.sha256()
        with pdf_path.open("rb") as pdf_file:
            for block in iter(lambda: pdf_file.read(1024 * 1024), b""):
                digest.update(block)
        files.append({"name": pdf_path.name, "path": str(pdf_path.resolve()), "sha256": digest.hexdigest()})
    return {
        "collection": settings.collection_name,
        "embedding_model": settings.embedding_model,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "extraction_version": settings.extraction_version,
        "files": files,
    }


def write_index_manifest(manifest: dict[str, Any]) -> None:
    temporary_path = settings.index_manifest_path.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary_path.replace(settings.index_manifest_path)


def ingest_pdfs(pdf_dir: Path = settings.pdf_dir) -> tuple[Any, int]:
    """Index every readable PDF in the configured source directory."""
    pdf_paths = sorted(pdf_dir.glob("*.pdf"))
    if not pdf_paths:
        raise FileNotFoundError(
            f"No PDF files found in {pdf_dir}. Add at least one PDF and call POST /ingest."
        )

    index_manifest = build_index_manifest(pdf_paths)
    documents: list[Document] = []
    for pdf_path in pdf_paths:
        loaded_pages = PyPDFLoader(str(pdf_path.resolve()), extraction_mode="layout").load()
        for page in loaded_pages:
            documents.append(
                Document(
                    page_content=normalize_rtl_layout_text(page.page_content),
                    metadata=page.metadata,
                )
            )
    if not documents:
        raise ValueError("The selected PDFs did not contain any readable pages.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    chunks = splitter.split_documents(documents)
    if not chunks:
        raise ValueError("No text chunks were extracted from the selected PDFs.")

    store = create_vector_store()
    # Invalidate the manifest before replacing vectors so startup retries a partial rebuild.
    settings.index_manifest_path.unlink(missing_ok=True)
    existing_ids = store.get().get("ids", [])
    if existing_ids:
        store.delete(ids=existing_ids)
    ids = [f"{i}:{chunk.metadata.get('source', '')}:{chunk.metadata.get('page', '')}" for i, chunk in enumerate(chunks)]
    store.add_documents(chunks, ids=ids)
    write_index_manifest(index_manifest)
    logger.info("Indexed %d chunks from %d PDFs into %s", len(chunks), len(pdf_paths), settings.chroma_dir)
    return store, len(chunks)
