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
    session_id: str | None = Field(default=None, description="会话 ID（流式 meta 事件回传）")


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


class CategoryItem(BaseModel):
    """分类聚合项（侧栏展示）。"""

    category: str
    file_count: int


class QuickQuestion(BaseModel):
    """常用问题项。"""

    text: str
    category: str | None = None


class KnowledgeFileUpdate(BaseModel):
    """文件元数据更新（仅更新名称或分类，不重建 embedding）。"""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, min_length=1, max_length=64)


class CategoryRename(BaseModel):
    """分类重命名请求体。"""

    new_name: str = Field(min_length=1, max_length=64)


class PolicyFileCreate(BaseModel):
    """直接录入 Markdown 内容创建制度文档（无需上传文件）。"""

    name: str = Field(min_length=1, max_length=255, description="文档显示名称，自动补 .md 后缀")
    category: str = Field(min_length=1, max_length=64, description="所属分类")
    content: str = Field(min_length=1, description="Markdown 正文内容")
    access_level: str = Field(default="public", description="访问级别")
