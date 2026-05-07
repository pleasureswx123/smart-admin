"""公文 Copilot（document）API IO 模型。"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DocType = Literal["notice", "request", "reward", "meeting"]
DocTone = Literal["formal", "friendly", "strict"]
AuditLevel = Literal["success", "info", "warning"]


class TemplateRead(BaseModel):
    """模板列表响应项。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    name: str
    description: str
    body: str
    is_system: bool


class DraftRequest(BaseModel):
    """生成草稿请求。"""

    type: DocType
    template_id: UUID | None = None
    topic: str = Field(min_length=1, max_length=512)
    keywords: list[str] = Field(default_factory=list)
    tone: DocTone = "formal"


class AuditItem(BaseModel):
    """审计单项。"""

    type: AuditLevel
    title: str
    description: str = ""


class DraftResponse(BaseModel):
    """非流式生成草稿响应。"""

    draft_id: UUID
    content: str
    audit_feedback: list[AuditItem] = Field(default_factory=list)
    passed: bool
    rounds: int


class OptimizeRequest(BaseModel):
    """单段优化请求（基于审计意见再写）。"""

    content: str = Field(min_length=1)
    feedback: list[AuditItem] = Field(default_factory=list)
    tone: DocTone = "formal"


class AuditOnlyRequest(BaseModel):
    """仅审计：传入完整文本，返回审计结果。"""

    type: DocType
    content: str = Field(min_length=1)


class AuditOnlyResponse(BaseModel):
    audit_feedback: list[AuditItem]
    passed: bool


class SaveTemplateRequest(BaseModel):
    """把当前草稿另存为用户模板。"""

    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)


class DraftRead(BaseModel):
    """完整草稿响应（用于详情/导出）。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    topic: str
    keywords: list[str]
    tone: str
    content: str
    audit_feedback: list[dict]
    retry_count: int
    passed: bool
    created_at: datetime
    updated_at: datetime


class ExportPdfResponse(BaseModel):
    """导出 PDF 响应。"""

    download_url: str
    file_path: str
    size_bytes: int
