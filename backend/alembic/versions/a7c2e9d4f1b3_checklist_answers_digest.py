"""checklist answers digest and edited_at

Revision ID: a7c2e9d4f1b3
Revises: f1a2b3c4d5e6
Create Date: 2026-10-12 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c2e9d4f1b3"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Which published answers a checklist was interpreted with, and when inköp last saved it (decision 0018).

    The digest is empty for every existing checklist, which were all interpreted without
    answers: a notice that has answers gets a new interpretation from the next run. A
    draft inköp saved before this column existed has no edited_at; its reviewer note, if
    any, still protects it.
    """
    op.add_column("checklists", sa.Column("answers_digest", sa.String(length=64), nullable=True))
    op.add_column("checklists", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("checklists", "edited_at")
    op.drop_column("checklists", "answers_digest")
