"""Request/response contracts for the RAG HTTP API."""

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=10_000)
    provider: str = Field(default="ollama", pattern="^(ollama|openai)$")
