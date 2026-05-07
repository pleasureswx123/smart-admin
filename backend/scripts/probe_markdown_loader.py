"""冒烟测试：用一份示例 .md 验证切分逻辑与 metadata 结构。"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.loaders.markdown import load_markdown  # noqa: E402

SAMPLE_MD = """# 员工手册

公司致力于为员工提供良好的工作环境。

## 第1章 总则

本手册适用于全体员工。请所有员工仔细阅读并遵守。

## 第2章 假期管理

### 2.1 年假

入职满一年的员工享有10天带薪年假。年假可以分次使用，但单次不得少于半天。年假应在当年使用完毕，原则上不得跨年。如因工作原因无法休完，可经主管批准延期最多三个月。具体申请流程参见OA系统假期模块。

### 2.2 病假

员工因病请假需提供医院证明。病假期间工资按照国家相关规定发放。

## 第3章 薪酬

### 3.1 工资发放

每月15日发放上月工资。
"""


def main() -> None:
    with tempfile.NamedTemporaryFile(
        "w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        f.write(SAMPLE_MD)
        tmp_path = f.name

    try:
        chunks = load_markdown(
            tmp_path,
            source_name="employee_handbook.md",
            chunk_size=120,
            chunk_overlap=20,
        )
        print(f"total chunks: {len(chunks)}")
        print()
        for c in chunks:
            heading = " > ".join(c.metadata.get("heading_path", []))
            print(f"--- chunk {c.chunk_index} | {heading} ---")
            preview = c.content.replace("\n", " | ")
            print(f"  len={len(c.content)}  meta_keys={list(c.metadata.keys())}")
            print(f"  content: {preview[:140]}")
            print()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
