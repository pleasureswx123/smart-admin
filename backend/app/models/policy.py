"""制度知识库（policy）数据模型。"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, Index, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.core.config import settings


class KnowledgeFile(SQLModel, table=True):
    """知识库文件（PDF / Word / Markdown 等）。"""

    __tablename__ = "knowledge_file"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True, max_length=512)
    category: str = Field(index=True, max_length=64)
    access_level: str = Field(default="public", max_length=32)
    file_path: str = Field(max_length=1024)
    size_bytes: int = 0
    page_count: int | None = None
    status: str = Field(default="pending", index=True, max_length=32)
    chunk_count: int = 0
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        )
    )


class PolicyChunk(SQLModel, table=True):
    """制度文档切片（含 embedding 向量）。"""

    __tablename__ = "policy_chunk"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    file_id: UUID = Field(foreign_key="knowledge_file.id", index=True)
    chunk_index: int
    content: str
    page: int | None = None
    chunk_metadata: dict = Field(
        default_factory=dict,
        sa_column=Column(
            "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
        ),
    )
    embedding: list[float] = Field(
        sa_column=Column(Vector(settings.ARK_EMBEDDING_DIM), nullable=False)
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    )

    __table_args__ = (
        Index("idx_policy_chunk_metadata_gin", "metadata", postgresql_using="gin"),
    )
