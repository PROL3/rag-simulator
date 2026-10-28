"""Environment-backed settings for the RAG service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    pdf_dir: Path
    chroma_dir: Path
    collection_name: str
    ollama_base_url: str
    embedding_model: str
    chat_model: str
    openai_model: str
    retrieval_k: int
    min_relevance_score: float
    chunk_size: int
    chunk_overlap: int
    extraction_version: str
    log_level: str

    @property
    def index_manifest_path(self) -> Path:
        return self.chroma_dir / "index_manifest.json"


def load_settings() -> Settings:
    min_score = float(os.getenv("RAG_MIN_RELEVANCE_SCORE", "0.10"))
    return Settings(
        pdf_dir=Path(os.getenv("RAG_PDF_DIR", str(BASE_DIR / "data" / "pdfs"))),
        chroma_dir=Path(os.getenv("CHROMA_PERSIST_DIRECTORY", str(BASE_DIR / "data" / "chroma"))),
        collection_name=os.getenv("CHROMA_COLLECTION_NAME", "local_pdf_knowledge_he_v2"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        embedding_model=os.getenv("OLLAMA_EMBEDDING_MODEL", "bge-m3"),
        chat_model=os.getenv("OLLAMA_CHAT_MODEL", "qwen3:8b"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-6-luna"),
        retrieval_k=max(1, int(os.getenv("RAG_RETRIEVAL_K", "5"))),
        min_relevance_score=max(0.0, min(1.0, min_score)),
        chunk_size=500,
        chunk_overlap=50,
        extraction_version="rtl-layout-v1",
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )


settings = load_settings()
