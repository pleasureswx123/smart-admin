"""Tavily \u8054\u7f51\u641c\u7d22\u5c01\u88c5\uff1a\u5728 key \u4e0d\u5b58\u5728/\u9519\u8bef\u65f6\u964d\u7ea7\u4e3a\u7a7a\u7ed3\u679c\uff0c\u4e0d\u62cb\u51fa\u5f02\u5e38\u3002"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import structlog

from app.core.config import settings

log = structlog.get_logger(__name__)

_INVALID_PLACEHOLDERS = {"", "replace-with-real-key", "your-key", "changeme"}


@dataclass
class SearchHit:
    title: str
    url: str
    content: str
    score: float = 0.0


def _is_valid_key(key: str) -> bool:
    return bool(key) and key.strip() not in _INVALID_PLACEHOLDERS


def _build_query(city: str, activity_types: list[str], purpose: str) -> str:
    type_label = {
        "bbq": "\u70e7\u70e4",
        "outdoor": "\u6237\u5916\u62d3\u5c55",
        "script": "\u5267\u672c\u6740",
        "camping": "\u9732\u8425",
        "indoor": "\u5ba4\u5185\u573a\u9986",
        "party": "\u6d3e\u5bf9\u573a\u5730",
    }
    types = " / ".join(type_label.get(t, t) for t in activity_types)
    return f"{city} \u516c\u53f8\u56e2\u5efa {types} {purpose}"


async def tavily_search(
    *,
    city: str,
    activity_types: list[str],
    purpose: str = "\u63a8\u8350\u573a\u5730",
    max_results: int = 8,
) -> list[SearchHit]:
    """\u8054\u7f51\u641c\u7d22\u573a\u5730/\u9910\u5385\uff1bkey \u672a\u914d\u7f6e\u6216\u8c03\u7528\u5931\u8d25\u8fd4\u56de\u7a7a\u5217\u8868\u3002"""
    key = settings.TAVILY_API_KEY
    if not _is_valid_key(key):
        log.info("tavily.skip", reason="no_api_key")
        return []

    query = _build_query(city, activity_types, purpose)
    try:
        from tavily import TavilyClient

        def _run() -> dict[str, Any]:
            client = TavilyClient(api_key=key)
            return client.search(
                query=query,
                search_depth="basic",
                max_results=max_results,
                include_answer=False,
            )

        raw = await asyncio.to_thread(_run)
    except Exception as exc:  # noqa: BLE001
        log.warning("tavily.search.failed", error=str(exc))
        return []

    results = raw.get("results") or []
    hits: list[SearchHit] = []
    for r in results:
        hits.append(
            SearchHit(
                title=str(r.get("title") or "").strip(),
                url=str(r.get("url") or "").strip(),
                content=str(r.get("content") or "").strip(),
                score=float(r.get("score") or 0.0),
            )
        )
    log.info("tavily.search.ok", query=query, hits=len(hits))
    return hits
