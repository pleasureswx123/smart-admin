"""一次性脚本：探测火山方舟多模态 embedding 接口的连通性与真实维度。"""
from __future__ import annotations

import asyncio
import json
import sys

import httpx

from app.core.config import settings


async def main() -> int:
    url = f"{settings.ARK_BASE_URL.rstrip('/')}/embeddings/multimodal"
    headers = {
        "Authorization": f"Bearer {settings.ARK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.ARK_VISION_MODEL,
        "input": [{"type": "text", "text": "smart-admin connectivity test"}],
        "encoding_format": "float",
    }

    print(f"POST {url}")
    print(f"model={payload['model']}")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)
    print(f"status={resp.status_code}")

    try:
        data = resp.json()
    except Exception:
        print(resp.text)
        return 1

    if resp.status_code != 200:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 1

    # 兼容两种返回格式：data 是 dict 或 list
    body = data.get("data")
    if isinstance(body, list) and body:
        emb = body[0].get("embedding") or []
    elif isinstance(body, dict):
        emb = body.get("embedding") or []
    else:
        emb = []

    print(f"embedding_dim={len(emb)}")
    print(f"first_5={emb[:5]}")
    print(f"usage={data.get('usage')}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
