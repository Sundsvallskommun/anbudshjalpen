"""interpret backoff, stale matches and per-user match notifications

Revision ID: b7e4c2a91d35
Revises: 5104ffcda9ae
Create Date: 2026-10-05 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e4c2a91d35"
down_revision: str | Sequence[str] | None = "5104ffcda9ae"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Back off failing interpretations, keep match state across prefilter churn, mail each user once."""
    op.add_column(
        "documents", sa.Column("interpret_attempts", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column("documents", sa.Column("interpret_error", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("interpret_retry_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "match_assessments", sa.Column("stale", sa.Boolean(), server_default=sa.false(), nullable=False)
    )
    op.create_table(
        "match_notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("notice_id", sa.UUID(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["notice_id"], ["notices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "notice_id", name="uq_match_notifications_user_notice"),
    )


def downgrade() -> None:
    op.drop_table("match_notifications")
    op.drop_column("match_assessments", "stale")
    op.drop_column("documents", "interpret_retry_at")
    op.drop_column("documents", "interpret_error")
    op.drop_column("documents", "interpret_attempts")
