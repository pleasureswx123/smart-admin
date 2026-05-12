"""制度万事通（policy）API：上传 / 问答 / 文件管理。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import structlog
from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.ai.graphs.policy_rag import run_policy_rag, stream_policy_rag
from app.api.deps import SessionDep
from app.core.config import settings
from app.repositories.policy import (
    delete_files_by_category,
    delete_knowledge_file,
    get_knowledge_file,
    list_categories_with_file_count,
    list_knowledge_files,
    update_files_category,
    update_knowledge_file,
)
from app.schemas.policy import (
    AskRequest,
    AskResponse,
    CategoryItem,
    CategoryRename,
    KnowledgeFileRead,
    KnowledgeFileUpdate,
    PolicyFileCreate,
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


def _format_sse(event: str, data: dict) -> str:
    """SSE 事件帧：event + 单行 data + 空行。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post(
    "/chat",
    responses={
        200: {
            "content": {
                "application/json": {"schema": AskResponse.model_json_schema()},
                "text/event-stream": {},
            }
        }
    },
)
async def chat_with_policy(
    session: SessionDep,
    payload: AskRequest,
    accept: Annotated[str | None, Header()] = None,
) -> Response:
    """基于制度知识库问答；按 Accept 分流：
    - `text/event-stream` -> SSE（meta/stage/token/citation/done）
    - 其他 -> JSON `AskResponse`
    """
    wants_stream = accept is not None and "text/event-stream" in accept.lower()
    if wants_stream:

        async def event_source():
            async for event_name, data in stream_policy_rag(
                session,
                question=payload.question,
                category=payload.category,
                top_k=payload.top_k,
                session_id=payload.session_id,
            ):
                yield _format_sse(event_name, data)

        return StreamingResponse(
            event_source(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    result = await run_policy_rag(
        session,
        question=payload.question,
        category=payload.category,
        top_k=payload.top_k,
    )
    return Response(
        content=result.model_dump_json(),
        media_type="application/json",
    )


@router.post(
    "/files/text",
    response_model=KnowledgeFileRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_file_from_text(
    session: SessionDep,
    payload: PolicyFileCreate,
) -> KnowledgeFileRead:
    """直接录入 Markdown 内容创建制度文档（自动完成 embedding 入库）。"""
    upload_dir = Path(settings.POLICY_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 确保显示名以 .md 结尾
    display_name = payload.name if payload.name.endswith(".md") else f"{payload.name}.md"
    saved_name = f"{uuid4().hex}.md"
    target = upload_dir / saved_name
    target.write_text(payload.content, encoding="utf-8")

    try:
        file_id = await ingest_markdown_file(
            session,
            file_path=target,
            name=display_name,
            category=payload.category,
            access_level=payload.access_level,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("policy.create_text.ingest_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"入库失败：{exc.__class__.__name__}",
        ) from exc

    record = await get_knowledge_file(session, file_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="入库后未能加载文件记录",
        )
    return KnowledgeFileRead.model_validate(record)


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


@router.get("/files/{file_id}/content", response_class=PlainTextResponse)
async def get_file_content(session: SessionDep, file_id: UUID) -> str:
    """返回制度文档的原始 Markdown 内容（plain text）。"""
    record = await get_knowledge_file(session, file_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在"
        )
    physical = Path(record.file_path)
    if not physical.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="物理文件不存在（可能已被清理）"
        )
    return physical.read_text(encoding="utf-8")


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


@router.patch("/files/{file_id}", response_model=KnowledgeFileRead)
async def update_file_meta(
    session: SessionDep,
    file_id: UUID,
    payload: KnowledgeFileUpdate,
) -> KnowledgeFileRead:
    """更新文件名称或所属分类（不重建 embedding）。"""
    record = await update_knowledge_file(
        session, file_id, name=payload.name, category=payload.category
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    await session.commit()
    return KnowledgeFileRead.model_validate(record)


@router.patch("/categories/{name}", response_model=dict)
async def rename_category(
    session: SessionDep,
    name: str,
    payload: CategoryRename,
) -> dict:
    """重命名分类（批量更新该分类下所有文件记录）。"""
    count = await update_files_category(session, name, payload.new_name)
    if count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在或无文件"
        )
    await session.commit()
    return {"updated": count, "new_name": payload.new_name}


@router.delete("/categories/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(session: SessionDep, name: str) -> None:
    """删除分类及其下所有文件（含 chunks + 物理文件）。"""
    files = await delete_files_by_category(session, name)
    if not files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在或无文件"
        )
    await session.commit()
    for f in files:
        physical = Path(f.file_path)
        if physical.is_file():
            try:
                physical.unlink()
            except OSError as exc:
                log.warning(
                    "policy.delete_category.unlink_failed",
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
        # 人事类
        QuickQuestion(text="公司年假有多少天？", category="人事类"),
        QuickQuestion(text="新员工入职需要提交哪些材料？", category="人事类"),
        QuickQuestion(text="病假工资如何发放？", category="人事类"),
        QuickQuestion(text="加班工资怎么计算？", category="人事类"),
        # 财务类
        QuickQuestion(text="出差住宿费标准是多少？", category="财务类"),
        QuickQuestion(text="差旅报销需要哪些凭证？", category="财务类"),
        QuickQuestion(text="费用报销超过多少需要总经理审批？", category="财务类"),
        QuickQuestion(text="报销申请有时间限制吗？", category="财务类"),
        # 行政类
        QuickQuestion(text="如何预订会议室？", category="行政类"),
        QuickQuestion(text="公务用车如何申请？", category="行政类"),
        QuickQuestion(text="办公用品如何申领？", category="行政类"),
    ]
    if category is None:
        return presets
    return [q for q in presets if q.category == category]
