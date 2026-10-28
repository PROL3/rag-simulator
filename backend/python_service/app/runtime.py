"""Mutable process state shared by routes, ingestion, and RAG services."""

from __future__ import annotations

import threading
from typing import Any

from langchain_chroma import Chroma


class RuntimeState:
    def __init__(self) -> None:
        self.vector_store: Chroma | None = None
        self.index_error: str | None = None
        self._stats_lock = threading.Lock()
        self._session_stats: dict[str, int | float] = {
            "answered_queries": 0,
            "generation_count": 0,
            "retrieval_ms_total": 0.0,
            "generation_ms_total": 0.0,
        }

    def record_query(self, retrieval_ms: float, generation_ms: float) -> None:
        with self._stats_lock:
            self._session_stats["answered_queries"] += 1
            self._session_stats["retrieval_ms_total"] += retrieval_ms
            if generation_ms > 0:
                self._session_stats["generation_count"] += 1
                self._session_stats["generation_ms_total"] += generation_ms

    def metrics_snapshot(self) -> dict[str, Any]:
        with self._stats_lock:
            answered = int(self._session_stats["answered_queries"])
            generation_count = int(self._session_stats["generation_count"])
            return {
                "answered_queries": answered,
                "average_retrieval_ms": round(float(self._session_stats["retrieval_ms_total"]) / answered, 1) if answered else None,
                "average_generation_ms": round(float(self._session_stats["generation_ms_total"]) / generation_count, 1) if generation_count else None,
            }


state = RuntimeState()
