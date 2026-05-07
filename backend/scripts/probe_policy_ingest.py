"""端到端冒烟：写一份 .md → ingest → 向量检索 → 打印 top-k。"""
from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete  # noqa: E402

from app.db.session import dispose_engine, get_session_factory, init_engine  # noqa: E402
from app.models.policy import KnowledgeFile, PolicyChunk  # noqa: E402
from app.services.policy_service import (  # noqa: E402
    ingest_markdown_file,
    retrieve_chunks,
)

SAMPLE_MD = """# 员工手册

公司致力于为员工提供良好的工作环境。

## 第1章 总则

本手册适用于全体员工，须人人遵守。

## 第2章 假期管理

### 2.1 年假

入职满一年的员工享有10天带薪年假。年假可以分次使用，但单次不得少于半天。
年假应在当年使用完毕，原则上不得跨年。如因工作原因无法休完，可经主管批准延期最多三个月。

### 2.2 病假

员工因病请假需提供医院证明。病假期间工资按照国家相关规定发放。

## 第3章 薪酬

### 3.1 工资发放

每月15日发放上月工资。如遇节假日顺延至下一工作日。
"""


async def main() -> int:
    init_engine()
    factory = get_session_factory()

    with tempfile.NamedTemporaryFile(
        "w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        f.write(SAMPLE_MD)
        tmp_path = f.name

    try:
        async with factory() as session:
            file_id = await ingest_markdown_file(
                session,
                file_path=tmp_path,
                name="employee_handbook.md",
                category="hr",
            )
            print(f"[ingest] file_id={file_id}")

        async with factory() as session:
            question = "公司年假可以休几天？"
            print(f"[query] {question}")
            results = await retrieve_chunks(
                session, question=question, category="hr", top_k=3
            )
            print(f"[retrieve] got {len(results)} hits")
            for chunk, score in results:
                heading = " > ".join(chunk.chunk_metadata.get("heading_path", []))
                print(
                    f"  score={score:.4f} | idx={chunk.chunk_index} | {heading}\n"
                    f"    {chunk.content[:100]}"
                )
        async with factory() as session:
            await session.execute(
                delete(PolicyChunk).where(PolicyChunk.file_id == file_id)
            )
            await session.execute(
                delete(KnowledgeFile).where(KnowledgeFile.id == file_id)
            )
            await session.commit()
            print(f"[cleanup] removed file + chunks for {file_id}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)
        await dispose_engine()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
