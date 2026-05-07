"""制度万事通 RAG 链：检索 → 拼 prompt → 生成带引用的答案。"""
from __future__ import annotations

from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.ark import get_chat_model
from app.models.policy import KnowledgeFile, PolicyChunk
from app.repositories.policy import get_knowledge_file
from app.schemas.policy import AskResponse, Citation
from app.services.policy_service import retrieve_chunks

logger = structlog.get_logger(__name__)

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


async def answer_question(
    session: AsyncSession,
    *,
    question: str,
    category: str | None = None,
    top_k: int = 5,
) -> AskResponse:
    """问答主入口：返回带引用的答案。"""
    hits = await retrieve_chunks(
        session, question=question, category=category, top_k=top_k
    )
    if not hits:
        return AskResponse(
            answer="目前制度中未找到相关说明，请补充更多关键词或扩大检索范围。",
            citations=[],
        )

    file_names = await _collect_file_names(session, hits)
    context = _format_context(hits, file_names)

    chat = get_chat_model()
    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=f"【用户问题】\n{question}\n\n【制度参考片段】\n{context}"),
    ]
    reply = await chat.ainvoke(messages)
    answer = reply.content if isinstance(reply.content, str) else str(reply.content)

    citations = _build_citations(hits, file_names)
    logger.info(
        "policy_rag.answered",
        question_len=len(question),
        hits=len(hits),
        answer_len=len(answer),
    )
    return AskResponse(answer=answer, citations=citations)


async def _collect_file_names(
    session: AsyncSession, hits: list[tuple[PolicyChunk, float]]
) -> dict[UUID, str]:
    """批量取 chunk 关联的 KnowledgeFile.name，避免每条都查一次。"""
    name_map: dict[UUID, str] = {}
    file_ids = {chunk.file_id for chunk, _ in hits}
    for fid in file_ids:
        kf: KnowledgeFile | None = await get_knowledge_file(session, fid)
        name_map[fid] = kf.name if kf else "未知文件"
    return name_map


def _format_context(
    hits: list[tuple[PolicyChunk, float]], file_names: dict[UUID, str]
) -> str:
    """把 chunk 列表渲染成 LLM 可读的带编号上下文。"""
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
