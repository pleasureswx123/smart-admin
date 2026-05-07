from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import document, health, policy

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(policy.router)
api_router.include_router(document.router)
