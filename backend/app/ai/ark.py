from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

import httpx
from langchain_core.embeddings import Embeddings
from langchain_openai import ChatOpenAI

from app.core.config import settings


@lru_cache
def get_chat_model() -> ChatOpenAI:
    """火山方舟 chat 模型（OpenAI 兼容）。

    timeout 从配置读取（默认 120s）：
      - 团建方案生成需输出完整 A/B JSON（通常 40~90s）
      - 公文起草/审计同样需要较长时间
    """
    return ChatOpenAI(
        model=settings.ARK_CHAT_MODEL,
        api_key=settings.ARK_API_KEY,
        base_url=settings.ARK_BASE_URL,
        temperature=0.3,
        timeout=settings.ARK_TIMEOUT,
        max_retries=2,
    )


class ArkMultimodalEmbeddings(Embeddings):
    """火山方舟多模态 embedding 适配器（doubao-embedding-vision 系列）。

    走 `/embeddings/multimodal` 接口；纯文本场景把 input 包成 `[{type:text,text:...}]`。
    """

    def __init__(
        self,
        model: str,
        api_key: str,
        base_url: str,
        timeout: float = 30.0,
        max_retries: int = 2,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.url = f"{base_url.rstrip('/')}/embeddings/multimodal"
        self.timeout = timeout
        self.max_retries = max_retries

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _payload(self, text: str) -> dict[str, Any]:
        return {
            "model": self.model,
            "input": [{"type": "text", "text": text}],
            "encoding_format": "float",
        }

    @staticmethod
    def _extract(data: dict[str, Any]) -> list[float]:
        body = data.get("data")
        if isinstance(body, list) and body:
            return list(body[0].get("embedding") or [])
        if isinstance(body, dict):
            return list(body.get("embedding") or [])
        return []

    async def _aembed_one(self, client: httpx.AsyncClient, text: str) -> list[float]:
        resp = await client.post(self.url, headers=self._headers(), json=self._payload(text))
        resp.raise_for_status()
        return self._extract(resp.json())

    async def aembed_query(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await self._aembed_one(client, text)

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            tasks = [self._aembed_one(client, t) for t in texts]
            return await asyncio.gather(*tasks)

    def embed_query(self, text: str) -> list[float]:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(self.url, headers=self._headers(), json=self._payload(text))
            resp.raise_for_status()
            return self._extract(resp.json())

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_query(t) for t in texts]


@lru_cache
def get_embeddings() -> ArkMultimodalEmbeddings:
    """火山方舟多模态 embedding（doubao-embedding-vision-251215）。"""
    return ArkMultimodalEmbeddings(
        model=settings.ARK_EMBEDDING_MODEL,
        api_key=settings.ARK_API_KEY,
        base_url=settings.ARK_BASE_URL,
    )
