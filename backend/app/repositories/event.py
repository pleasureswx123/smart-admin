"""\u56e2\u5efa\u4ed3\u50a8\u5c42\u3002"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import EventPlan, EventRun


async def create_plan(
    session: AsyncSession,
    *,
    participants: int,
    per_capita_budget: int,
    city: str,
    activity_types: list[str],
    plan_a: dict,
    plan_b: dict,
    user_id: UUID | None = None,
) -> EventPlan:
    plan = EventPlan(
        user_id=user_id,
        participants=participants,
        per_capita_budget=per_capita_budget,
        city=city,
        activity_types=activity_types,
        plan_a=plan_a,
        plan_b=plan_b,
    )
    session.add(plan)
    await session.flush()
    await session.refresh(plan)
    return plan


async def get_plan(session: AsyncSession, plan_id: UUID) -> EventPlan | None:
    return await session.get(EventPlan, plan_id)


async def create_run(
    session: AsyncSession,
    *,
    plan_id: UUID,
    final_state: dict,
    total_retries: int,
    duration_ms: int,
    success: bool,
    error: str | None = None,
) -> EventRun:
    run = EventRun(
        plan_id=plan_id,
        final_state=final_state,
        total_retries=total_retries,
        duration_ms=duration_ms,
        success=success,
        error=error,
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)
    return run
