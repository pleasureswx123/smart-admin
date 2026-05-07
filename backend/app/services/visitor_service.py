"""访客模块服务层：拼音索引、模糊匹配、登记/核验、钉钉推送。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time as _time
import urllib.parse
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

import httpx
import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pypinyin import Style, lazy_pinyin
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session_factory
from app.models.visitor import Employee, VisitorRecord
from app.repositories import visitor as repo
from app.schemas.visitor import (
    HostMatch,
    OcrCardResponse,
    VisitorOut,
    VisitorRegisterRequest,
    VisitorStats,
    WeeklyTrendPoint,
    WeeklyTrendResponse,
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



# ============= OCR 名片 =============
_OCR_PROMPT = """你是一个名片信息抽取助手。请从图片中识别下列字段并以**严格 JSON** 格式返回（不要包含解释/Markdown）：
{
  "name": "持卡人姓名（中文优先，无则空字符串）",
  "company": "公司/单位完整名称（无则空字符串）",
  "phone": "手机号（11 位数字，如有 +86/区号请去除；无则空字符串）",
  "title": "职位/头衔（无则空字符串）",
  "confidence": 0.0
}
confidence 取值 0.0~1.0，反映你对识别结果整体的置信度。"""


_JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")


def _parse_ocr_json(raw: str) -> dict:
    """从模型输出中提取 JSON 对象。"""
    text = (raw or "").strip()
    # 去掉 ```json fences
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    m = _JSON_BLOCK_RE.search(text)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}


async def ocr_card(image_bytes: bytes, mime_type: str = "image/jpeg") -> OcrCardResponse:
    """调用 Ark 视觉模型提取名片字段；图片仅在内存处理，不落盘。"""
    if not image_bytes:
        return OcrCardResponse()
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{b64}"
    llm = ChatOpenAI(
        model=settings.ARK_VISION_MODEL,
        api_key=settings.ARK_API_KEY,
        base_url=settings.ARK_BASE_URL,
        temperature=0.0,
        timeout=30,
        max_retries=2,
    )
    messages = [
        SystemMessage(content=_OCR_PROMPT),
        HumanMessage(
            content=[
                {"type": "text", "text": "请抽取这张名片上的字段。"},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]
        ),
    ]
    resp = await llm.ainvoke(messages)
    text = resp.content if isinstance(resp.content, str) else str(resp.content)
    parsed = _parse_ocr_json(text)
    phone = (parsed.get("phone") or "").strip()
    # 去除非数字字符；保留 11 位手机号尾段
    digits = re.sub(r"\D+", "", phone)
    if len(digits) > 11:
        digits = digits[-11:]
    return OcrCardResponse(
        name=(parsed.get("name") or "").strip(),
        company=(parsed.get("company") or "").strip(),
        phone=digits,
        title=(parsed.get("title") or "").strip(),
        confidence=float(parsed.get("confidence") or 0.0),
    )



# ============= 登记 / 列表 / 详情 =============
async def register_visitor(
    session: AsyncSession, redis: Redis, payload: VisitorRegisterRequest
) -> VisitorRecord:
    """登记访客：解析被访人 → 落库 registered。钉钉推送由调用方异步触发。"""
    host_name_snapshot = ""
    host_match_score = 0.0
    if payload.host_employee_id:
        emp = await repo.get_employee(session, payload.host_employee_id)
        if not emp or not emp.is_active:
            raise ValueError("被访人不存在或已停用")
        host_name_snapshot = emp.name
        host_match_score = 1.0
    elif payload.host_name:
        # 无 ID：尝试从 Redis 模糊匹配 top1，记录 score 但不强制
        matches = await search_host(redis, payload.host_name, limit=1)
        if matches:
            host_name_snapshot = matches[0].name
            host_match_score = matches[0].score
        else:
            host_name_snapshot = payload.host_name
            host_match_score = 0.0
    else:
        raise ValueError("必须指定 host_employee_id 或 host_name")

    record = VisitorRecord(
        name=payload.name.strip(),
        company=payload.company.strip(),
        phone=re.sub(r"\D+", "", payload.phone)[-11:],
        purpose=(payload.purpose or "").strip() or None,
        host_employee_id=payload.host_employee_id,
        host_name_snapshot=host_name_snapshot,
        host_match_score=host_match_score,
        status="registered",
        source=payload.source,
        push_status="pending",
    )
    return await repo.create_visitor(session, record)


async def list_visitors_paged(
    session: AsyncSession, *, status: str | None, search: str | None, page: int, page_size: int
) -> tuple[list[VisitorOut], int]:
    items, total = await repo.list_visitors(
        session, status=status, search=search, page=page, page_size=page_size
    )
    return [to_visitor_out(r) for r in items], total


# ============= 签到 / 签退 =============
async def check_in(session: AsyncSession, vid: UUID) -> VisitorRecord:
    rec = await repo.get_visitor(session, vid)
    if not rec:
        raise LookupError("访客记录不存在")
    if rec.status == "left":
        raise ValueError("已离开，无法重复签到")
    if rec.status != "entered":
        rec.status = "entered"
        rec.check_in_at = datetime.now(timezone.utc)
        await repo.update_visitor(session, rec)
    return rec


async def check_out(session: AsyncSession, vid: UUID) -> VisitorRecord:
    rec = await repo.get_visitor(session, vid)
    if not rec:
        raise LookupError("访客记录不存在")
    if rec.status == "registered":
        raise ValueError("尚未签到，无法签退")
    if rec.status != "left":
        rec.status = "left"
        rec.check_out_at = datetime.now(timezone.utc)
        await repo.update_visitor(session, rec)
    return rec


# ============= 统计 =============
async def get_today_stats(session: AsyncSession) -> VisitorStats:
    counts = await repo.count_today_by_status(session)
    # weekly = 最近 7 天创建数总和
    end = datetime.now(timezone.utc)
    start = datetime.combine(end.date() - timedelta(days=6), time.min, tzinfo=timezone.utc)
    by_day = await repo.count_by_day(session, start=start, end=end)
    weekly = sum(by_day.values())
    return VisitorStats(
        today_total=counts["today_total"],
        today_entered=counts["today_entered"],
        today_left=counts["today_left"],
        weekly_total=weekly,
    )


_DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


async def get_weekly_trend(session: AsyncSession) -> WeeklyTrendResponse:
    """最近 7 天每日访客创建数（含今天）。"""
    today = date.today()
    start = datetime.combine(today - timedelta(days=6), time.min, tzinfo=timezone.utc)
    end = datetime.combine(today, time.max, tzinfo=timezone.utc)
    by_day = await repo.count_by_day(session, start=start, end=end)
    points: list[WeeklyTrendPoint] = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        points.append(
            WeeklyTrendPoint(
                day=_DAY_LABELS[d.weekday()],
                date=d.isoformat(),
                count=int(by_day.get(d, 0)),
            )
        )
    return WeeklyTrendResponse(points=points)


# ============= 钉钉推送 =============
def _ding_signed_url(webhook: str, secret: str) -> str:
    """加签模式：在 webhook 上拼接 timestamp + sign。"""
    ts = str(round(_time.time() * 1000))
    payload = f"{ts}\n{secret}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(digest))
    sep = "&" if "?" in webhook else "?"
    return f"{webhook}{sep}timestamp={ts}&sign={sign}"


def _build_ding_markdown(rec: VisitorRecord) -> dict:
    title = f"访客登记 · {rec.name}"
    body = (
        f"### 访客来访通知\n"
        f"- **访客**：{rec.name}\n"
        f"- **公司**：{rec.company}\n"
        f"- **手机**：{_mask_phone(rec.phone)}\n"
        f"- **来访事由**：{rec.purpose or '未填写'}\n"
        f"- **被访人**：{rec.host_name_snapshot or '未指定'}\n"
        f"- **登记时间**：{rec.created_at.strftime('%Y-%m-%d %H:%M')}\n"
    )
    return {"msgtype": "markdown", "markdown": {"title": title, "text": body}}


async def notify_dingtalk(session: AsyncSession, vid: UUID) -> VisitorRecord:
    """异步调用钉钉自定义机器人 webhook；记录推送状态/错误。未配置时直接置 skipped。"""
    rec = await repo.get_visitor(session, vid)
    if not rec:
        raise LookupError("访客记录不存在")
    if not settings.DINGTALK_WEBHOOK_URL:
        rec.push_status = "skipped"
        rec.push_error = "DINGTALK_WEBHOOK_URL 未配置"
        await repo.update_visitor(session, rec)
        return rec
    url = (
        _ding_signed_url(settings.DINGTALK_WEBHOOK_URL, settings.DINGTALK_SECRET)
        if settings.DINGTALK_SECRET
        else settings.DINGTALK_WEBHOOK_URL
    )
    body = _build_ding_markdown(rec)
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=body)
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        if resp.status_code == 200 and data.get("errcode", 0) == 0:
            rec.push_status = "success"
            rec.push_error = None
        else:
            rec.push_status = "failed"
            rec.push_error = (data.get("errmsg") or resp.text)[:500]
    except httpx.HTTPError as e:
        rec.push_status = "failed"
        rec.push_error = str(e)[:500]
    await repo.update_visitor(session, rec)
    return rec
