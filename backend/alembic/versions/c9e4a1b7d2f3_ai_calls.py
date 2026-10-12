"""ai calls

Revision ID: c9e4a1b7d2f3
Revises: a7c2e9d4f1b3
Create Date: 2026-10-12 22:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c9e4a1b7d2f3"
down_revision: str | Sequence[str] | None = "a7c2e9d4f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """One row per completed AI call, for the usage and cost statistics on Drift.

    Token counts are nullable because only some engines report them. The notice link is
    cleared, not cascaded, when a notice is deleted: the call still happened and cost.
    """
    op.create_table(
        "ai_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task", sa.String(length=32), nullable=False),
        sa.Column("engine", sa.String(length=32), nullable=False),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column(
            "notice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_calls_created_at", "ai_calls", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_calls_created_at", table_name="ai_calls")
    op.drop_table("ai_calls")
