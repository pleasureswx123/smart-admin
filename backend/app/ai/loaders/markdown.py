"""Markdown 加载器：按标题切分 + 大段再细切，输出可入库的 chunk 列表。"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

# 标题级别 → metadata key（H1/H2/H3 三级足以覆盖典型制度文档）
_HEADERS_TO_SPLIT_ON = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]

# 中文友好的二次切分分隔符（按段落 → 句子 → 标点 → 字符兜底）
_CHINESE_SEPARATORS = ["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""]


@dataclass
class MarkdownChunk:
    """Markdown 切分出的单条 chunk，下游服务转 PolicyChunk 入库。"""

    chunk_index: int
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    page: int | None = None


def load_markdown(
    file_path: str | Path,
    source_name: str | None = None,
    *,
    chunk_size: int = 800,
    chunk_overlap: int = 100,
) -> list[MarkdownChunk]:
    """加载并切分 Markdown 文件。

    Args:
        file_path: 本地 .md 文件路径
        source_name: 来源名（写入 metadata.source_name），缺省取文件名
        chunk_size: 单 chunk 字符上限，超出则二次细切
        chunk_overlap: 二次细切时相邻 chunk 的重叠字符数

    Returns:
        按顺序排列的 MarkdownChunk 列表（chunk_index 从 0 起递增）
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Markdown file not found: {path}")

    text = path.read_text(encoding="utf-8")
    source = source_name or path.name

    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=_HEADERS_TO_SPLIT_ON,
        strip_headers=False,
    )
    header_docs = header_splitter.split_text(text)

    # 若文件无标题，header_splitter 会返回单条整文档
    if not header_docs:
        header_docs = [_FakeDoc(page_content=text, metadata={})]

    char_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=_CHINESE_SEPARATORS,
    )

    chunks: list[MarkdownChunk] = []
    for doc in header_docs:
        heading_path = _build_heading_path(doc.metadata)
        base_meta = {
            "source_name": source,
            "heading_path": heading_path,
        }

        if len(doc.page_content) <= chunk_size:
            chunks.append(
                MarkdownChunk(
                    chunk_index=len(chunks),
                    content=doc.page_content.strip(),
                    metadata=base_meta,
                )
            )
            continue

        # 大段再切，sub-chunk 共享同一 heading_path
        for sub in char_splitter.split_text(doc.page_content):
            sub_text = sub.strip()
            if not sub_text:
                continue
            chunks.append(
                MarkdownChunk(
                    chunk_index=len(chunks),
                    content=sub_text,
                    metadata=dict(base_meta),
                )
            )

    return chunks


def _build_heading_path(metadata: dict[str, Any]) -> list[str]:
    """从 splitter 输出的 metadata（含 h1/h2/h3）拼出有序标题路径。"""
    return [metadata[key] for _, key in _HEADERS_TO_SPLIT_ON if metadata.get(key)]


@dataclass
class _FakeDoc:
    """无标题文档的兜底容器，模拟 langchain Document 的最小协议。"""

    page_content: str
    metadata: dict[str, Any]
