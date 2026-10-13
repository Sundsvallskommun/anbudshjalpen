"""documents and sources: superseded files, extraction version, empty pages, unread files,
the source's question deadline and the checklist's documents digest

Revision ID: d7f3b9c2e1a4
Revises: c9e4a1b7d2f3
Create Date: 2026-10-13 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d7f3b9c2e1a4"
down_revision: str | Sequence[str] | None = "c9e4a1b7d2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Decision 0020 and the data review of 2026-10-12.

    Existing documents get extraction version 1 (the extraction before Word content controls,
    text boxes, footnotes and Excel were read), so `reextract_outdated` reads them again. A
    checklist without `documents_digest` was interpreted from one document, which
    `interpret_changed` treats as outdated when the notice has more.
    """
    op.add_column(
        "documents",
        sa.Column(
            "superseded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "documents",
        sa.Column("extraction_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("documents", sa.Column("empty_pages", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("notices", sa.Column("question_deadline_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "notices",
        sa.Column(
            "unread_files", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"
        ),
    )
    op.add_column("checklists", sa.Column("documents_digest", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("checklists", "documents_digest")
    op.drop_column("notices", "unread_files")
    op.drop_column("notices", "question_deadline_at")
    op.drop_column("documents", "empty_pages")
    op.drop_column("documents", "extraction_version")
    op.drop_column("documents", "superseded_by")
