"""公文 Copilot（document）数据模型。"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class DocumentTemplate(SQLModel, table=True):
    """公文模板（系统内置 + 用户保存）。"""

    __tablename__ = "document_template"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    type: str = Field(index=True, max_length=32)  # notice | request | reward | meeting
    name: str = Field(max_length=128)
    description: str = Field(default="", max_length=512)
    body: str  # Markdown 模板
    is_system: bool = Field(default=True, index=True)
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


class DocumentDraft(SQLModel, table=True):
    """公文草稿（含 Reflective Writer 状态机产物）。"""

    __tablename__ = "document_draft"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID | None = Field(default=None, index=True)
    template_id: UUID | None = Field(
        default=None, foreign_key="document_template.id"
    )
    type: str = Field(index=True, max_length=32)
    topic: str = Field(max_length=512)
    keywords: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    tone: str = Field(default="formal", max_length=32)  # formal | friendly | strict
    content: str = ""  # 当前 Markdown
    audit_feedback: list[dict] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    retry_count: int = 0
    passed: bool = Field(default=False, index=True)
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
