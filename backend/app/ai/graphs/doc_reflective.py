"""公文 Reflective Writer 状态机：writer → auditor →（pass=false→writer, retry≤2）。"""
from __future__ import annotations

import json
import re
import time
from collections.abc import AsyncIterator
from typing import Any, TypedDict
from uuid import uuid4

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from app.ai.ark import get_chat_model

log = structlog.get_logger(__name__)

MAX_AUDIT_ROUNDS = 2  # auditor 不通过时最多重写 2 次

_WRITER_SYSTEM = (
    "你是一名熟悉机关/企业公文写作的助手。请基于给定的模板、主题、关键词、语气，"
    "用 Markdown 输出一份完整、符合规范的公文草稿。\n"
    "硬性要求：1) 保留模板的层级结构（标题、列表）；2) 不出现 `[占位]` 文字；"
    "3) 语气一致；4) 适度展开，不要超过 800 字；5) 不要添加任何解释，只输出公文正文。"
)

_REWRITE_SYSTEM = (
    "你是一名公文修订助手。请根据上一轮草稿与审计意见，输出修订后的完整 Markdown 草稿。"
    "只输出修订后的正文，不要解释。"
)

_AUDITOR_SYSTEM = (
    "你是一名严格的公文审计员。请按以下 4 个维度审查草稿，"
    "对每个维度都给出一个 audit item：\n"
    " - 格式规范（layout）\n - 语气一致性（tone）\n - 敏感词（compliance_words）\n - 合规性（policy）\n"
    "**仅返回 JSON**（不要 ```json 代码块、不要解释）：\n"
    "{\"items\": [{\"type\": \"success|info|warning\", \"title\": \"...\", \"description\": \"...\"}], "
    "\"passed\": true|false}\n"
    "passed=true 当且仅当无任何 type=warning 的项；其它情况 passed=false。"
)


class DocDraftState(TypedDict, total=False):
    type: str
    topic: str
    keywords: list[str]
    tone: str
    template_body: str  # 模板原文
    content: str  # 当前草稿
    audit_items: list[dict]
    passed: bool
    retry_count: int


def _build_writer_user_msg(state: DocDraftState) -> str:
    return (
        f"【类型】{state.get('type','notice')}\n"
        f"【语气】{state.get('tone','formal')}\n"
        f"【主题】{state.get('topic','')}\n"
        f"【关键词】{'、'.join(state.get('keywords') or []) or '（无）'}\n"
        f"【模板】\n{state.get('template_body','')}"
    )


def _build_rewrite_user_msg(state: DocDraftState) -> str:
    items_md = "\n".join(
        f"- [{it.get('type','info')}] {it.get('title','')}：{it.get('description','')}"
        for it in (state.get("audit_items") or [])
    )
    return (
        f"【上一版草稿】\n{state.get('content','')}\n\n"
        f"【审计意见】\n{items_md or '（无）'}\n\n"
        "请输出修订后的完整草稿。"
    )


async def node_writer(state: DocDraftState) -> dict:
    chat = get_chat_model()
    retry = state.get("retry_count", 0)
    if retry == 0:
        messages = [
            SystemMessage(content=_WRITER_SYSTEM),
            HumanMessage(content=_build_writer_user_msg(state)),
        ]
    else:
        messages = [
            SystemMessage(content=_REWRITE_SYSTEM),
            HumanMessage(content=_build_rewrite_user_msg(state)),
        ]
    reply = await chat.ainvoke(messages)
    content = reply.content if isinstance(reply.content, str) else str(reply.content)
    return {"content": content.strip()}


def _parse_audit_json(text: str) -> dict[str, Any]:
    """容错：剥离可能的 ```json 包装与首末杂字符。"""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"items": [], "passed": False}
    items = data.get("items") or []
    norm: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        t = it.get("type", "info")
        if t not in ("success", "info", "warning"):
            t = "info"
        norm.append(
            {
                "type": t,
                "title": str(it.get("title", "")),
                "description": str(it.get("description", "")),
            }
        )
    return {"items": norm, "passed": bool(data.get("passed", False))}


async def node_auditor(state: DocDraftState) -> dict:
    chat = get_chat_model()
    user_msg = (
        f"【类型】{state.get('type','notice')}\n"
        f"【主题】{state.get('topic','')}\n"
        f"【草稿】\n{state.get('content','')}"
    )
    reply = await chat.ainvoke(
        [SystemMessage(content=_AUDITOR_SYSTEM), HumanMessage(content=user_msg)]
    )
    text = reply.content if isinstance(reply.content, str) else str(reply.content)
    parsed = _parse_audit_json(text)
    log.info(
        "doc_reflective.audit",
        passed=parsed["passed"],
        items=len(parsed["items"]),
        retry=state.get("retry_count", 0),
    )
    return {"audit_items": parsed["items"], "passed": parsed["passed"]}



