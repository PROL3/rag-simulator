"""FastAPI application entry point for the local RAG service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.config import settings
from app.routes import router
from app.service import prepare_index_on_startup

logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await prepare_index_on_startup()
    yield


app = FastAPI(title="Local RAG Service", version="1.0.0", lifespan=lifespan)
app.include_router(router)
