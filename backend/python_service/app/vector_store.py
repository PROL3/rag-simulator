"""Create and open the persistent Chroma collection."""

from langchain_chroma import Chroma

from app.config import settings
from app.models import embeddings


def create_vector_store() -> Chroma:
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)
    return Chroma(
        collection_name=settings.collection_name,
        embedding_function=embeddings,
        persist_directory=str(settings.chroma_dir),
    )


def load_existing_store() -> Chroma:
    """Open the persistent collection without re-embedding the PDFs."""
    store = create_vector_store()
    if not store.get(limit=1).get("ids"):
        raise ValueError("The persistent Chroma collection is empty.")
    return store
