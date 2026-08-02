from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_path: Path
    cors_origins: tuple[str, ...]
    pgvector_database_url: str | None
    embedding_base_url: str | None
    embedding_api_key: str | None
    embedding_model: str
    embedding_dimensions: int


def get_settings() -> Settings:
    default_database = Path(__file__).resolve().parents[1] / "data" / "nodecanvas.db"
    database_path = Path(os.getenv("NODECANVAS_DATABASE_PATH", str(default_database))).expanduser()
    origins = tuple(
        origin.strip()
        for origin in os.getenv(
            "NODECANVAS_CORS_ORIGINS",
            "http://localhost:4173,http://127.0.0.1:4173,http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    )
    pgvector_database_url = os.getenv("NODECANVAS_PGVECTOR_DATABASE_URL", "").strip() or None
    embedding_base_url = os.getenv("NODECANVAS_EMBEDDING_BASE_URL", "").strip().rstrip("/") or None
    return Settings(
        database_path=database_path,
        cors_origins=origins,
        pgvector_database_url=pgvector_database_url,
        embedding_base_url=embedding_base_url,
        embedding_api_key=os.getenv("NODECANVAS_EMBEDDING_API_KEY", "").strip() or None,
        embedding_model=os.getenv("NODECANVAS_EMBEDDING_MODEL", "text-embedding-3-small"),
        embedding_dimensions=int(os.getenv("NODECANVAS_EMBEDDING_DIMENSIONS", "384")),
    )
