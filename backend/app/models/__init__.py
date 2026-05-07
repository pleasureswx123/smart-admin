"""聚合所有 SQLModel 表，供 Alembic env.py 自动发现。"""
from __future__ import annotations

from app.models.document import DocumentDraft, DocumentTemplate
from app.models.policy import KnowledgeFile, PolicyChunk
from app.models.visitor import Employee, VisitorRecord

__all__ = [
    "DocumentDraft",
    "DocumentTemplate",
    "Employee",
    "KnowledgeFile",
    "PolicyChunk",
    "VisitorRecord",
]
