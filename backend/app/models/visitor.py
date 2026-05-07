"""访客管家（visitor）数据模型。"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, SQLModel


class Employee(SQLModel, table=True):
    """员工通讯录（访客系统的"被访人"来源）。"""

    __tablename__ = "employee"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True, max_length=64)
    name_pinyin: str = Field(index=True, max_length=128)  # 例如 "liming"
    nickname: str | None = Field(default=None, max_length=64)
    department: str = Field(index=True, max_length=64)
    title: str | None = Field(default=None, max_length=64)
    phone: str | None = Field(default=None, max_length=32)
    dingtalk_user_id: str | None = Field(default=None, max_length=64)
    is_active: bool = Field(default=True, index=True)
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


class VisitorRecord(SQLModel, table=True):
    """访客登记记录。"""

    __tablename__ = "visitor_record"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=64)
    company: str = Field(max_length=128)
    phone: str = Field(max_length=32)  # MVP: 明文存储；列表响应做脱敏
    purpose: str | None = Field(default=None, max_length=256)
    host_employee_id: UUID | None = Field(default=None, foreign_key="employee.id", index=True)
    host_name_snapshot: str = Field(default="", max_length=64)  # 冗余被访人姓名
    host_match_score: float = Field(default=1.0)
    status: str = Field(default="registered", index=True, max_length=16)  # registered | entered | left
    check_in_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    check_out_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    push_status: str = Field(default="pending", max_length=16)  # pending | success | failed
    push_error: str | None = Field(default=None, max_length=512)
    source: str = Field(default="mobile", max_length=16)  # mobile | desk
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
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
