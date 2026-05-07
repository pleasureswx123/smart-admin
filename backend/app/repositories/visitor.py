"""访客模块仓储层。"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.visitor import Employee, VisitorRecord


async def list_active_employees(session: AsyncSession) -> list[Employee]:
    stmt = select(Employee).where(Employee.is_active.is_(True))
    return list((await session.execute(stmt)).scalars().all())


async def get_employee(session: AsyncSession, emp_id: UUID) -> Employee | None:
    return await session.get(Employee, emp_id)


async def create_visitor(session: AsyncSession, record: VisitorRecord) -> VisitorRecord:
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def get_visitor(session: AsyncSession, vid: UUID) -> VisitorRecord | None:
    return await session.get(VisitorRecord, vid)


async def update_visitor(session: AsyncSession, record: VisitorRecord) -> VisitorRecord:
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def list_visitors(
    session: AsyncSession,
    *,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[VisitorRecord], int]:
    stmt = select(VisitorRecord)
    cnt = select(func.count()).select_from(VisitorRecord)
    if status:
        stmt = stmt.where(VisitorRecord.status == status)
        cnt = cnt.where(VisitorRecord.status == status)
    if search:
        like = f"%{search}%"
        cond = (
            VisitorRecord.name.ilike(like)
            | VisitorRecord.company.ilike(like)
            | VisitorRecord.host_name_snapshot.ilike(like)
        )
        stmt = stmt.where(cond)
        cnt = cnt.where(cond)
    total = (await session.execute(cnt)).scalar_one()
    stmt = stmt.order_by(VisitorRecord.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size)
    items = list((await session.execute(stmt)).scalars().all())
    return items, total


async def count_today_by_status(session: AsyncSession) -> dict[str, int]:
    """返回 today_total/today_entered/today_left 三个计数。"""
    start = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)
    end = datetime.combine(date.today(), time.max, tzinfo=timezone.utc)
    stmt = select(VisitorRecord.status, func.count()).where(
        VisitorRecord.created_at >= start, VisitorRecord.created_at <= end
    ).group_by(VisitorRecord.status)
    rows = (await session.execute(stmt)).all()
    by_status = {s: c for s, c in rows}
    total = sum(by_status.values())
    return {
        "today_total": total,
        "today_entered": by_status.get("entered", 0),
        "today_left": by_status.get("left", 0),
    }


async def count_by_day(
    session: AsyncSession, *, start: datetime, end: datetime
) -> dict[date, int]:
    """按日聚合 [start, end] 范围内的访客创建数。"""
    day_col = func.date(func.timezone("UTC", VisitorRecord.created_at)).label("d")
    stmt = (
        select(day_col, func.count())
        .where(VisitorRecord.created_at >= start, VisitorRecord.created_at <= end)
        .group_by(day_col)
    )
    rows = (await session.execute(stmt)).all()
    return {d: c for d, c in rows}
