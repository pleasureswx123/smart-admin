"""聚合所有 SQLModel 表，供 Alembic env.py 自动发现。"""
from __future__ import annotations

from app.models.policy import KnowledgeFile, PolicyChunk

__all__ = ["KnowledgeFile", "PolicyChunk"]
