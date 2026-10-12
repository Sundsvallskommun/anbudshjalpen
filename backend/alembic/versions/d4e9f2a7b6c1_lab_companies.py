"""lab companies

Revision ID: d4e9f2a7b6c1
Revises: c3d8e5f1a7b2
Create Date: 2026-10-12 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e9f2a7b6c1"
down_revision: str | Sequence[str] | None = "c3d8e5f1a7b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Companies that workshop participants create themselves (decision 0010).

    `expires_at` is when the purge job deletes it. Existing companies are the seeded demo ones.
    """
    op.add_column("companies", sa.Column("is_lab", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("companies", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "expires_at")
    op.drop_column("companies", "is_lab")
