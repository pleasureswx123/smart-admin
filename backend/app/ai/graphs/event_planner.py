"""\u56e2\u5efa\u7b56\u5212\u72b6\u6001\u673a\uff1asearch \u2192 enrich \u2192 validate \u2192\uff08\u8d85\u9884\u7b97 \u2192 search \u91cd\u8bd5\uff09\u2192 generate\u3002

\u4e8b\u4ef6\u8282\u70b9\u4e0e\u524d\u7aef event/page.tsx \u7684 initialNodes 3 \u4e2a\u8282\u70b9\u4e25\u683c\u5bf9\u9f50\uff1a
  - id=1 "\u8054\u7f51\u641c\u7d22\u5468\u8fb9\u5730\u70b9"  \u2190 search_node
  - id=2 "\u9884\u7b97\u5339\u914d\u6838\u9a8c"          \u2190 enrich + validate\uff08retry \u65f6 status=retry\uff09
  - id=3 "\u751f\u6210\u884c\u7a0b\u65b9\u6848"          \u2190 generate_node
"""
from __future__ import annotations

import json
import re
import time
from collections.abc import AsyncIterator
from typing import Any, TypedDict
from uuid import uuid4

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.ark import get_chat_model
from app.ai.tools.tavily_search import SearchHit, tavily_search

log = structlog.get_logger(__name__)

MAX_RETRIES = 2
BUDGET_TOLERANCE = 0.10
MIN_BUDGET_RATIO = 0.70
PLAN_COUNT = 5

_ACTIVITY_LABEL = {
    "bbq": "\u70e7\u70e4",
    "outdoor": "\u6237\u5916\u62d3\u5c55",
    "script": "\u5267\u672c\u6740",
    "camping": "\u9732\u8425",
    "indoor": "\u5ba4\u5185\u573a\u9986",
    "party": "\u6d3e\u5bf9\u573a\u5730",
}


class PlannerState(TypedDict, total=False):
    participants: int
    per_capita_budget: int
    city: str
    activity_types: list[str]
    retry_count: int
    feedback: str
    hits: list[dict]
    enriched: list[dict]
    plan_a: dict
    plan_b: dict
    plans: list[dict]
    over_budget: bool
    total_a: int
    total_b: int
    totals: list[int]


# ============================================================
# 1. search_node
# ============================================================
async def node_search(state: PlannerState) -> dict:
    purpose = "\u573a\u5730/\u9910\u5385\u63a8\u8350"
    if state.get("retry_count", 0) > 0:
        purpose = (
            "\u4f4e\u9884\u7b97 \u56e2\u5efa \u573a\u5730 \u9910\u5385 \u516c\u56ed \u684c\u6e38 \u81ea\u52a9\u9910 \u63a8\u8350 "
            + (state.get("feedback") or "")
        )
    hits = await tavily_search(
        city=state["city"],
        activity_types=state["activity_types"],
        purpose=purpose,
        max_results=8,
    )
    payload: list[dict] = [
        {"title": h.title, "url": h.url, "content": h.content, "score": h.score}
        for h in hits
    ]
    return {"hits": payload}


# ============================================================
# 2. enrich_node\uff08\u8fc7\u6ee4\u4f4e\u8d28\u91cf\u3001\u9650\u5236\u6761\u6570\uff09
# ============================================================
async def node_enrich(state: PlannerState) -> dict:
    hits = state.get("hits") or []
    enriched: list[dict] = []
    for h in hits:
        if h.get("score", 0.0) < 0.10:
            continue
        enriched.append(h)
        if len(enriched) >= 6:
            break
    return {"enriched": enriched}


# ============================================================
# 3. validate_node\uff08\u9884\u7b97\u9884\u4f30 + \u5224\u5b9a\u662f\u5426\u8d85\u9884\u7b97\uff09
# ============================================================
async def node_validate(state: PlannerState) -> dict:
    cap = state["participants"] * state["per_capita_budget"]
    enriched = state.get("enriched") or []
    # MVP \u4f30\u7b97\uff1a\u4ec5\u5728\u8fde\u7eed retry \u8fdb\u5165 search_node \u65f6\u624d\u5224\u8d85\u9884\u7b97\u3002
    # \u5b9e\u9645\u9884\u7b97\u5728 generate \u9636\u6bb5\u8ba1\u7b97\uff0c\u8fd9\u91cc\u6839\u636e\u201c\u662f\u5426\u6709\u8db3\u591f\u5019\u9009\u201d\u5224\u5b9a\u3002
    over_budget = False
    feedback = ""
    if not enriched:
        # \u6ca1\u641c\u5230\u4e1c\u897f\uff1a\u4f4e\u4ef7\u7b56\u7565\u6cdb\u68c0\u7d22 / \u5145\u5145\u91cf
        over_budget = True
        feedback = "\u9996\u8f6e\u672a\u68c0\u7d22\u5230\u573a\u5730\uff0c\u62d3\u5bbd\u5173\u952e\u8bcd\u91cd\u8bd5\u3002"
    elif state["retry_count"] == 0 and state["per_capita_budget"] < 80 and len(enriched) < 3:
        over_budget = True
        feedback = (
            f"\u4eba\u5747 {state['per_capita_budget']} \u5143\u504f\u4f4e\u4e14\u5019\u9009\u4e0d\u8db3\uff0c\u9700\u91cd\u65b0\u68c0\u7d22\u66f4\u591a\u4f4e\u9884\u7b97\u573a\u5730\u3002"
        )
    return {"over_budget": over_budget, "feedback": feedback, "_cap": cap}


