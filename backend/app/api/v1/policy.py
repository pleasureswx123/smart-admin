"""制度万事通（policy）API：上传文件 + 问答。"""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.ai.chains.policy_rag import answer_question
from app.api.deps import SessionDep
from app.core.config import settings
from app.repositories.policy import get_knowledge_file
from app.schemas.policy import AskRequest, AskResponse, KnowledgeFileRead
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
