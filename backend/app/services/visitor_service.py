"""访客模块服务层：拼音索引、模糊匹配、登记/核验、钉钉推送。"""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import structlog
from pypinyin import Style, lazy_pinyin
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session_factory
from app.models.visitor import Employee, VisitorRecord
from app.repositories import visitor as repo
from app.schemas.visitor import (
    HostMatch,
    VisitorOut,
    WeeklyTrendPoint,
)

logger = structlog.get_logger(__name__)

# Redis key 命名
KEY_EMP_ALL = "emp:idx:all"  # SET[employee_id]
KEY_EMP_PROFILE = "emp:profile:{id}"  # HASH 字段见 _profile_fields
KEY_VISITOR_STATS = "visitor:stats:today"
KEY_VISITOR_TREND = "visitor:trend:weekly"


# ============= 拼音 / 索引 =============
def _to_pinyin(text: str) -> str:
    """汉字转纯拼音串（小写无音调），非汉字保留。"""
    return "".join(lazy_pinyin(text or "", style=Style.NORMAL)).lower()


def _to_initials(text: str) -> str:
    """取每个汉字声母拼接（liming -> lm）。"""
    return "".join(p[0] for p in lazy_pinyin(text or "", style=Style.FIRST_LETTER) if p).lower()


def _profile_fields(emp: Employee) -> dict[str, str]:
    return {
        "id": str(emp.id),
        "name": emp.name,
        "name_pinyin": emp.name_pinyin or _to_pinyin(emp.name),
        "name_initials": _to_initials(emp.name),
        "nickname": emp.nickname or "",
        "nickname_pinyin": _to_pinyin(emp.nickname or ""),
        "department": emp.department,
        "title": emp.title or "",
        "phone": emp.phone or "",
    }


async def rebuild_employee_index(redis: Redis, employees: list[Employee]) -> int:
    """启动期或员工增量后调用：清空旧索引、重建 Redis 中的员工拼音库。"""
    pipe = redis.pipeline()
    pipe.delete(KEY_EMP_ALL)
    # 清理旧 profile（只在启动期做一次：扫描）
    async for key in redis.scan_iter(match="emp:profile:*", count=200):
        pipe.delete(key)
    for emp in employees:
        fields = _profile_fields(emp)
        pipe.hset(KEY_EMP_PROFILE.format(id=emp.id), mapping=fields)
        pipe.sadd(KEY_EMP_ALL, str(emp.id))
    await pipe.execute()
    logger.info("visitor.index.rebuild", count=len(employees))
    return len(employees)


async def rebuild_index_from_db(redis: Redis) -> int:
    """从 DB 拉取所有 active 员工并重建 Redis 索引（独立 session）。"""
    factory = get_session_factory()
    async with factory() as session:
        emps = await repo.list_active_employees(session)
    return await rebuild_employee_index(redis, emps)


# ============= 模糊匹配 =============
def _score(query: str, p: dict[str, str]) -> float:
    q = query.strip().lower()
    if not q:
        return 0.0
    name = p.get("name", "")
    nick = p.get("nickname", "")
    py = p.get("name_pinyin", "")
    ny = p.get("nickname_pinyin", "")
    init = p.get("name_initials", "")
    dept = p.get("department", "")
    title = p.get("title", "")

    # 中文优先
    if q == name:
        return 1.0
    if q == nick:
        return 0.95
    if name and q in name:
        return 0.9
    if nick and q in nick:
        return 0.85
    # 拼音
    if py and q == py:
        return 0.92
    if py and py.startswith(q):
        return 0.8
    if ny and ny.startswith(q):
        return 0.78
    if py and q in py:
        return 0.65
    # 首字母缩写
    if init and q == init:
        return 0.82
    if init and init.startswith(q):
        return 0.7
    # 部门/职位兜底
    if dept and q in dept.lower():
        return 0.5
    if title and q in title.lower():
        return 0.45
    return 0.0


async def search_host(redis: Redis, q: str, limit: int = 8) -> list[HostMatch]:
    if not q:
        return []
    ids = await redis.smembers(KEY_EMP_ALL)
    if not ids:
        return []
    pipe = redis.pipeline()
    id_list = list(ids)
    for eid in id_list:
        pipe.hgetall(KEY_EMP_PROFILE.format(id=eid))
    profiles = await pipe.execute()
    scored: list[tuple[float, dict[str, str]]] = []
    for prof in profiles:
        if not prof:
            continue
        s = _score(q, prof)
        if s > 0:
            scored.append((s, prof))
    scored.sort(key=lambda x: x[0], reverse=True)
    out: list[HostMatch] = []
    for s, p in scored[:limit]:
        out.append(
            HostMatch(
                id=UUID(p["id"]),
                name=p["name"],
                nickname=p.get("nickname") or None,
                department=p["department"],
                title=p.get("title") or None,
                score=round(s, 3),
            )
        )
    return out


# ============= 脱敏 / DTO =============
def _mask_phone(phone: str) -> str:
    if not phone:
        return ""
    s = phone.strip()
    if len(s) >= 11:
        return s[:3] + "****" + s[-4:]
    if len(s) >= 7:
        return s[:3] + "****" + s[-3:]
    return "****" + s[-2:]


def to_visitor_out(r: VisitorRecord) -> VisitorOut:
    return VisitorOut(
        id=r.id,
        name=r.name,
        company=r.company,
        phone_masked=_mask_phone(r.phone),
        purpose=r.purpose,
        host_employee_id=r.host_employee_id,
        host_name=r.host_name_snapshot or "",
        host_match_score=r.host_match_score,
        status=r.status,
        check_in_at=r.check_in_at,
        check_out_at=r.check_out_at,
        push_status=r.push_status,
        source=r.source,
        created_at=r.created_at,
    )
