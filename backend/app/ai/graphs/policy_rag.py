"""制度万事通 LangGraph 状态机：rewrite → retrieve → evaluate → answer。"""
from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any, Literal, TypedDict
from uuid import UUID, uuid4

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.ark import get_chat_model
from app.models.policy import KnowledgeFile, PolicyChunk
from app.repositories.policy import get_knowledge_file
from app.schemas.policy import AskResponse, Citation
from app.services.policy_service import retrieve_chunks

log = structlog.get_logger(__name__)

_SYSTEM_PROMPT = (
    "你是公司制度万事通助手。请严格依据下方提供的"
    "「制度参考片段」回答员工的问题，"
    "并在引用结论的句子末尾标注来源编号，例如「年假为 10 天[1]」。\n"
    "硬性要求：\n"
    "1. 只使用片段中的信息，不要凭空发挥；\n"
    "2. 若片段不足以回答，请明确告知「目前制度中未找到相关说明」；\n"
    "3. 引用编号须与片段编号一一对应（[1] 对应第 1 段，依此类推）；\n"
    "4. 回答尽量简洁、可执行；如有条件/例外要列明。"
)


class PolicyRagState(TypedDict, total=False):
    """RAG 流程状态；MVP 阶段不做 checkpoint，直接持有 ORM 实例。"""

    question: str
    category: str | None
    top_k: int
    rewritten_question: str
    hits: list[tuple[PolicyChunk, float]]
    file_names: dict[UUID, str]
    retry_count: int
    evaluation: Literal["ok", "retry", "fail"]
    answer: str
    citations: list[Citation]


_NO_HIT_ANSWER = "目前制度中未找到相关说明，请补充更多关键词或扩大检索范围。"


async def node_rewrite(session: AsyncSession, state: PolicyRagState) -> dict:
    # MVP：直传原问题；后续可在此调用 LLM 做关键词提取/消歧。
    return {"rewritten_question": state["question"]}


async def node_retrieve(session: AsyncSession, state: PolicyRagState) -> dict:
    hits = await retrieve_chunks(
        session,
        question=state["rewritten_question"],
        category=state.get("category"),
        top_k=state.get("top_k", 5),
    )
    file_names: dict[UUID, str] = {}
    for chunk, _ in hits:
        if chunk.file_id in file_names:
            continue
        kf: KnowledgeFile | None = await get_knowledge_file(session, chunk.file_id)
        file_names[chunk.file_id] = kf.name if kf else "未知文件"
    return {"hits": hits, "file_names": file_names}


async def node_evaluate(session: AsyncSession, state: PolicyRagState) -> dict:
    # MVP：仅根据是否命中判断；第 3 步引入分数阈值 + retry 逻辑。
    hits = state.get("hits") or []
    return {"evaluation": "ok" if hits else "fail"}


def prepare_answer_messages(state: PolicyRagState) -> list:
    """生成 answer 节点的 LLM messages（流式与非流式共用）。"""
    hits = state.get("hits") or []
    file_names = state.get("file_names") or {}
    context = _format_context(hits, file_names)
    return [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(
            content=f"【用户问题】\n{state['question']}\n\n【制度参考片段】\n{context}"
        ),
    ]


async def node_answer(session: AsyncSession, state: PolicyRagState) -> dict:
    hits = state.get("hits") or []
    file_names = state.get("file_names") or {}
    if not hits:
        return {"answer": _NO_HIT_ANSWER, "citations": []}
    chat = get_chat_model()
    reply = await chat.ainvoke(prepare_answer_messages(state))
    answer = reply.content if isinstance(reply.content, str) else str(reply.content)
    citations = _build_citations(hits, file_names)
    log.info(
        "policy_rag.answered",
        question_len=len(state["question"]),
        hits=len(hits),
        answer_len=len(answer),
    )
    return {"answer": answer, "citations": citations}


def build_policy_rag_graph(session: AsyncSession):
    """构建一次性 graph，闭包绑定 per-request session 到模块级节点函数。"""

    async def _rewrite(state: PolicyRagState) -> dict:
        return await node_rewrite(session, state)

    async def _retrieve(state: PolicyRagState) -> dict:
        return await node_retrieve(session, state)

    async def _evaluate(state: PolicyRagState) -> dict:
        return await node_evaluate(session, state)

    async def _answer(state: PolicyRagState) -> dict:
        return await node_answer(session, state)

    graph = StateGraph(PolicyRagState)
    graph.add_node("rewrite", _rewrite)
    graph.add_node("retrieve", _retrieve)
    graph.add_node("evaluate", _evaluate)
    graph.add_node("answer", _answer)
    graph.add_edge(START, "rewrite")
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("retrieve", "evaluate")
    graph.add_edge("evaluate", "answer")
    graph.add_edge("answer", END)
    return graph.compile()