# ============================================================
# 4. generate_node\uff1a\u7528 LLM \u6839\u636e\u5019\u9009\u751f\u6210\u591a\u4e2a\u65b9\u6848\uff08\u4e25\u683c JSON\uff09
# ============================================================
_GENERATE_SYSTEM = (
    "\u4f60\u662f\u4e00\u540d\u516c\u53f8\u56e2\u5efa\u7b56\u5212\u5e08\u3002\u8bf7\u6839\u636e\u7528\u6237\u4eba\u6570\u3001\u4eba\u5747\u9884\u7b97\u3001\u57ce\u5e02\u3001\u6d3b\u52a8\u7c7b\u578b\u4e0e\u5019\u9009\u573a\u5730\uff0c"
    f"\u751f\u6210 {PLAN_COUNT} \u4e2a\u4e92\u65a5\u7684\u56e2\u5efa\u65b9\u6848\uff0c\u6bcf\u4e2a\u65b9\u6848\u7684\u573a\u5730\u3001\u4e3b\u9898\u6216\u6d3b\u52a8\u7ec4\u5408\u8981\u6709\u660e\u663e\u5dee\u5f02\u3002\n"
    "**\u4ec5\u8fd4\u56de \u4e25\u683c JSON\uff08\u4e0d\u8981 ```json \u5305\u88f9\u3001\u4e0d\u8981\u4efb\u4f55\u89e3\u91ca\uff09**\uff0c\u7ed3\u6784\u4e3a\uff1a\n"
    '{"plans": [<PLAN>, <PLAN>, <PLAN>, <PLAN>, <PLAN>]}\n'
    "PLAN \u7ed3\u6784\uff1a\n"
    '{"name":"\u65b9\u6848\u540d\u79f0","description":"\u4e00\u53e5\u8bdd\u63cf\u8ff0",'
    '"schedule":[{"time":"09:00","activity":"...","location":"..."}],'
    '"venues":[{"name":"...","address":"...","phone":"...","rating":4.6,"map_url":""}],'
    '"budget":[{"item":"...","unit_price":80,"quantity":30,"total":2400}]}\n'
    "\u786c\u6027\u7ea6\u675f\uff1a1) schedule \u4e0d\u5c11\u4e8e 4 \u9879\u3001\u4e0d\u591a\u4e8e 8 \u9879\uff1b2) budget \u603b\u8ba1 \u2264 \u603b\u9884\u7b97\uff08\u4eba\u6570\u00d7\u4eba\u5747\uff09\u4e14 \u2265 \u603b\u9884\u7b97\u00d70.7\uff1b"
    "3) venues \u53ef\u5f15\u7528\u5019\u9009\u4e2d\u7684\u540d\u79f0\u4e0e\u5730\u5740\uff0c\u6ca1\u6709\u624d\u865a\u62df\uff1b4) \u4e0d\u4f7f\u7528\u4efb\u4f55\u5e02\u573a\u63a8\u8350\u8bcd / \u8868\u60c5 / \u5e7f\u544a\u8bed\u3002"
)


