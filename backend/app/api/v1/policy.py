"""制度万事通（policy）API：上传 / 问答 / 文件管理。"""
from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status

from app.ai.chains.policy_rag import answer_question
from app.api.deps import SessionDep
from app.core.config import settings
from app.repositories.policy import (
    delete_knowledge_file,
    get_knowledge_file,
    list_categories_with_file_count,
    list_knowledge_files,
)
from app.schemas.policy import (
    AskRequest,
    AskResponse,
    CategoryItem,
    KnowledgeFileRead,
    QuickQuestion,
)
from app.services.policy_service import ingest_markdown_file

router = APIRouter(prefix="/policy", tags=["policy"])
log = structlog.get_logger(__name__)

_ALLOWED_SUFFIX = {".md", ".markdown"}


@router.post(
    "/files",
    response_model=KnowledgeFileRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_policy_file(
    session: SessionDep,
    file: UploadFile = File(..., description="制度文档；当前仅支持 Markdown"),
    category: str = Form(..., min_length=1, max_length=64),
    access_level: str = Form("public"),
    name: str | None = Form(default=None, description="缺省取上传文件名"),
) -> KnowledgeFileRead:
    """上传制度文件并触发同步入库（切分 → embedding → 存 chunk）。"""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_SUFFIX:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"暂仅支持 Markdown 文件（允许后缀：{sorted(_ALLOWED_SUFFIX)}）",
        )

    upload_dir = Path(settings.POLICY_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    saved_name = f"{uuid4().hex}{suffix}"
    target = upload_dir / saved_name

    payload = await file.read()
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="文件内容为空"
        )
    target.write_bytes(payload)

    display_name = name or file.filename or saved_name
    try:
        file_id = await ingest_markdown_file(
            session,
            file_path=target,
            name=display_name,
            category=category,
            access_level=access_level,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("policy.upload.ingest_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"入库失败：{exc.__class__.__name__}",
        ) from exc

    record = await get_knowledge_file(session, file_id)
    if record is None:  # 理论不应发生
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="入库后未能加载文件记录",
        )
    return KnowledgeFileRead.model_validate(record)


@router.post("/chat", response_model=AskResponse)
async def chat_with_policy(
    session: SessionDep,
    payload: AskRequest,
) -> AskResponse:
    """基于制度知识库问答（非流式）。"""
    return await answer_question(
        session,
        question=payload.question,
        category=payload.category,
        top_k=payload.top_k,
    )


@router.get("/files", response_model=list[KnowledgeFileRead])
async def list_files(
    session: SessionDep,
    category: str | None = Query(default=None, description="按分类过滤"),
    only_ready: bool = Query(default=False, description="仅返回 ready 状态"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[KnowledgeFileRead]:
    files = await list_knowledge_files(
        session,
        category=category,
        status_in=["ready"] if only_ready else None,
        limit=limit,
        offset=offset,
    )
    return [KnowledgeFileRead.model_validate(f) for f in files]


@router.get("/files/{file_id}", response_model=KnowledgeFileRead)
async def get_file(session: SessionDep, file_id: UUID) -> KnowledgeFileRead:
    record = await get_knowledge_file(session, file_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在"
        )
    return KnowledgeFileRead.model_validate(record)


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(session: SessionDep, file_id: UUID) -> None:
    """删除文件 + 全部 chunk + 物理文件（best-effort）。"""
    record = await delete_knowledge_file(session, file_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在"
        )
    await session.commit()
    physical = Path(record.file_path)
    if physical.is_file():
        try:
            physical.unlink()
        except OSError as exc:
            log.warning(
                "policy.delete.unlink_failed",
                file_id=str(file_id),
                path=str(physical),
                error=str(exc),
            )


@router.get("/categories", response_model=list[CategoryItem])
async def list_categories(session: SessionDep) -> list[CategoryItem]:
    rows = await list_categories_with_file_count(session)
    return [CategoryItem(category=c, file_count=n) for c, n in rows]


@router.get("/quick-questions", response_model=list[QuickQuestion])
async def list_quick_questions(
    category: str | None = Query(default=None),
) -> list[QuickQuestion]:
    """常用问题（MVP：硬编码；后续可改为 DB / 配置文件驱动）。"""
    presets: list[QuickQuestion] = [
        QuickQuestion(text="公司年假多少天？", category="hr"),
        QuickQuestion(text="周末加班工资怎么算？", category="hr"),
        QuickQuestion(text="差旅报销有哪些时间限制？", category="hr"),
        QuickQuestion(text="病假需要哪些证明材料？", category="hr"),
    ]
    if category is None:
        return presets
    return [q for q in presets if q.category == category]
