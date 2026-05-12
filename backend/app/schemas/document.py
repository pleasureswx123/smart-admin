"""公文 Copilot（document）API IO 模型。"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# DocType 改为动态字符串，支持中文分类名（如"行政通知"）
DocType = str
DocTone = str
AuditLevel = str


class DocTypeItem(BaseModel):
    """文档类型列表项（带模板数量）。"""

    type: str
    template_count: int


class TemplateRead(BaseModel):
    """模板列表响应项。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    name: str
    description: str
    body: str
    is_system: bool


class TemplateCreate(BaseModel):
    """创建模板请求体。"""

    type: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)
    body: str = Field(min_length=1)
    is_system: bool = False


class TemplateUpdate(BaseModel):
    """更新模板请求体（所有字段可选）。"""

    name: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    body: str | None = None


class TypeRename(BaseModel):
    """重命名文档类型请求体。"""

    new_name: str = Field(min_length=1, max_length=64)


class DraftRequest(BaseModel):
    """生成草稿请求。"""

    type: str
    template_id: UUID | None = None
    topic: str = Field(min_length=1, max_length=512)
    keywords: list[str] = Field(default_factory=list)
    tone: str = "formal"


class AuditItem(BaseModel):
    """审计单项。"""

    type: str
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
    tone: str = "formal"


class AuditOnlyRequest(BaseModel):
    """仅审计：传入完整文本，返回审计结果。"""

    type: str
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
