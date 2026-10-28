"""Retrieval, relevance filtering, grounded generation, and answer sources."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

from app.config import settings
from app.models import answer_prompt, build_openai_llm, ollama_llm
from app.runtime import state

logger = logging.getLogger("rag-service.rag")


def run_rag(question: str, provider: str = "ollama") -> dict[str, Any]:
    vector_store = state.vector_store
    if vector_store is None:
        raise RuntimeError(state.index_error or "The vector store is not ready. Add a PDF and run ingestion.")

    retrieval_started = time.perf_counter()
    scored_results = vector_store.similarity_search_with_relevance_scores(
        question,
        k=max(settings.retrieval_k * 4, 12),
    )
    retrieval_ms = (time.perf_counter() - retrieval_started) * 1000
    retrieved = [(doc, score) for doc, score in scored_results if score >= settings.min_relevance_score][:settings.retrieval_k]
    best_score = max((score for _, score in scored_results), default=0.0)
    if not retrieved:
        state.record_query(retrieval_ms, 0)
        logger.info(
            "No chunks passed relevance threshold %.2f for the question (best score: %.3f)",
            settings.min_relevance_score,
            best_score,
        )
        return {
            "answer": no_relevant_information_answer(question),
            "sources": [],
            "metrics": {
                "retrieval_ms": round(retrieval_ms, 1),
                "generation_ms": 0,
                "best_relevance_score": round(best_score, 3),
            },
        }

    context = "\n\n---\n\n".join(
        f"[Source {index}: {doc.metadata.get('source', 'unknown')}, page: {int(doc.metadata.get('page', 0)) + 1}, relevance: {score:.3f}]\n{doc.page_content}"
        for index, (doc, score) in enumerate(retrieved, start=1)
    )
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI is selected but OPENAI_API_KEY is not configured in the Python service environment.")
        llm = build_openai_llm()
    else:
        llm = ollama_llm

    generation_started = time.perf_counter()
    response = (answer_prompt | llm).invoke({"context": context, "question": question})
    generation_ms = (time.perf_counter() - generation_started) * 1000
    answer = content_to_text(response.content)
    sources = [
        {
            "source": Path(str(doc.metadata.get("source", "unknown"))).name,
            "page": int(doc.metadata.get("page", 0)) + 1,
            "content": doc.page_content,
            "relevance_score": round(score, 3),
        }
        for doc, score in retrieved
    ]
    state.record_query(retrieval_ms, generation_ms)
    return {
        "answer": answer,
        "sources": sources,
        "metrics": {
            "retrieval_ms": round(retrieval_ms, 1),
            "generation_ms": round(generation_ms, 1),
            "best_relevance_score": round(max(score for _, score in retrieved), 3),
        },
    }


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            block["text"]
            for block in content
            if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)
        )
    return str(content)


def no_relevant_information_answer(question: str) -> str:
    if any("\u0590" <= character <= "\u05ff" for character in question):
        return "לא מצאתי במסמכים קטעים רלוונטיים לשאלה, ולכן איני יכול לענות עליה על סמך המקורות."
    return "I couldn't find relevant information in the documents, so I can't answer this based on the provided sources."
