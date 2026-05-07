"""制度万事通（policy）API IO 模型。"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeFileRead(BaseModel):
    """知识库文件详情（响应）。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str
    access_level: str
    file_path: str
    size_bytes: int
    page_count: int | None
    status: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class AskRequest(BaseModel):
    """问答请求。"""

    question: str = Field(min_length=1, max_length=2000)
    category: str | None = Field(default=None, description="按类目过滤；None 表示全库检索")
    top_k: int = Field(default=5, ge=1, le=20)


class Citation(BaseModel):
    """答案引用片段（溯源）。"""

    file_id: UUID
    file_name: str
    chunk_index: int
    page: int | None = None
    content: str = Field(description="原文片段；前端可截断展示")
    score: float = Field(description="相似度分数，越大越相关")


class AskResponse(BaseModel):
    """问答响应。"""

    answer: str
    citations: list[Citation] = Field(default_factory=list)
