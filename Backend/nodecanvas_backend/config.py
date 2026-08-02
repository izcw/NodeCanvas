from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_path: Path
    cors_origins: tuple[str, ...]


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
    return Settings(database_path=database_path, cors_origins=origins)