async def run_policy_rag(
    session: AsyncSession,
    *,
    question: str,
    category: str | None = None,
    top_k: int = 5,
) -> AskResponse:
    """同步执行 graph，返回与原 chain 等价的 AskResponse。"""
    graph = build_policy_rag_graph(session)
    final_state: PolicyRagState = await graph.ainvoke(
        {
            "question": question,
            "category": category,
            "top_k": top_k,
            "retry_count": 0,
        }
    )
    return AskResponse(
        answer=final_state.get("answer", ""),
        citations=final_state.get("citations", []),
    )


async def stream_policy_rag(
    session: AsyncSession,
    *,
    question: str,
    category: str | None = None,
    top_k: int = 5,
    session_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """流式执行 RAG 流程；按设计 §7.1 的事件序列 yield (event, data)。

    事件序列：
      meta -> stage(node, loading|success) * 4 -> token* -> citation* -> done
    """
    started = time.perf_counter()
    graph_run_id = str(uuid4())
    yield "meta", {"session_id": session_id, "graph_run_id": graph_run_id}

    state: PolicyRagState = {
        "question": question,
        "category": category,
        "top_k": top_k,
        "retry_count": 0,
    }

    # 1. rewrite
    yield "stage", {"node": "rewrite", "status": "loading"}
    state.update(await node_rewrite(session, state))
    yield "stage", {"node": "rewrite", "status": "success"}

    # 2. retrieve
    yield "stage", {"node": "retrieve", "status": "loading"}
    state.update(await node_retrieve(session, state))
    yield "stage", {"node": "retrieve", "status": "success"}

    # 3. evaluate
    yield "stage", {"node": "evaluate", "status": "loading"}
    state.update(await node_evaluate(session, state))
    yield "stage", {"node": "evaluate", "status": "success"}

    # 4. answer（流式）
    yield "stage", {"node": "answer", "status": "loading"}
    hits = state.get("hits") or []
    file_names = state.get("file_names") or {}
    if not hits:
        yield "token", {"delta": _NO_HIT_ANSWER}
        yield "stage", {"node": "answer", "status": "success"}
    else:
        chat = get_chat_model()
        accumulated: list[str] = []
        async for chunk in chat.astream(prepare_answer_messages(state)):
            delta = chunk.content if isinstance(chunk.content, str) else str(chunk.content)
            if not delta:
                continue
            accumulated.append(delta)
            yield "token", {"delta": delta}
        log.info(
            "policy_rag.streamed",
            question_len=len(question),
            hits=len(hits),
            answer_len=sum(len(p) for p in accumulated),
        )
        yield "stage", {"node": "answer", "status": "success"}
        for idx, (chunk, score) in enumerate(hits, start=1):
            heading = " > ".join(chunk.chunk_metadata.get("heading_path", []))
            source = file_names.get(chunk.file_id, "未知文件")
            yield "citation", {
                "id": idx,
                "source": f"{source}{(' / ' + heading) if heading else ''}",
                "text": chunk.content,
                "file_id": str(chunk.file_id),
                "page": chunk.page,
                "score": score,
            }

    yield "done", {"elapsed_ms": int((time.perf_counter() - started) * 1000)}


def _format_context(
    hits: list[tuple[PolicyChunk, float]], file_names: dict[UUID, str]
) -> str:
    blocks: list[str] = []
    for idx, (chunk, score) in enumerate(hits, start=1):
        heading = " > ".join(chunk.chunk_metadata.get("heading_path", []))
        source = file_names.get(chunk.file_id, "未知文件")
        header = f"[{idx}] 来源：{source}"
        if heading:
            header += f" / {heading}"
        header += f"（相似度 {score:.3f}）"
        blocks.append(f"{header}\n{chunk.content}")
    return "\n\n".join(blocks)


def _build_citations(
    hits: list[tuple[PolicyChunk, float]], file_names: dict[UUID, str]
) -> list[Citation]:
    return [
        Citation(
            file_id=chunk.file_id,
            file_name=file_names.get(chunk.file_id, "未知文件"),
            chunk_index=chunk.chunk_index,
            page=chunk.page,
            content=chunk.content,
            score=score,
        )
        for chunk, score in hits
    ]
