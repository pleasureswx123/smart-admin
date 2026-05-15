"""event: add plan options list

Revision ID: add_event_plan_options
Revises: ed4fd74c6ed5
Create Date: 2026-05-15 18:10:00.000000+08:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "add_event_plan_options"
down_revision: Union[str, Sequence[str], None] = "ed4fd74c6ed5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "event_plan",
        sa.Column(
            "plans",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.execute("UPDATE event_plan SET plans = jsonb_build_array(plan_a, plan_b) WHERE plans = '[]'::jsonb")


def downgrade() -> None:
    op.drop_column("event_plan", "plans")