def _build_generate_user(state: PlannerState) -> str:
    types = ", ".join(_ACTIVITY_LABEL.get(t, t) for t in state["activity_types"])
    enriched = state.get("enriched") or []
    cands = "\n".join(
        f"- {h.get('title', '')[:60]} | {h.get('content', '')[:100]}" for h in enriched[:6]
    ) or "(\u672a\u68c0\u7d22\u5230\u8054\u7f51\u5019\u9009\uff0c\u8bf7\u6839\u636e\u57ce\u5e02\u4e0e\u6d3b\u52a8\u7c7b\u578b\u865a\u62df\u5408\u7406\u573a\u5730)"
    cap = state["participants"] * state["per_capita_budget"]
    lower = int(cap * MIN_BUDGET_RATIO)
    feedback = state.get("feedback") or "\u65e0"
    return (
        f"\u57ce\u5e02\uff1a{state['city']}\n"
        f"\u4eba\u6570\uff1a{state['participants']}\n"
        f"\u4eba\u5747\u9884\u7b97\uff1a{state['per_capita_budget']} \u5143\n"
        f"\u603b\u9884\u7b97\u4e0a\u9650\uff1a{cap} \u5143\n"
        f"\u5efa\u8bae\u9884\u7b97\u533a\u95f4\uff1a{lower} \u5230 {cap} \u5143\n"
        f"\u6d3b\u52a8\u7c7b\u578b\uff1a{types}\n"
        f"\u4e0a\u4e00\u8f6e\u8c03\u6574\u8981\u6c42\uff1a{feedback}\n"
        f"\u5019\u9009\u573a\u5730/\u9910\u5385\uff1a\n{cands}"
    )


_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _strip_fence(text: str) -> str:
    return _JSON_FENCE.sub("", text).strip()


_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _coerce_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    text = str(value).replace(",", "")
    match = _NUMBER_RE.search(text)
    return int(float(match.group(0))) if match else default


def _coerce_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "")
    match = _NUMBER_RE.search(text)
    return float(match.group(0)) if match else default


def _summarize_candidates(items: list[dict], limit: int) -> list[dict]:
    summary: list[dict] = []
    for item in items[:limit]:
        summary.append(
            {
                "title": str(item.get("title") or "")[:80],
                "content": str(item.get("content") or "")[:160],
                "url": str(item.get("url") or ""),
                "score": round(_coerce_float(item.get("score")), 3),
            }
        )
    return summary


def _recalculate_budget_line(line: dict, target_total: int) -> dict:
    qty = max(_coerce_int(line.get("quantity"), 1), 1)
    total = max(target_total, 0)
    return {
        **line,
        "unit_price": max(round(total / qty), 0),
        "quantity": qty,
        "total": total,
    }


def _fit_plan_budget(plan: dict, *, cap: int, lower: int) -> dict:
    budget = [b for b in plan.get("budget") or [] if isinstance(b, dict)]
    total = sum(_coerce_int(b.get("total")) for b in budget)
    if not budget:
        plan["budget"] = []
        plan["total"] = 0
        return plan

    if total > cap and cap > 0:
        scale = cap / total
        fitted: list[dict] = []
        running = 0
        for index, line in enumerate(budget):
            if index == len(budget) - 1:
                target = max(cap - running, 0)
            else:
                target = max(int(round(_coerce_int(line.get("total")) * scale)), 0)
            fitted_line = _recalculate_budget_line(line, target)
            fitted.append(fitted_line)
            running += fitted_line["total"]
        budget = fitted
        total = sum(_coerce_int(b.get("total")) for b in budget)

    if total < lower and lower <= cap:
        budget.append(
            {
                "item": "机动预算",
                "unit_price": lower - total,
                "quantity": 1,
                "total": lower - total,
            }
        )
        total = lower

    plan["budget"] = budget
    plan["total"] = total
    return plan


def _fallback_plan(index: int, state: PlannerState) -> dict:
    labels = ["轻量拓展", "文化体验", "协作挑战", "休闲团聚", "创意工作坊"]
    label = labels[index % len(labels)]
    return _fit_plan_budget(
        {
            "name": f"{label}方案 {chr(65 + index)}",
            "description": f"面向 {state['participants']} 人的{label}团建备选。",
            "schedule": [
                {"time": "09:00", "activity": "团队集合与出发", "location": "公司指定集合点"},
                {"time": "10:30", "activity": f"{label}主题活动", "location": state["city"]},
                {"time": "12:30", "activity": "团队午餐", "location": "活动周边"},
                {"time": "14:00", "activity": "分组协作与自由交流", "location": "活动场地"},
                {"time": "17:00", "activity": "总结合影并返程", "location": "活动场地"},
            ],
            "venues": [
                {
                    "name": f"{state['city']}{label}场地",
                    "address": f"{state['city']}市内或周边",
                    "phone": "",
                    "rating": 4.5,
                    "map_url": "",
                }
            ],
            "budget": [
                {
                    "item": "活动与餐饮",
                    "unit_price": state["per_capita_budget"],
                    "quantity": state["participants"],
                    "total": state["participants"] * state["per_capita_budget"],
                }
            ],
        },
        cap=state["participants"] * state["per_capita_budget"],
        lower=int(state["participants"] * state["per_capita_budget"] * MIN_BUDGET_RATIO),
    )


