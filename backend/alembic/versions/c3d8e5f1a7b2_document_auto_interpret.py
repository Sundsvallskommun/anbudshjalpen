"""document auto_interpret

Revision ID: c3d8e5f1a7b2
Revises: c3d8f1a6e2b4
Create Date: 2026-10-08 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d8e5f1a7b2"
down_revision: str | Sequence[str] | None = "c3d8f1a6e2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Whether the worker interprets a document on its own (decision 0009).

    Every stored document so far was uploaded on purpose or seeded, so all keep being
    interpreted. Only e-Avrop's attachments are stored with False.
    """
    op.add_column(
        "documents",
        sa.Column("auto_interpret", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("documents", "auto_interpret")
