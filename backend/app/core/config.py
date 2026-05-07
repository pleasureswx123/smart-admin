from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置：从 backend/.env 读取（容器内由 docker-compose 注入）。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ===== App =====
    APP_ENV: Literal["dev", "staging", "prod"] = "dev"
    APP_DEBUG: bool = True
    APP_SECRET_KEY: str = "change-me-32-bytes-base64"

    # ===== PostgreSQL =====
    POSTGRES_DB: str = "smartadmin"
    POSTGRES_USER: str = "smartadmin"
    POSTGRES_PASSWORD: str = "change-me"
    DATABASE_URL: str = (
        "postgresql+asyncpg://smartadmin:change-me@localhost:5432/smartadmin"
    )

    # ===== Redis =====
    REDIS_URL: str = "redis://localhost:6379/0"

    # ===== 火山方舟（Volcengine Ark）=====
    ARK_API_KEY: str = ""
    ARK_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    ARK_CHAT_MODEL: str = "doubao-1.5-pro-32k"
    ARK_VISION_MODEL: str = "doubao-seed-1-6-flash-250828"
    ARK_EMBEDDING_MODEL: str = "doubao-embedding-text-240715"
    ARK_EMBEDDING_DIM: int = 2560

    # ===== 存储 =====
    POLICY_UPLOAD_DIR: str = "data/uploads/policy"
    DOCUMENT_EXPORT_DIR: str = "data/exports/document"
    EVENT_EXPORT_DIR: str = "data/exports/event"

    # ===== Tavily =====
    TAVILY_API_KEY: str = ""

    # ===== 钉钉 =====
    DINGTALK_WEBHOOK_URL: str = ""
    DINGTALK_SECRET: str = ""

    # ===== CORS =====
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, v: object) -> object:
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