def _coerce_generated_plans(data: Any, state: PlannerState) -> list[dict]:
    if not isinstance(data, dict):
        data = {}
    raw_plans = data.get("plans")
    if not isinstance(raw_plans, list):
        raw_plans = [data.get("plan_a"), data.get("plan_b")]
    cap = state["participants"] * state["per_capita_budget"]
    lower = int(cap * MIN_BUDGET_RATIO)
    plans: list[dict] = []
    for index, raw_plan in enumerate(raw_plans[:PLAN_COUNT]):
        plan = _coerce_plan(raw_plan, f"\u65b9\u6848 {chr(65 + index)}")
        plans.append(_fit_plan_budget(plan, cap=cap, lower=lower))
    while len(plans) < PLAN_COUNT:
        plans.append(_fallback_plan(len(plans), state))
    return plans


def _coerce_plan(p: Any, default_name: str) -> dict:
    if not isinstance(p, dict):
        p = {}
    schedule = p.get("schedule") or []
    venues = p.get("venues") or []
    budget = p.get("budget") or []
    norm_schedule = [
        {
            "time": str(s.get("time") or ""),
            "activity": str(s.get("activity") or ""),
            "location": str(s.get("location") or ""),
        }
        for s in schedule if isinstance(s, dict)
    ]
    norm_venues = [
        {
            "name": str(v.get("name") or ""),
            "address": str(v.get("address") or ""),
            "phone": str(v.get("phone") or ""),
            "rating": _coerce_float(v.get("rating")),
            "map_url": str(v.get("map_url") or v.get("mapUrl") or ""),
        }
        for v in venues if isinstance(v, dict)
    ]
    norm_budget: list[dict] = []
    total = 0
    for b in budget:
        if not isinstance(b, dict):
            continue
        unit = _coerce_int(b.get("unit_price") or b.get("unitPrice"))
        qty = _coerce_int(b.get("quantity"))
        line = _coerce_int(b.get("total"), unit * qty)
        total += line
        norm_budget.append(
            {"item": str(b.get("item") or ""), "unit_price": unit, "quantity": qty, "total": line}
        )
    return {
        "name": str(p.get("name") or default_name),
        "description": str(p.get("description") or ""),
        "schedule": norm_schedule,
        "venues": norm_venues,
        "budget": norm_budget,
        "total": total,
    }


