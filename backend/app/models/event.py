"""\u56e2\u5efa\u7b56\u5212\u5e08\uff08event\uff09\u6570\u636e\u6a21\u578b\u3002"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class EventPlan(SQLModel, table=True):
    """\u56e2\u5efa\u65b9\u6848\uff08\u4fdd\u7559\u4e3b/\u5907\u9009\u5b57\u6bb5\uff0c\u540c\u65f6\u7528 plans \u5b58\u50a8\u5b8c\u6574\u65b9\u6848\u5217\u8868\uff09\u3002"""

    __tablename__ = "event_plan"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID | None = Field(default=None, index=True)
    participants: int = Field(ge=1, le=2000)
    per_capita_budget: int = Field(ge=10, le=10000)
    city: str = Field(max_length=64, index=True)
    activity_types: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    plan_a: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    plan_b: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    plans: list[dict] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    )


class EventRun(SQLModel, table=True):
    """LangGraph \u8fd0\u884c\u8bb0\u5f55\uff0c\u7528\u4e8e\u5931\u8d25\u56de\u653e\u4e0e prompt \u8c03\u4f18\u3002"""

    __tablename__ = "event_run"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    plan_id: UUID = Field(foreign_key="event_plan.id", index=True)
    final_state: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    total_retries: int = 0
    duration_ms: int = 0
    success: bool = False
    error: str | None = Field(default=None, max_length=1024)
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    )