def build_doc_reflective_graph():
    """构建 Reflective Writer 图：writer → auditor →（warning 且 retry<MAX → writer，否则 END）。"""

    def _route_after_audit(state: DocDraftState) -> str:
        if state.get("passed"):
            return "end"
        if state.get("retry_count", 0) >= MAX_AUDIT_ROUNDS:
            return "end"
        return "writer"

    async def _writer(state: DocDraftState) -> dict:
        return await node_writer(state)

    async def _auditor(state: DocDraftState) -> dict:
        update = await node_auditor(state)
        # auditor 走完一轮，retry_count +1（用于下一次 writer 走 rewrite 分支）
        update["retry_count"] = state.get("retry_count", 0) + 1
        return update

    graph = StateGraph(DocDraftState)
    graph.add_node("writer", _writer)
    graph.add_node("auditor", _auditor)
    graph.add_edge(START, "writer")
    graph.add_edge("writer", "auditor")
    graph.add_conditional_edges(
        "auditor",
        _route_after_audit,
        {"writer": "writer", "end": END},
    )
    return graph.compile()


def _build_writer_messages(state: DocDraftState) -> list:
    retry = state.get("retry_count", 0)
    if retry == 0:
        return [
            SystemMessage(content=_WRITER_SYSTEM),
            HumanMessage(content=_build_writer_user_msg(state)),
        ]
    return [
        SystemMessage(content=_REWRITE_SYSTEM),
        HumanMessage(content=_build_rewrite_user_msg(state)),
    ]


async def run_doc_reflective(
    *,
    type_: str,
    topic: str,
    keywords: list[str],
    tone: str,
    template_body: str,
) -> DocDraftState:
    """同步执行：返回最终 state（含 content/audit_items/passed/retry_count）。"""
    graph = build_doc_reflective_graph()
    final_state: DocDraftState = await graph.ainvoke(
        {
            "type": type_,
            "topic": topic,
            "keywords": keywords,
            "tone": tone,
            "template_body": template_body,
            "retry_count": 0,
        }
    )
    return final_state


async def stream_doc_reflective(
    *,
    type_: str,
    topic: str,
    keywords: list[str],
    tone: str,
    template_body: str,
    session_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """流式执行 Reflective Writer。

    事件序列：
      meta -> [stage writer loading -> token* -> stage writer success
               -> stage auditor loading -> audit -> stage auditor (success|retry)]+
            -> done
    """
    started = time.perf_counter()
    graph_run_id = str(uuid4())
    yield "meta", {"session_id": session_id, "graph_run_id": graph_run_id}

    state: DocDraftState = {
        "type": type_,
        "topic": topic,
        "keywords": keywords,
        "tone": tone,
        "template_body": template_body,
        "retry_count": 0,
    }

    while True:
        # writer：流式产出 token
        yield "stage", {"node": "writer", "status": "loading", "round": state["retry_count"] + 1}
        chat = get_chat_model()
        accumulated: list[str] = []
        async for chunk in chat.astream(_build_writer_messages(state)):
            delta = chunk.content if isinstance(chunk.content, str) else str(chunk.content)
            if not delta:
                continue
            accumulated.append(delta)
            yield "token", {"delta": delta}
        state["content"] = "".join(accumulated).strip()
        yield "stage", {"node": "writer", "status": "success", "round": state["retry_count"] + 1}

        # auditor
        yield "stage", {"node": "auditor", "status": "loading", "round": state["retry_count"] + 1}
        update = await node_auditor(state)
        state.update(update)
        state["retry_count"] = state.get("retry_count", 0) + 1
        yield "audit", {
            "items": state.get("audit_items", []),
            "passed": bool(state.get("passed")),
            "round": state["retry_count"],
        }

        if state.get("passed") or state["retry_count"] >= MAX_AUDIT_ROUNDS + 1:
            # passed 或者已用尽重写机会（写过 1 + MAX_AUDIT_ROUNDS 次）
            yield "stage", {
                "node": "auditor",
                "status": "success" if state.get("passed") else "exhausted",
                "round": state["retry_count"],
            }
            break
        yield "stage", {"node": "auditor", "status": "retry", "round": state["retry_count"]}

    log.info(
        "doc_reflective.streamed",
        type=type_,
        rounds=state["retry_count"],
        passed=bool(state.get("passed")),
        content_len=len(state.get("content") or ""),
    )
    yield "done", {
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "passed": bool(state.get("passed")),
        "rounds": state["retry_count"],
    }
