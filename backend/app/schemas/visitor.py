"""访客模块 IO schema。"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class HostMatch(BaseModel):
    """搜索被访人的匹配项。"""

    id: UUID
    name: str
    nickname: str | None = None
    department: str
    title: str | None = None
    score: float


class HostMatchResponse(BaseModel):
    matches: list[HostMatch]


class OcrCardResponse(BaseModel):
    """名片 OCR 字段抽取响应。"""

    name: str = ""
    company: str = ""
    phone: str = ""
    title: str = ""
    confidence: float = 0.0


class VisitorRegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    company: str = Field(min_length=1, max_length=128)
    phone: str = Field(min_length=1, max_length=32)
    purpose: str | None = Field(default=None, max_length=256)
    host_employee_id: UUID | None = None
    host_name: str | None = Field(default=None, max_length=64)  # 当无 id 时仅记录名字
    source: str = Field(default="mobile", pattern="^(mobile|desk)$")


class VisitorOut(BaseModel):
    id: UUID
    name: str
    company: str
    phone_masked: str  # 138****1234
    purpose: str | None
    host_employee_id: UUID | None
    host_name: str
    host_match_score: float
    status: str
    check_in_at: datetime | None
    check_out_at: datetime | None
    push_status: str
    source: str
    created_at: datetime


class VisitorListResponse(BaseModel):
    items: list[VisitorOut]
    total: int
    page: int
    page_size: int


class VisitorStats(BaseModel):
    today_total: int
    today_entered: int
    today_left: int
    weekly_total: int


class WeeklyTrendPoint(BaseModel):
    day: str  # "周一" .. "周日"
    date: str  # YYYY-MM-DD
    count: int


class WeeklyTrendResponse(BaseModel):
    points: list[WeeklyTrendPoint]


class NotifyResponse(BaseModel):
    push_status: str
    push_error: str | None = None