async def node_generate(state: PlannerState) -> dict:
    chat = get_chat_model()
    msg = await chat.ainvoke(
        [
            SystemMessage(content=_GENERATE_SYSTEM),
            HumanMessage(content=_build_generate_user(state)),
        ]
    )
    raw = msg.content if isinstance(msg.content, str) else str(msg.content)
    text = _strip_fence(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        log.warning("event.generate.json_parse_failed", text_preview=text[:300])
        data = {}
    plans = _coerce_generated_plans(data, state)
    plan_a = plans[0]
    plan_b = plans[1]
    totals = [p["total"] for p in plans]
    return {
        "plans": plans,
        "plan_a": plan_a,
        "plan_b": plan_b,
        "totals": totals,
        "total_a": plan_a["total"],
        "total_b": plan_b["total"],
    }


def _budget_issue(state: PlannerState) -> str:
    cap = state["participants"] * state["per_capita_budget"]
    lower = int(cap * MIN_BUDGET_RATIO)
    issues: list[str] = []
    totals = state.get("totals") or [state.get("total_a", 0), state.get("total_b", 0)]
    for index, total in enumerate(totals):
        label = chr(65 + index)
        if total > cap:
            issues.append(f"\u65b9\u6848 {label} \u603b\u4ef7 {total} \u5143\u8d85\u8fc7\u9884\u7b97\u4e0a\u9650 {cap} \u5143")
        elif total < lower:
            issues.append(f"\u65b9\u6848 {label} \u603b\u4ef7 {total} \u5143\u4f4e\u4e8e\u5efa\u8bae\u4e0b\u9650 {lower} \u5143")
    return "\uff1b".join(issues)


# ============================================================
# \u6d41\u5f0f\u8fd0\u884c\uff08SSE\uff09\uff1a\u4e0e\u524d\u7aef 3 \u8282\u70b9\u4e25\u683c\u5bf9\u9f50
# ============================================================
async def stream_event_planner(
    *,
    participants: int,
    per_capita_budget: int,
    city: str,
    activity_types: list[str],
    session_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    started = time.perf_counter()
    run_id = str(uuid4())
    yield "meta", {"session_id": session_id, "run_id": run_id}

    state: PlannerState = {
        "participants": participants,
        "per_capita_budget": per_capita_budget,
        "city": city,
        "activity_types": activity_types,
        "retry_count": 0,
        "feedback": "",
    }

    while True:
        # node 1: search
        yield "node", {"id": 1, "title": "\u8054\u7f51\u641c\u7d22\u5468\u8fb9\u5730\u70b9", "status": "loading", "message": "\u6b63\u5728\u641c\u7d22..."}
        s_update = await node_search(state)
        state.update(s_update)
        yield "node", {
            "id": 1,
            "status": "success",
            "message": f"\u5df2\u627e\u5230 {len(state.get('hits') or [])} \u4e2a\u7ed3\u679c",
            "items": _summarize_candidates(state.get("hits") or [], 8),
        }

        # node 2: enrich + validate
        yield "node", {"id": 2, "title": "\u9884\u7b97\u5339\u914d\u6838\u9a8c", "status": "loading", "message": "\u6b63\u5728\u6838\u9a8c\u9884\u7b97..."}
        e_update = await node_enrich(state)
        state.update(e_update)
        v_update = await node_validate(state)
        state.update(v_update)
        if state.get("over_budget") and state["retry_count"] < MAX_RETRIES:
            state["retry_count"] += 1
            yield "node", {
                "id": 2,
                "status": "retry",
                "message": state.get("feedback") or "\u521d\u9009\u65b9\u6848\u8d85\u6807\uff0c\u6b63\u5728\u91cd\u65b0\u89c4\u5212...",
            }
            continue
        yield "node", {
            "id": 2,
            "status": "success",
            "message": f"\u9884\u7b97\u6838\u9a8c\u901a\u8fc7\uff0c\u9009\u4e2d {len(state.get('enriched') or [])} \u4e2a\u5019\u9009",
            "items": _summarize_candidates(state.get("enriched") or [], 6),
        }
        break

    # node 3: generate
    yield "node", {"id": 3, "title": "\u751f\u6210\u884c\u7a0b\u65b9\u6848", "status": "loading", "message": f"\u6b63\u5728\u751f\u6210 {PLAN_COUNT} \u4e2a\u65b9\u6848..."}
    g_update = await node_generate(state)
    state.update(g_update)
    budget_issue = _budget_issue(state)
    if budget_issue:
        raise RuntimeError(f"\u751f\u6210\u65b9\u6848\u672a\u901a\u8fc7\u9884\u7b97\u6821\u9a8c\uff1a{budget_issue}")
    yield "node", {
        "id": 3,
        "status": "success",
        "message": f"\u5df2\u751f\u6210 {len(state.get('plans') or [])} \u4e2a\u65b9\u6848",
    }

    yield "plan", {
        "plans": state.get("plans") or [],
        "plan_a": state.get("plan_a") or {},
        "plan_b": state.get("plan_b") or {},
    }
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "event_planner.streamed",
        city=city,
        retries=state["retry_count"],
        elapsed_ms=elapsed_ms,
        totals=state.get("totals"),
    )
    yield "done", {
        "elapsed_ms": elapsed_ms,
        "retries": state["retry_count"],
        "final_state": {
            "participants": state["participants"],
            "per_capita_budget": state["per_capita_budget"],
            "city": state["city"],
            "activity_types": state["activity_types"],
            "retry_count": state["retry_count"],
            "feedback": state.get("feedback") or "",
            "totals": state.get("totals") or [],
            "total_a": state.get("total_a", 0),
            "total_b": state.get("total_b", 0),
            "hits_count": len(state.get("hits") or []),
            "enriched_count": len(state.get("enriched") or []),
        },
    }


async def run_event_planner(
    *,
    participants: int,
    per_capita_budget: int,
    city: str,
    activity_types: list[str],
) -> dict:
    """\u540c\u6b65\u8fd0\u884c\uff1a\u8fd4\u56de {plans, plan_a, plan_b, retries, final_state, elapsed_ms}\u3002"""
    final: dict = {}
    async for ev, data in stream_event_planner(
        participants=participants,
        per_capita_budget=per_capita_budget,
        city=city,
        activity_types=activity_types,
    ):
        if ev == "plan":
            final["plans"] = data.get("plans") or []
            final["plan_a"] = data["plan_a"]
            final["plan_b"] = data["plan_b"]
        elif ev == "done":
            final["retries"] = data["retries"]
            final["elapsed_ms"] = data["elapsed_ms"]
            final["final_state"] = data["final_state"]
    return final
