"""policy documents and sections

Revision ID: b2c3d4e5f6a7
Revises: e8c4d1a9b7f2
Create Date: 2026-10-14 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "e8c4d1a9b7f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """The municipality's steering documents for purchasing, section by section (decision 0022).

    Rows are filled from data/styrdokument/ by `load_policies`; nothing is written here.
    The search column mirrors `lou_sections`, so the two can be ranked together.
    """
    op.create_table(
        "policy_documents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("short_title", sa.String(length=64), nullable=False),
        sa.Column("decided_by", sa.Text(), nullable=True),
        sa.Column("decided_on", sa.Date(), nullable=True),
        sa.Column("diarienummer", sa.String(length=64), nullable=True),
        sa.Column("validity", sa.Text(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("retrieved_on", sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_policy_documents_slug"),
    )
    op.create_table(
        "policy_sections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "document_id",
            sa.Integer(),
            sa.ForeignKey("policy_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("number", sa.String(length=16), nullable=False),
        sa.Column("heading", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("sort_key", sa.Integer(), nullable=False),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('swedish', coalesce(heading, '')), 'A') || "
                "setweight(to_tsvector('swedish', coalesce(text, '')), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "number", name="uq_policy_sections_document_number"),
    )
    op.create_index(
        "ix_policy_sections_search", "policy_sections", ["search"], unique=False, postgresql_using="gin"
    )


def downgrade() -> None:
    op.drop_index("ix_policy_sections_search", table_name="policy_sections", postgresql_using="gin")
    op.drop_table("policy_sections")
    op.drop_table("policy_documents")
