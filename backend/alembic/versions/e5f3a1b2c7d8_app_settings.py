"""app settings

Revision ID: e5f3a1b2c7d8
Revises: d4e9f2a7b6c1
Create Date: 2026-10-12 17:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5f3a1b2c7d8"
down_revision: str | Sequence[str] | None = "d4e9f2a7b6c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Settings inköp changes at run time (decision 0011): one row per setting, JSON-valued.

    No rows are written here: a missing row means the setting's default, so review before
    publishing stays on for every existing deployment.
    """
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
