"""lou chapter as text

Revision ID: 5104ffcda9ae
Revises: 62e88337181a
Create Date: 2026-10-05 13:00:26.592899

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5104ffcda9ae"
down_revision: str | Sequence[str] | None = "62e88337181a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """LOU has lettered chapters (19 a kap.), so the chapter is stored as text."""
    op.alter_column(
        "lou_sections",
        "chapter",
        existing_type=sa.INTEGER(),
        type_=sa.String(length=8),
        existing_nullable=False,
        postgresql_using="chapter::text",
    )


def downgrade() -> None:
    """Back to integers; lettered chapters cannot be represented and are removed."""
    op.execute("DELETE FROM lou_sections WHERE chapter !~ '^[0-9]+$'")
    op.alter_column(
        "lou_sections",
        "chapter",
        existing_type=sa.String(length=8),
        type_=sa.INTEGER(),
        existing_nullable=False,
        postgresql_using="chapter::integer",
    )
