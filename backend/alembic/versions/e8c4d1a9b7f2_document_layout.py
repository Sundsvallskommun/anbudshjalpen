"""document layout

Revision ID: e8c4d1a9b7f2
Revises: d7f3b9c2e1a4
Create Date: 2026-10-13 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8c4d1a9b7f2"
down_revision: str | Sequence[str] | None = "d7f3b9c2e1a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """How a document was produced, when it matters for reading it ("eavrop" for e-Avrop's exports).

    Stored documents get it when `reextract_outdated` reads them again.
    """
    op.add_column("documents", sa.Column("layout", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "layout")
