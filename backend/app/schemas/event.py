"""\u56e2\u5efa\u7b56\u5212\u5e08\uff08event\uff09API IO \u6a21\u578b\u3002"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ActivityType = Literal["bbq", "outdoor", "script", "camping", "indoor", "party"]


class CityItem(BaseModel):
    code: str
    name: str


class ActivityTypeItem(BaseModel):
    id: ActivityType
    label: str


class PlanRequest(BaseModel):
    """\u751f\u6210\u56e2\u5efa\u65b9\u6848\u8bf7\u6c42\uff08POST /event/plan\uff09\u3002"""

    participants: int = Field(ge=1, le=2000)
    per_capita_budget: int = Field(ge=10, le=10000)
    city: str = Field(min_length=1, max_length=64)
    activity_types: list[ActivityType] = Field(min_length=1, max_length=6)


class ScheduleItem(BaseModel):
    time: str
    activity: str
    location: str = ""


class VenueItem(BaseModel):
    name: str
    address: str = ""
    phone: str = ""
    rating: float = 0.0
    map_url: str = ""


class BudgetLine(BaseModel):
    item: str
    unit_price: int
    quantity: int
    total: int


class PlanDetail(BaseModel):
    """\u5355\u4e2a\u65b9\u6848\u7684\u7ed3\u6784\uff08\u4e0e\u524d\u7aef mockPlan \u5bf9\u9f50\uff09\u3002"""

    name: str
    description: str = ""
    schedule: list[ScheduleItem] = Field(default_factory=list)
    venues: list[VenueItem] = Field(default_factory=list)
    budget: list[BudgetLine] = Field(default_factory=list)
    total: int = 0


class PlanRead(BaseModel):
    """\u65b9\u6848\u8be6\u60c5\u54cd\u5e94\u3002"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    participants: int
    per_capita_budget: int
    city: str
    activity_types: list[str]
    plan_a: dict
    plan_b: dict
    plans: list[dict] = Field(default_factory=list)
    created_at: datetime


class ExportPdfResponse(BaseModel):
    download_url: str
    file_path: str
    size_bytes: int
